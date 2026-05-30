import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  X,
  Edit3,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseReady, isAllowedAdmin } from './firebase.js';
import { toInlineError, toUserError } from './errors.js';
import quotes from './data/quotes.json';
import {
  createEvent,
  createGame,
  createGameMaster,
  deleteEvent,
  deleteGame,
  fetchAdminEvents,
  fetchEvent,
  fetchGameMasters,
  fetchGames,
  fetchPublicEvents,
  updateEvent,
  updateEventPublished,
} from './events.js';
import {
  formatDateTime,
  formatCompactDate,
  formatDayLabel,
  formatMonthName,
  formatTime,
  formatWeekdayLabel,
  gameColor,
  getEventStatus,
  addDaysToDateKey,
  formatDateKey,
  MALAYSIA_TIME_ZONE,
  malaysiaInputToDate,
  splitEventIntoDateSegments,
  toInputDate,
  toInputTime,
} from './time.js';

const emptyForm = {
  title: '',
  gameMaster: '',
  game: '',
  gameColor: '#2f6df6',
  location: '',
  description: '',
  date: toInputDate(new Date()),
  startTime: '20:00',
  endDate: toInputDate(new Date()),
  endTime: '22:00',
  published: true,
};

const quoteTexts = quotes
  .map((entry) => entry.quote)
  .filter((quote) => typeof quote === 'string' && quote.trim().length > 0);

function getRandomQuote() {
  if (quoteTexts.length === 0) return '';
  return quoteTexts[Math.floor(Math.random() * quoteTexts.length)];
}

function getTypingErrorGlyph(expectedCharacter) {
  let glyph = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  while (glyph === expectedCharacter) {
    glyph = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  }
  return glyph;
}
const titleText = 'ChRonoC0deX';
const matrixGlyphs = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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

const googleDatePartFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MALAYSIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatGoogleCalendarDate(date) {
  const parts = googleDatePartFormatter.formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '00';
  return `${part('year')}${part('month')}${part('day')}T${part('hour')}${part('minute')}${part('second')}`;
}

function buildGoogleCalendarUrl(event, shareUrl) {
  const details = [event.description, '', `Event link: ${shareUrl}`].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleCalendarDate(event.startAt)}/${formatGoogleCalendarDate(event.endAt)}`,
    ctz: MALAYSIA_TIME_ZONE,
    details,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  if (!firebaseReady) {
    return (
      <>
        <StarWarpBackground />
        <div className="app-content">
          <SetupMissing />
          <CreditFooter />
        </div>
      </>
    );
  }

  let page;
  if (route.startsWith('/event/')) {
    page = <EventInfoPage eventId={decodeURIComponent(route.replace('/event/', ''))} navigate={navigate} />;
  } else {
    page = route.startsWith('/admin') ? (
      <AdminView navigate={navigate} />
    ) : (
      <PublicCalendar navigate={navigate} />
    );
  }

  return (
    <>
      <StarWarpBackground />
      <div className="app-content">
        {page}
        <CreditFooter />
      </div>
    </>
  );
}

function StarWarpBackground() {
  const canvasRef = useRef(null);
  const warpDurationMin = 5000
  const warpDuratioMax = 10_000

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const center = { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    const stars = [];
    let width = 0;
    let height = 0;
    let maxRadius = 0;
    let animationFrame = 0;
    let lastTime = performance.now();
    let hyperspaceStart = 0;
    let hyperspaceEnd = 0;
    let hyperspaceEndTimeout = 0;
    const hyperspaceFlashDuration = 720;

    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const easeInOut = (value) => value * value * (3 - 2 * value);

    const startHyperspace = () => {
      const now = performance.now();
      hyperspaceStart = now;
      hyperspaceEnd = hyperspaceStart + randomBetween(warpDurationMin, warpDuratioMax);
      window.dispatchEvent(new CustomEvent("hyperspace-warp-start", { detail: { duration: hyperspaceEnd - hyperspaceStart } }));
      window.clearTimeout(hyperspaceEndTimeout);
      hyperspaceEndTimeout = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("hyperspace-warp-end"));
      }, hyperspaceEnd - hyperspaceStart);
    };

    const getHyperspaceAmount = (time) => {
      if (reducedMotion || time < hyperspaceStart || time > hyperspaceEnd) return 0;
      const duration = hyperspaceEnd - hyperspaceStart;
      const progress = (time - hyperspaceStart) / duration;
      const edge = Math.min(progress / 0.18, (1 - progress) / 0.18, 1);
      return easeInOut(Math.max(0, edge));
    };

    const getHyperspaceFlashAmount = (time) => {
      if (reducedMotion) return 0;
      const preFlashEnd = hyperspaceStart + hyperspaceFlashDuration;
      const postFlashStart = hyperspaceEnd - hyperspaceFlashDuration;
      if (time >= hyperspaceStart && time <= preFlashEnd) {
        const progress = (time - hyperspaceStart) / hyperspaceFlashDuration;
        return Math.sin((1 - progress) * Math.PI * 0.5) * 0.14;
      }
      if (time >= postFlashStart && time <= hyperspaceEnd) {
        const progress = (time - postFlashStart) / hyperspaceFlashDuration;
        return Math.sin(progress * Math.PI * 0.5) * 0.1;
      }
      return 0;
    };

    const resetStar = (star, fresh = false) => {
      star.angle = randomBetween(0, Math.PI * 2);
      star.distance = fresh ? randomBetween(12, maxRadius) : randomBetween(6, 42);
      star.speed = randomBetween(38, 105);
      star.size = randomBetween(0.65, 1.55);
      star.interval = randomBetween(2.4, 7.2);
      star.offset = randomBetween(0, star.interval);
      star.tint = Math.random() > 0.62 ? '181, 220, 255' : '244, 247, 251';
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      maxRadius = Math.hypot(width, height);
      center.x = width / 2;
      center.y = height * 0.42;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (stars.length === 0) {
        const count = Math.min(190, Math.max(105, Math.floor((width * height) / 6200)));
        for (let index = 0; index < count; index += 1) {
          const star = {};
          resetStar(star, true);
          stars.push(star);
        }
      }
    };

    const drawStar = (star, elapsedSeconds, deltaSeconds, hyperspaceAmount) => {
      if (!reducedMotion) {
        const warpSpeed = 1 + hyperspaceAmount * 8;
        star.distance += star.speed * deltaSeconds * warpSpeed * (1 + star.distance / maxRadius);
      }

      const x = center.x + Math.cos(star.angle) * star.distance;
      const y = center.y + Math.sin(star.angle) * star.distance;
      if (x < -90 || x > width + 90 || y < -90 || y > height + 90) {
        resetStar(star);
        return;
      }

      const cycle = (elapsedSeconds + star.offset) % star.interval;
      const burst = cycle < 0.34 ? 1 - cycle / 0.34 : 0;
      const depth = Math.min(1, star.distance / maxRadius);
      const opacity = Math.min(1, 0.3 + depth * 0.56 + hyperspaceAmount * 0.2);
      const size = star.size + depth * 1.4 + hyperspaceAmount * 0.4;

      if ((burst > 0.02 || hyperspaceAmount > 0.02) && !reducedMotion) {
        const lineLength = 20 + depth * 72 + burst * 68 + hyperspaceAmount * (130 + depth * 260);
        const tailX = x - Math.cos(star.angle) * lineLength;
        const tailY = y - Math.sin(star.angle) * lineLength;
        const gradient = context.createLinearGradient(tailX, tailY, x, y);
        gradient.addColorStop(0, `rgba(${star.tint}, ${0.2 + burst * 0.54})`);
        gradient.addColorStop(0.34, `rgba(${star.tint}, ${0.1 + burst * 0.28})`);
        gradient.addColorStop(1, `rgba(${star.tint}, 0)`);
        context.strokeStyle = gradient;
        context.lineWidth = 0.7 + burst * 1.25 + hyperspaceAmount * 1.7;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.stroke();
      }

      context.fillStyle = `rgba(${star.tint}, ${opacity})`;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    };

    const render = (time) => {
      const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
      const elapsedSeconds = time / 1000;
      lastTime = time;

      const hyperspaceAmount = getHyperspaceAmount(time);
      const hyperspaceFlashAmount = getHyperspaceFlashAmount(time);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';
      stars.forEach((star) => drawStar(star, elapsedSeconds, deltaSeconds, hyperspaceAmount));
      context.globalCompositeOperation = 'source-over';
      if (hyperspaceFlashAmount > 0) {
        context.fillStyle = "rgba(181, 220, 255, " + hyperspaceFlashAmount + ")";
        context.fillRect(0, 0, width, height);
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    const hyperspaceInterval = reducedMotion ? 0 : window.setInterval(startHyperspace, 50_000);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (hyperspaceInterval) window.clearInterval(hyperspaceInterval);
      window.clearTimeout(hyperspaceEndTimeout);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="star-warp-canvas" ref={canvasRef} aria-hidden="true" />;
}

function WarpChargeIndicator() {
  const [chargePercent, setChargePercent] = useState(0);
  const [warping, setWarping] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let chargeStartedAt = performance.now();
    const warpingRef = { current: false };
    let animationFrame = 0;
    let chargeInterval = 0;

    const updateCharge = () => {
      if (warpingRef.current) {
        setChargePercent(100);
        if (!reducedMotion) animationFrame = window.requestAnimationFrame(updateCharge);
        return;
      }
      const elapsed = performance.now() - chargeStartedAt;
      setChargePercent(Math.min(100, (elapsed / 50_000) * 100));
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(updateCharge);
    };

    const updateReducedCharge = () => {
      const elapsed = performance.now() - chargeStartedAt;
      setChargePercent(Math.min(100, (elapsed / 50_000) * 100));
    };

    const onWarpStart = () => {
      warpingRef.current = true;
      setWarping(true);
      setChargePercent(100);
    };

    const onWarpEnd = () => {
      chargeStartedAt = performance.now();
      warpingRef.current = false;
      setWarping(false);
      setChargePercent(0);
    };

    window.addEventListener("hyperspace-warp-start", onWarpStart);
    window.addEventListener("hyperspace-warp-end", onWarpEnd);

    if (reducedMotion) {
      updateReducedCharge();
      chargeInterval = window.setInterval(updateReducedCharge, 1000);
    } else {
      animationFrame = window.requestAnimationFrame(updateCharge);
    }

    return () => {
      window.removeEventListener("hyperspace-warp-start", onWarpStart);
      window.removeEventListener("hyperspace-warp-end", onWarpEnd);
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(chargeInterval);
    };
  }, []);

  const chargeCount = 10
  const chargedSegments = warping ? chargeCount : Math.min(chargeCount, Math.floor(chargePercent / (100 / chargeCount)));

  return (
    <aside className={warping ? "warp-charge is-warping" : "warp-charge"} aria-label="Faster Than Light warp charge">
      <span className="warp-charge-label">FTL Warp</span>
      <div className="warp-charge-segments" aria-hidden="true">
        {Array.from({ length: chargeCount }, (_, index) => (
          <span className={index < chargedSegments ? "warp-charge-segment is-filled" : "warp-charge-segment"} key={index} />
        ))}
      </div>
    </aside>
  );
}

function CreditFooter() {
  return (
    <footer className="public-footer">
      <strong>v1.02</strong>
      <span>Created and maintained by Danish</span>
    </footer>
  );
}

function SetupMissing() {
  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <Gamepad2 size={36} />
        <h1>Firebase setup needed</h1>
        <p>
          Create a <code>.env</code> file from <code>.env.example</code> and fill in the Firebase
          web app values before running the calendar.
        </p>
      </section>
    </main>
  );
}

function PublicCalendar({ navigate }) {
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
                    <small>{segment.game}</small>
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

function EventInfoPage({ eventId, navigate }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const shareUrl = `${window.location.origin}/event/${encodeURIComponent(eventId)}`;
  const googleCalendarUrl = event ? buildGoogleCalendarUrl(event, shareUrl) : '';

  useEffect(() => {
    let mounted = true;
    async function loadEvent() {
      setLoading(true);
      setError(null);
      try {
        const nextEvent = await fetchEvent(eventId);
        if (!mounted) return;
        if (!nextEvent || !nextEvent.published) {
          setError({
            title: 'Event not available',
            detail: 'This event is unpublished, deleted, or the link is no longer valid.',
          });
        } else {
          setEvent(nextEvent);
        }
      } catch (err) {
        if (mounted) setError(toUserError(err, 'Could not load event'));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadEvent();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Shared event</p>
          <h1>{event?.title || 'Event'}</h1>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate('/')}>
          <CalendarDays size={17} />
          Calendar
        </button>
      </header>
      {loading && <StatePanel icon={<Loader2 className="spin" />} title="Loading event" />}
      {error && <StatePanel icon={<CalendarDays />} title={error.title} detail={error.detail} />}
      {event && !error && (
        <section className="event-info-panel">
          <div className="popover-time">
            <Clock3 size={18} />
            <div>
              <strong>{formatTime(event.startAt)} - {formatTime(event.endAt)}</strong>
              <span>{formatCompactDate(event.startAt)} - {formatCompactDate(event.endAt)}</span>
            </div>
          </div>
          <div className="popover-actions">
            <a className="button compact-action" href={googleCalendarUrl} target="_blank" rel="noreferrer">
              <CalendarPlus size={16} />
              Add to Google Calendar
            </a>
          </div>
          <EventDetails event={event} />
        </section>
      )}
    </main>
  );
}

function EventDetails({ event }) {
  return (
    <div className="event-details">
      <div className="event-detail-row">
        <UserRound size={15} />
        <span>{event.gameMaster}</span>
      </div>
      <div className="event-detail-row">
        <Gamepad2 size={15} />
        <span>{event.game}</span>
      </div>
      <div className="event-detail-row">
        <MapPin size={15} />
        <span>{event.location}</span>
      </div>
      <div className="event-detail-row description-row">
        <FileText size={15} />
        <p>{event.description || 'No description yet.'}</p>
      </div>
    </div>
  );
}

function AdminView({ navigate }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [allowedAdmin, setAllowedAdmin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      if (!user) {
        setAllowedAdmin(false);
        setAdminLoading(false);
        return;
      }
      setAdminLoading(true);
      const allowed = await isAllowedAdmin(user);
      if (mounted) {
        setAllowedAdmin(allowed);
        setAdminLoading(false);
      }
    }
    checkAdmin();
    return () => {
      mounted = false;
    };
  }, [user]);

  if (authLoading || adminLoading) {
    return (
      <main className="app-shell">
        <StatePanel icon={<Loader2 className="spin" />} title="Checking sign-in" />
      </main>
    );
  }

  if (!user) return <SignInView navigate={navigate} />;

  if (!allowedAdmin) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Access denied</h1>
          </div>
          <button className="button secondary" type="button" onClick={() => signOut(auth)}>
            <LogOut size={17} />
            Sign out
          </button>
        </header>
        <StatePanel
          icon={<Shield />}
          title="This account is not on the admin allowlist"
          detail={user.email}
        />
      </main>
    );
  }

  return <AdminDashboard user={user} navigate={navigate} />;
}

function SignInView({ navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(toInlineError(err, 'Sign-in failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <button className="text-link" type="button" onClick={() => navigate('/')}>
          Back to public calendar
        </button>
        <div className="auth-heading">
          <Shield size={32} />
          <h1>Admin sign-in</h1>
          <p>Sign in with your admin email and password.</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button full" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminDashboard({ user, navigate }) {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState([]);
  const [gameMasters, setGameMasters] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [gameForm, setGameForm] = useState({ name: '', color: '#2f6df6' });
  const [adminTab, setAdminTab] = useState('event');
  const [filters, setFilters] = useState({ search: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEvents, nextGames, nextGameMasters] = await Promise.all([
        fetchAdminEvents(),
        fetchGames(),
        fetchGameMasters(),
      ]);
      setEvents(nextEvents);
      setGames(nextGames);
      setGameMasters(nextGameMasters);
    } catch (err) {
      setError(toUserError(err, 'Could not load admin events'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (loading || events.length === 0) return;
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId || editing === editId) return;
    const event = events.find((entry) => entry.id === editId);
    if (event) editEvent(event);
  }, [events, editing, loading]);

  const editEvent = (event) => {
    const matchingGame = games.find((game) => game.name === event.game);
    setEditing(event.id);
    setForm({
      title: event.title || '',
      gameMaster: event.gameMaster || '',
      game: event.game || '',
      gameColor: event.gameColor || matchingGame?.color || '#2f6df6',
      location: event.location || '',
      description: event.description || '',
      date: toInputDate(event.startAt),
      startTime: toInputTime(event.startAt),
      endDate: toInputDate(event.endAt),
      endTime: toInputTime(event.endAt),
      published: Boolean(event.published),
    });
    setAdminTab('event');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const startAt = malaysiaInputToDate(form.date, form.startTime);
    const endAt = malaysiaInputToDate(form.endDate, form.endTime);
    if (endAt <= startAt) {
      setError({
        title: 'Invalid event time',
        detail: 'End date and time must be after the start date and time.',
      });
      setBusy(false);
      return;
    }

    const payload = {
      title: form.title.trim(),
      gameMaster: form.gameMaster.trim(),
      game: form.game.trim(),
      gameColor: form.gameColor,
      location: form.location.trim(),
      description: form.description.trim(),
      startAt,
      endAt,
      published: form.published,
    };

    try {
      if (!editing) await ensureGameMaster(gameMasters, payload.gameMaster);
      if (editing) await updateEvent(editing, payload);
      else await createEvent(payload);
      resetForm();
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to save event'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (event) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to delete event'));
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (event) => {
    setBusy(true);
    setError(null);
    try {
      await updateEventPublished(event.id, !event.published);
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to update publish state'));
    } finally {
      setBusy(false);
    }
  };

  const filteredEvents = useMemo(
    () => filterAdminEvents(events, filters),
    [events, filters],
  );

  const submitGame = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createGame({
        name: gameForm.name.trim(),
        color: gameForm.color,
      });
      setGameForm({ name: '', color: '#2f6df6' });
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to save game'));
    } finally {
      setBusy(false);
    }
  };

  const removeGame = async (game) => {
    if (!window.confirm(`Delete "${game.name}" from the game dropdown? Existing events will keep their saved game name and color.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteGame(game.id);
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to delete game'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Signed in as {user.email}</p>
          <h1>Manage Events</h1>
        </div>
        <div className="topbar-actions">
          <button className="button secondary" type="button" onClick={() => navigate('/')}>
            <Eye size={17} />
            Public
          </button>
          <button className="icon-button" type="button" onClick={loadAdminData} title="Refresh events">
            <RefreshCw size={18} />
          </button>
          <button className="button secondary" type="button" onClick={() => signOut(auth)}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </header>

      <section className="admin-layout">
        <section className="admin-list">
          <div className="section-heading">
            <CalendarDays size={20} />
            <h2>Events</h2>
          </div>
          <div className="admin-filters">
            <label>
              Search
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Title or Game Master"
              />
            </label>
            <div className="two-col">
              <label>
                From
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
                />
              </label>
            </div>
          </div>
          {loading && <StatePanel icon={<Loader2 className="spin" />} title="Loading events" />}
          {!loading && error && (
            <StatePanel
              icon={<CalendarDays />}
              title={error.title}
              detail={error.detail}
              actionUrl={error.actionUrl}
              actionLabel="Open Firebase index"
            />
          )}
          {!loading && !error && events.length === 0 && <StatePanel icon={<CalendarDays />} title="No events yet" />}
          {!loading && !error && events.length > 0 && filteredEvents.length === 0 && (
            <StatePanel icon={<CalendarDays />} title="No matching events" />
          )}
          {!loading && !error &&
            filteredEvents.map((event) => (
              <article className="admin-event compact" key={event.id}>
                <div className="admin-event-main">
                  <div className="admin-event-title">
                    <span className={`status-dot ${getEventStatus(event)}`} />
                    <h3>{event.title}</h3>
                  </div>
                </div>
                <time>{formatDateTime(event.startAt)}</time>
                <span className="visibility-state" title={event.published ? 'Published' : 'Draft'}>
                  {event.published ? <Eye size={16} /> : <EyeOff size={16} />}
                </span>
                <div className="admin-event-actions">
                  <button className="icon-button" type="button" onClick={() => editEvent(event)} title="Edit event">
                    <Edit3 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => togglePublish(event)}
                    title={event.published ? 'Unpublish event' : 'Publish event'}
                  >
                    {event.published ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => remove(event)} title="Delete event">
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
        </section>

        <section className="admin-tools">
          <div className="admin-tabs" role="tablist" aria-label="Admin forms">
            <button
              type="button"
              className={adminTab === 'event' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAdminTab('event')}
            >
              Event
            </button>
            <button
              type="button"
              className={adminTab === 'game' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAdminTab('game')}
            >
              Games
            </button>
          </div>

          {adminTab === 'event' && (
            <form className="event-form" onSubmit={submit}>
              <div className="section-heading">
                <Plus size={20} />
                <h2>{editing ? 'Edit event' : 'Create event'}</h2>
              </div>
              <label>
                Title
                <input value={form.title} onChange={bindForm(setForm, 'title')} required />
              </label>
              <div className="two-col">
                <label>
                  Game Master
                  <input
                    value={form.gameMaster}
                    onChange={bindForm(setForm, 'gameMaster')}
                    list="game-master-options"
                    required
                  />
                  <datalist id="game-master-options">
                    {gameMasters.map((gameMaster) => (
                      <option value={gameMaster.name} key={gameMaster.id} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Game
                  <select
                    value={form.game}
                    onChange={(event) => selectGame(setForm, games, event.target.value)}
                    required
                  >
                    <option value="">Select a game</option>
                    {form.game && !games.some((game) => game.name === form.game) && (
                      <option value={form.game}>{form.game}</option>
                    )}
                    {games.map((game) => (
                      <option value={game.name} key={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Location
                <input value={form.location} onChange={bindForm(setForm, 'location')} required />
              </label>
              <label>
                Description
                <textarea value={form.description} onChange={bindForm(setForm, 'description')} rows="4" required />
              </label>
              <div className="two-col">
                <label>
                  Date
                  <input type="date" value={form.date} onChange={syncStartDate(setForm)} required />
                </label>
                <label>
                  Time start
                  <input type="time" value={form.startTime} onChange={bindForm(setForm, 'startTime')} required />
                </label>
              </div>
              <div className="two-col">
                <label>
                  End date
                  <input type="date" value={form.endDate} onChange={bindForm(setForm, 'endDate')} required />
                </label>
                <label>
                  Time end
                  <input type="time" value={form.endTime} onChange={bindForm(setForm, 'endTime')} required />
                </label>
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
                />
                Published
              </label>
              {error && (
                <FormError
                  title={error.title}
                  detail={error.detail}
                  actionUrl={error.actionUrl}
                  actionLabel="Open Firebase index"
                />
              )}
              <div className="form-actions">
                {editing && (
                  <button className="button secondary" type="button" onClick={resetForm}>
                    Cancel
                  </button>
                )}
                <button className="button" type="submit" disabled={busy}>
                  {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
                  {editing ? 'Save changes' : 'Create event'}
                </button>
              </div>
            </form>
          )}

          {adminTab === 'game' && (
            <section className="event-form">
              <div className="section-heading">
                <Gamepad2 size={20} />
                <h2>Games</h2>
              </div>
              <form className="game-entry-form" onSubmit={submitGame}>
                <label>
                  Name
                  <input
                    value={gameForm.name}
                    onChange={bindForm(setGameForm, 'name')}
                    placeholder="Game name"
                    required
                  />
                </label>
                <label>
                  Color
                  <input
                    className="color-input"
                    type="color"
                    value={gameForm.color}
                    onChange={bindForm(setGameForm, 'color')}
                    required
                  />
                </label>
                <button className="button" type="submit" disabled={busy}>
                  <Plus size={17} />
                  Add game
                </button>
              </form>
              <div className="game-list">
                {games.length === 0 && <p>No games yet. Add one before creating events.</p>}
                {games.map((game) => (
                  <article className="game-entry" key={game.id}>
                    <span className="game-swatch" style={{ background: game.color }} />
                    <span>{game.name}</span>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => removeGame(game)}
                      title="Delete game"
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
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

function filterAdminEvents(events, filters) {
  const search = filters.search.trim().toLowerCase();
  const start = filters.startDate ? malaysiaInputToDate(filters.startDate, '00:00') : null;
  const end = filters.endDate ? malaysiaInputToDate(filters.endDate, '23:59') : null;

  return events.filter((event) => {
    const matchesSearch = !search
      || event.title.toLowerCase().includes(search)
      || event.gameMaster.toLowerCase().includes(search);
    const matchesStart = !start || event.endAt >= start;
    const matchesEnd = !end || event.startAt <= end;
    return matchesSearch && matchesStart && matchesEnd;
  });
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

function bindForm(setForm, key) {
  return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
}

function selectGame(setForm, games, gameName) {
  const game = games.find((entry) => entry.name === gameName);
  setForm((current) => ({
    ...current,
    game: gameName,
    gameColor: game?.color || current.gameColor,
  }));
}

async function ensureGameMaster(gameMasters, name) {
  const normalizedName = name.trim();
  if (!normalizedName) return;
  const exists = gameMasters.some(
    (gameMaster) => gameMaster.name.toLowerCase() === normalizedName.toLowerCase(),
  );
  if (!exists) {
    await createGameMaster({ name: normalizedName });
  }
}

function syncStartDate(setForm) {
  return (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      date: value,
      endDate: current.endDate < value ? value : current.endDate,
    }));
  };
}

function FormError({ title, detail, actionUrl, actionLabel }) {
  return (
    <div className="form-error">
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionUrl && (
        <a href={actionUrl} target="_blank" rel="noreferrer">
          {actionLabel}
        </a>
      )}
    </div>
  );
}

function StatePanel({ icon, title, detail, actionUrl, actionLabel }) {
  return (
    <section className="state-panel">
      {icon}
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {actionUrl && (
        <a className="state-action" href={actionUrl} target="_blank" rel="noreferrer">
          {actionLabel}
        </a>
      )}
    </section>
  );
}
