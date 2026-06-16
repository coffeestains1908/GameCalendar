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
  History,
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
import surveyEventsQr from '../assets/survey-events-qr.svg';
import { fetchPublicEvents } from '../events.js';
import {
  addDaysToDateKey,
  dateKeyToMalaysiaDate,
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
import { formatPlayerCapacity } from '../playerLimits.js';

const quoteTexts = quotes
  .map((entry) => entry.quote)
  .filter((quote) => typeof quote === 'string' && quote.trim().length > 0);

function getRandomQuote() {
  if (quoteTexts.length === 0) return '';
  return quoteTexts[Math.floor(Math.random() * quoteTexts.length)];
}

const titleText = 'ChRonoC0deX';
const matrixGlyphs = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EVENT_BAR_MIN_HEIGHT = 86;
const EVENT_BAR_GAP = 18;
const EVENT_BAR_TOP_OFFSET = 12;
const EVENT_TITLE_CHARS_PER_LINE = 23;
const EVENT_TITLE_LINE_HEIGHT = 16;
const surveyUrl = 'https://forms.gle/dwf2dZM1mwN7NdDE8';

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

  const calendarLayout = useMemo(() => buildCalendarLayout(events), [events]);
  const monthGroups = useMemo(() => groupMonths(calendarLayout.columns), [calendarLayout.columns]);
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
    if (loading || error || calendarLayout.columns.length === 0) return;
    const board = boardRef.current;
    const todayColumn = board?.querySelector(`[data-date-key="${todayKey}"]`);
    if (!board || !todayColumn) return;
    board.scrollLeft = todayColumn.offsetLeft;
  }, [calendarLayout.columns.length, error, loading, todayKey]);

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

  const togglePopover = (eventEntry, trigger) => {
    const triggerRect = trigger.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - width / 2, 12),
      window.innerWidth - width - 12,
    );
    const top = triggerRect.bottom + 12;

    setActiveSegment((current) => {
      if (current?.key === eventEntry.id) return null;
      return {
        key: eventEntry.id,
        event: eventEntry,
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
          <button className="button compact-action" type="button" onClick={() => navigate('/changelog')}>
            <History size={18} />
            Changelogs
          </button>
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
      {!loading && !error && events.length === 0 && (
        <StatePanel
          icon={<CalendarDays />}
          title="No upcoming events"
          detail="Published ongoing and upcoming events will appear here."
        />
      )}

      {!loading && !error && events.length > 0 && (
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
          <div
            className="calendar-timeline"
            style={{
              '--column-count': calendarLayout.columns.length,
              '--timeline-height': `${calendarLayout.timelineHeight}px`,
            }}
          >
            <div className="calendar-columns">
              {calendarLayout.columns.map(({ dateKey }) => (
                <DateTimeline
                  key={dateKey}
                  dateKey={dateKey}
                  isToday={dateKey === todayKey}
                />
              ))}
            </div>
            <div className="event-layer" aria-label="Scheduled events">
              {calendarLayout.eventBars.map((eventBar) => (
                <EventBar
                  active={activeSegment?.key === eventBar.event.id}
                  eventBar={eventBar}
                  key={eventBar.key}
                  onToggle={togglePopover}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="schedule-cta">
        <div className="survey-cta">
          <a className="survey-cta-button" href={surveyUrl} target="_blank" rel="noreferrer">
            Click here to answer our survey for future events
          </a>
          <div className="survey-qr">
            <span>Alternatively, you can scan this QR Code</span>
            <img src={surveyEventsQr} alt="QR code for the future events survey" />
          </div>
        </div>
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

function DateTimeline({ dateKey, isToday }) {
  return (
    <section className="date-column" data-date-key={dateKey}>
      <div className="date-header">
        <div className={isToday ? "day-header today" : "day-header"}>
          <span>{formatDayLabel(dateKey)}</span>
          <small>{formatWeekdayLabel(dateKey)}</small>
        </div>
      </div>
      <div className="date-column-body" />
    </section>
  );
}

function EventBar({ active, eventBar, onToggle }) {
  const { event, leftDays, topPx, heightPx, fillLeftPercent, fillWidthPercent } = eventBar;
  const colors = segmentColors(event);
  const quickTime = `${formatSegmentTime(event.segmentStart || event.startAt)} - ${formatSegmentTime(event.segmentEnd || event.endAt)}`;
  const eventMeta = [quickTime, event.gameMaster].filter(Boolean).join(' • ');

  return (
    <button
      type="button"
      className="event-bar-button"
      onClick={(clickEvent) => onToggle(event, clickEvent.currentTarget)}
      aria-expanded={active}
      title={event.title + " / " + formatTime(event.startAt) + "-" + formatTime(event.endAt)}
      style={{
        "--event-top": `${topPx}px`,
        "--event-min-height": `${heightPx}px`,
        "--fill-left": fillLeftPercent + "%",
        "--fill-width": fillWidthPercent + "%",
        left: "calc(var(--day-width) * " + leftDays + ")",
        width: "var(--day-width)",
        background: "color-mix(in srgb, " + colors.background + " 18%, #11151d)",
        borderColor: colors.border,
        boxShadow: "0 0 24px " + colors.glow,
      }}
    >
      <span
        className="event-bar-fill"
        style={{ background: colors.background }}
        aria-hidden="true"
      />
      <span className="event-label">
        <span className="event-game">{event.game}</span>
        <span className="event-title">{event.title}</span>
        <span className="event-meta">{eventMeta}</span>
        {event.location && <span className="event-location">📍{event.location}</span>}
      </span>
    </button>
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
            <strong>{formatPlayerCapacity(event.playerCount || 0, event.maxPlayers)}</strong>
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

function buildCalendarLayout(events) {
  const todayKey = formatDateKey(new Date());
  const startKey = addDaysToDateKey(todayKey, -30);
  const defaultEndKey = addDaysToDateKey(todayKey, 60);
  const eventEndKeys = events
    .filter((event) => event.startAt && event.endAt && event.endAt > event.startAt)
    .map((event) => formatDateKey(new Date(event.endAt.getTime() - 1)))
    .sort((a, b) => a.localeCompare(b));
  const lastEventKey = eventEndKeys.length > 0 ? eventEndKeys[eventEndKeys.length - 1] : defaultEndKey;
  const endKey = lastEventKey > defaultEndKey ? lastEventKey : defaultEndKey;
  const columns = [];
  let cursorKey = startKey;

  while (cursorKey <= endKey) {
    columns.push({
      dateKey: cursorKey,
    });
    cursorKey = addDaysToDateKey(cursorKey, 1);
  }

  const eventBars = layoutEventBars(events, startKey, columns.length);
  const timelineHeight = Math.max(
    EVENT_BAR_MIN_HEIGHT + EVENT_BAR_TOP_OFFSET + EVENT_BAR_GAP,
    eventBars.reduce((height, eventBar) => Math.max(height, eventBar.topPx + eventBar.heightPx + EVENT_BAR_GAP), 0),
  );

  return { columns, eventBars, timelineHeight };
}

function layoutEventBars(events, startKey, columnCount) {
  const visibleStart = dateKeyToMalaysiaDate(startKey);
  const visibleEnd = dateKeyToMalaysiaDate(addDaysToDateKey(startKey, columnCount));
  const visibleEndKey = addDaysToDateKey(startKey, columnCount);
  const positionedEvents = events
    .filter((event) => event.startAt && event.endAt && event.endAt > event.startAt)
    .filter((event) => event.endAt > visibleStart && event.startAt < visibleEnd)
    .flatMap((event) => splitEventIntoDateSegments(event))
    .filter((segment) => segment.segmentDateKey >= startKey && segment.segmentDateKey < visibleEndKey)
    .map((segment) => ({
      event: segment,
      key: `${segment.id}-${segment.segmentDateKey}`,
      leftDays: dayOffset(startKey, segment.segmentDateKey),
      fillLeftPercent: segment.leftPercent,
      fillWidthPercent: segment.widthPercent,
      sortStart: Math.max(visibleStart.getTime(), segment.segmentStart.getTime()),
      sortEnd: Math.min(visibleEnd.getTime(), segment.segmentEnd.getTime()),
    }))
    .sort((a, b) => {
      if (a.event.segmentDateKey !== b.event.segmentDateKey) {
        return a.event.segmentDateKey.localeCompare(b.event.segmentDateKey);
      }
      if (a.sortStart !== b.sortStart) return a.sortStart - b.sortStart;
      if (a.sortEnd !== b.sortEnd) return a.sortEnd - b.sortEnd;
      return a.event.title.localeCompare(b.event.title);
    });

  const dayHeights = new Map();
  return positionedEvents.map((entry) => {
    const currentHeight = dayHeights.get(entry.event.segmentDateKey) || 0;
    const heightPx = estimateEventBarHeight(entry.event);
    dayHeights.set(entry.event.segmentDateKey, currentHeight + heightPx + EVENT_BAR_GAP);
    return {
      ...entry,
      topPx: EVENT_BAR_TOP_OFFSET + currentHeight,
      heightPx,
    };
  });
}

function dayOffset(startKey, dateKey) {
  return Math.round((dateKeyToMalaysiaDate(dateKey) - dateKeyToMalaysiaDate(startKey)) / MS_PER_DAY);
}

function formatPlayerCount(count) {
  return count + " " + (count === 1 ? "player" : "players") + " joining";
}

function formatSegmentTime(date) {
  const parts = new Intl.DateTimeFormat('en-MY', {
    timeZone: MALAYSIA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  const dayPeriod = (parts.find((part) => part.type === 'dayPeriod')?.value || '').toLowerCase();
  return minute === '00' ? `${hour}${dayPeriod}` : `${hour}.${minute}${dayPeriod}`;
}

function estimateEventBarHeight(event) {
  const titleLines = Math.max(1, Math.ceil((event.title || '').length / EVENT_TITLE_CHARS_PER_LINE));
  return EVENT_BAR_MIN_HEIGHT + Math.max(0, titleLines - 2) * EVENT_TITLE_LINE_HEIGHT;
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
