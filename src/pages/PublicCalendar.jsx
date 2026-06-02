import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Gamepad2,
  Loader2,
  MapPin,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isAllowedAdmin } from '../firebase.js';
import { toUserError } from '../errors.js';
import quotes from '../data/quotes.json';
import { fetchPublicEvents } from '../events.js';
import {
  addDaysToDateKey,
  formatCompactDate,
  formatDateKey,
  formatDayLabel,
  formatMonthName,
  formatTime,
  formatWeekdayLabel,
  gameColor,
  MALAYSIA_TIME_ZONE,
  splitEventIntoDateSegments,
} from '../time.js';
import { StatePanel, WarpChargeIndicator } from '../components/AppChrome.jsx';
import { buildGoogleCalendarUrl, EventDetails } from './EventInfoPage.jsx';

const quoteTexts = quotes
  .map((entry) => entry.quote)
  .filter((quote) => typeof quote === 'string' && quote.trim().length > 0);

function getRandomQuote() {
  if (quoteTexts.length === 0) return '';
  return quoteTexts[Math.floor(Math.random() * quoteTexts.length)];
}

const titleText = 'ChRonoC0deX';
const matrixGlyphs = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getTypingErrorGlyph(expectedCharacter) {
  let glyph = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  while (glyph === expectedCharacter) {
    glyph = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  }
  return glyph;
}

function createMatrixTitleFrame(text) {
  const characters = [...text];
  const swapCount = Math.max(1, Math.ceil(characters.length * 0.28));
  const swappedIndexes = new Set();

  while (swappedIndexes.size < swapCount) {
    swappedIndexes.add(Math.floor(Math.random() * characters.length));
  }

  swappedIndexes.forEach((index) => {
    characters[index] = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  });

  return characters.join('');
}

export function PublicCalendar({ navigate }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSegment, setActiveSegment] = useState(null);
  const [user, setUser] = useState(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const boardRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await fetchPublicEvents());
    } catch (err) {
      setError(toUserError(err, 'Could not load events'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      const allowed = await isAllowedAdmin(user);
      if (mounted) setViewerIsAdmin(allowed);
    }
    checkAdmin();
    return () => {
      mounted = false;
    };
  }, [user]);

  const grouped = useMemo(() => groupSegments(events), [events]);
  const monthGroups = useMemo(() => groupMonths(grouped), [grouped]);
  const [activeQuote, setActiveQuote] = useState(getRandomQuote);
  const quoteRotationTimerRef = useRef(0);
  const scheduleNextQuote = useCallback(() => {
    window.clearTimeout(quoteRotationTimerRef.current);
    if (quoteTexts.length === 0) return;
    quoteRotationTimerRef.current = window.setTimeout(() => setActiveQuote(getRandomQuote()), 15_000);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(quoteRotationTimerRef.current);
  }, []);
  const todayKey = formatDateKey(new Date());

  useEffect(() => {
    if (loading || error || grouped.length === 0) return;
    const board = boardRef.current;
    const todayColumn = board?.querySelector(`[data-date-key="${todayKey}"]`);
    if (!board || !todayColumn) return;
    board.scrollLeft = todayColumn.offsetLeft;
  }, [error, grouped.length, loading, todayKey]);

  useEffect(() => {
    if (!activeSegment) return undefined;

    const closeOnKey = (event) => {
      if (event.key === 'Escape') setActiveSegment(null);
    };

    const closeOnPointerDown = (event) => {
      if (event.target.closest('.event-popover, .event-bar-button')) return;
      setActiveSegment(null);
    };
    const closeOnBlur = () => setActiveSegment(null);

    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('blur', closeOnBlur);
    document.addEventListener('pointerdown', closeOnPointerDown);
    return () => {
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('blur', closeOnBlur);
      document.removeEventListener('pointerdown', closeOnPointerDown);
    };
  }, [activeSegment]);

  const togglePopover = (segment, trigger) => {
    const segmentKey = `${segment.id}-${segment.segmentDateKey}`;
    const triggerRect = trigger.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - width / 2, 12),
      window.innerWidth - width - 12,
    );
    const top = triggerRect.bottom + 12;

    setActiveSegment((current) => {
      if (current?.key === segmentKey) return null;
      return {
        key: segmentKey,
        event: segment,
        position: { left, top, width },
      };
    });
  };

  const startPan = (event) => {
    if (event.button !== 0 || event.target.closest('.event-bar-button, .event-popover')) return;
    const board = boardRef.current;
    if (!board) return;
    setActiveSegment(null);
    event.preventDefault();
    dragRef.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: board.scrollLeft,
    };
    board.classList.add('is-panning');
    board.setPointerCapture(event.pointerId);
  };

  const pan = (event) => {
    const board = boardRef.current;
    if (!board || !dragRef.current.active) return;
    board.scrollLeft = dragRef.current.scrollLeft - (event.clientX - dragRef.current.startX);
  };

  const stopPan = (event) => {
    const board = boardRef.current;
    if (!board || !dragRef.current.active) return;
    dragRef.current.active = false;
    board.classList.remove('is-panning');
    if (board.hasPointerCapture(event.pointerId)) {
      board.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <main className="public-shell">
      <header className="topbar">
        <div className="topbar-title">
          <WarpChargeIndicator />
          <MatrixTitle text={titleText} />
          <p className="eyebrow">Malaysia time / 30 days back and 60 ahead</p>
          {activeQuote && <QuoteBanner quote={activeQuote} onTypingComplete={scheduleNextQuote} />}
        </div>
        <div className="topbar-actions">
          <button className="button secondary compact-action" type="button" onClick={() => navigate('/gm')}>
            <UserRound size={18} />
            GM Login
          </button>
          <button className="button secondary compact-action" type="button" onClick={loadEvents} title="Refresh events">
            <RefreshCw size={18} />
            Refresh Calendar
          </button>
        </div>
      </header>

      {loading && <StatePanel icon={<Loader2 className="spin" />} title="Loading events" />}
      {error && (
        <StatePanel
          icon={<CalendarDays />}
          title={error.title}
          detail={error.detail}
          actionUrl={error.actionUrl}
          actionLabel="Open Firebase index"
        />
      )}
      {!loading && !error && grouped.length === 0 && (
        <StatePanel
          icon={<CalendarDays />}
          title="No upcoming events"
          detail="Published ongoing and upcoming events will appear here."
        />
      )}

      {!loading && !error && grouped.length > 0 && (
        <section
          ref={boardRef}
          className="calendar-board"
          aria-label="Event calendar by date"
          onPointerDown={startPan}
          onPointerMove={pan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onPointerLeave={stopPan}
          onScroll={() => setActiveSegment(null)}
        >
          <div className="calendar-month-row">
            {monthGroups.map((month) => (
              <div
                className="month-span"
                key={month.key}
                style={{ width: `calc(var(--day-width) * ${month.days})` }}
              >
                <div className="month-header">{month.label}</div>
              </div>
            ))}
          </div>
          <div className="calendar-columns">
            {grouped.map(({ dateKey, segments }) => (
              <DateTimeline
                key={dateKey}
                dateKey={dateKey}
                isToday={dateKey === todayKey}
                segments={segments}
                activeSegmentKey={activeSegment?.key}
                onToggle={togglePopover}
              />
            ))}
          </div>
        </section>
      )}

      <div className="schedule-cta">
        <span>Want to schedule in your game? Send me a</span>
        <a href="https://wa.me/60102083434" target="_blank" rel="noreferrer">WhatsApp</a>
        <span>!</span>
      </div>

      {activeSegment && (
        <>
          <div className="event-popover-backdrop" />
          <EventPopover
            event={activeSegment.event}
            position={activeSegment.position}
            canEdit={viewerIsAdmin}
            onEdit={() => navigate(`/admin?edit=${encodeURIComponent(activeSegment.event.id)}`)}
            onClose={() => setActiveSegment(null)}
          />
        </>
      )}

    </main>
  );
}

function MatrixTitle({ text }) {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return undefined;

    let restoreTimeout = 0;
    const animate = () => {
      setDisplayText(createMatrixTitleFrame(text));
      window.clearTimeout(restoreTimeout);
      restoreTimeout = window.setTimeout(() => setDisplayText(text), 450);
    };

    const firstRun = window.setTimeout(animate, 2_000);
    const interval = window.setInterval(animate, 6_000);

    return () => {
      window.clearTimeout(firstRun);
      window.clearTimeout(restoreTimeout);
      window.clearInterval(interval);
    };
  }, [text]);

  return (
    <h1 className="matrix-title" aria-label={text}>
      {[...displayText].map((character, index) => (
        <span
          aria-hidden="true"
          className={character === text[index] ? undefined : "matrix-title-glitch"}
          key={index}
        >
          {character}
        </span>
      ))}
    </h1>
  );
}

function QuoteBanner({ quote, onTypingComplete }) {
  const [displayQuote, setDisplayQuote] = useState(quote);
  const [typing, setTyping] = useState(false);
  const [selected, setSelected] = useState(false);
  const initialTypingRef = useRef(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      initialTypingRef.current = false;
      setDisplayQuote(quote);
      setTyping(false);
      setSelected(false);
      onTypingComplete();
      return undefined;
    }

    let index = 0;
    let timeout = 0;
    let fixingMistake = false;

    const clearAndStartTyping = () => {
      initialTypingRef.current = false;
      setSelected(false);
      setDisplayQuote("");
      setTyping(true);
      timeout = window.setTimeout(typeNext, 2_000);
    };

    const typeNext = () => {
      if (index >= quote.length) {
        setTyping(false);
        onTypingComplete();
        return;
      }

      const nextCharacter = quote[index];
      const canMistype = !fixingMistake && nextCharacter !== " " && nextCharacter !== "\n" && quote.length > 18;

      if (canMistype && Math.random() < 0.11) {
        fixingMistake = true;
        setDisplayQuote(`${quote.slice(0, index)}${getTypingErrorGlyph(nextCharacter)}`);
        timeout = window.setTimeout(() => {
          setDisplayQuote(quote.slice(0, index));
          timeout = window.setTimeout(typeNext, 70);
        }, 150);
        return;
      }

      fixingMistake = false;
      index += 1;
      setDisplayQuote(quote.slice(0, index));
      timeout = window.setTimeout(typeNext, 22 + Math.random() * 18);
    };

    if (initialTypingRef.current) {
      clearAndStartTyping();
    } else {
      setTyping(false);
      setSelected(true);
      timeout = window.setTimeout(clearAndStartTyping, 650);
    }

    return () => window.clearTimeout(timeout);
  }, [onTypingComplete, quote]);

  const quoteHtml = selected ? `<span class="quote-selected">${displayQuote}</span>` : displayQuote;
  const caretHtml = selected ? "" : `<span class="quote-caret" aria-hidden="true">|</span>`;

  return (
    <p
      className={typing ? "quote-banner is-typing" : "quote-banner"}
      aria-label="Random quote"
      dangerouslySetInnerHTML={{ __html: `&ldquo;${quoteHtml}${caretHtml}&rdquo;` }}
    />
  );
}

function DateTimeline({ dateKey, isToday, segments, activeSegmentKey, onToggle }) {
  return (
    <section className="date-column" data-date-key={dateKey}>
      <div className="date-header">
        <div className={isToday ? 'day-header today' : 'day-header'}>
          <span>{formatDayLabel(dateKey)}</span>
          <small>{formatWeekdayLabel(dateKey)}</small>
        </div>
      </div>
      <div className="date-column-body">
        <div className="event-stack">
          {segments.map((segment) => {
            const colors = segmentColors(segment);
            const segmentKey = `${segment.id}-${segment.segmentDateKey}`;
            return (
              <article className="event-row" key={segmentKey}>
                <button
                  type="button"
                  className="event-bar-button"
                  onClick={(event) => onToggle(segment, event.currentTarget)}
                  aria-expanded={activeSegmentKey === segmentKey}
                  title={`${segment.title} / ${formatTime(segment.segmentStart)}-${formatTime(segment.segmentEnd)}`}
                  style={{
                    left: `${segment.leftPercent}%`,
                    width: `${segment.widthPercent}%`,
                    background: colors.background,
                    borderColor: colors.border,
                    boxShadow: `0 0 24px ${colors.glow}`,
                  }}
                >
                  <span className="event-label">
                    <span className="event-title">{truncateEventTitle(segment.title)}</span>
                    <small>{segment.game}{segment.inviteEnabled === true ? " / " + formatPlayerCount(segment.playerCount || 0) : ""}</small>
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EventPopover({ event, position, canEdit, onEdit, onClose }) {
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(window.matchMedia('(max-width: 860px)').matches);
  const shareUrl = `${window.location.origin}/event/${encodeURIComponent(event.id)}`;
  const googleCalendarUrl = buildGoogleCalendarUrl(event, shareUrl);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <aside
      className="event-popover"
      role="dialog"
      aria-label={`${event.title} details`}
      style={isMobile ? undefined : {
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
      }}
    >
      <div className="popover-heading">
        <div>
          <p className="eyebrow">{event.game}</p>
          <h2>{event.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Close details">
          <X size={17} />
        </button>
      </div>
      {event.inviteEnabled === true && (
        <div className="popover-time">
          <UserRound size={18} />
          <div>
            <strong>{formatPlayerCount(event.playerCount || 0)}</strong>
            <span>Joined players</span>
          </div>
        </div>
      )}
      <div className="popover-time">
        <Clock3 size={18} />
        <div>
          <strong>{formatTime(event.startAt)} - {formatTime(event.endAt)}</strong>
          <span>{formatCompactDate(event.startAt)} - {formatCompactDate(event.endAt)}</span>
        </div>
      </div>
      <div className="popover-actions">
        {canEdit && (
          <button className="button secondary" type="button" onClick={onEdit}>
            <Edit3 size={16} />
            Edit
          </button>
        )}
        <button className="button secondary compact-action" type="button" onClick={copyLink}>
          <Copy size={16} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a className="button compact-action" href={googleCalendarUrl} target="_blank" rel="noreferrer">
          <CalendarPlus size={16} />
          Add to Google Calendar
        </a>
      </div>
      <EventDetails event={event} />
    </aside>
  );
}

function groupSegments(events) {
  const segments = events.flatMap(splitEventIntoDateSegments);
  const groups = new Map();
  segments.forEach((segment) => {
    if (!groups.has(segment.segmentDateKey)) groups.set(segment.segmentDateKey, []);
    groups.get(segment.segmentDateKey).push(segment);
  });

  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const todayKey = formatDateKey(new Date());
  const startKey = addDaysToDateKey(todayKey, -30);
  const defaultEndKey = addDaysToDateKey(todayKey, 60);
  const lastEventKey = sortedKeys.length > 0 ? addDaysToDateKey(sortedKeys[sortedKeys.length - 1], 1) : defaultEndKey;
  const endKey = lastEventKey > defaultEndKey ? lastEventKey : defaultEndKey;
  const columns = [];
  let cursorKey = startKey;

  while (cursorKey <= endKey) {
    const dateSegments = groups.get(cursorKey) || [];
    columns.push({
      dateKey: cursorKey,
      segments: dateSegments.sort((a, b) => a.segmentStart - b.segmentStart),
    });
    cursorKey = addDaysToDateKey(cursorKey, 1);
  }

  return columns;
}

function formatPlayerCount(count) {
  return count + " " + (count === 1 ? "player" : "players") + " joining";
}

function truncateEventTitle(title) {
  if (title.length <= 15) return title;
  return `${title.slice(0, 12)}...`;
}

function segmentColors(segment) {
  if (!segment.gameColor) return gameColor(segment.game);
  return {
    background: segment.gameColor,
    border: segment.gameColor,
    glow: `${segment.gameColor}55`,
  };
}

function groupMonths(columns) {
  return columns.reduce((months, column) => {
    const key = column.dateKey.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) {
      last.days += 1;
      return months;
    }

    months.push({
      key,
      label: formatMonthName(column.dateKey),
      days: 1,
    });
    return months;
  }, []);
}
