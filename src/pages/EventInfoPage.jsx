import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Edit3,
  FileText,
  Gamepad2,
  Loader2,
  MapPin,
  Trash2,
  UserRound,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isAllowedAdmin } from '../firebase.js';
import { toInlineError, toUserError } from '../errors.js';
import {
  deleteEventPlayer,
  fetchEvent,
  fetchEventPlayers,
  joinEventWithPin,
  updateEventPlayer,
} from '../events.js';
import {
  formatCompactDate,
  formatTime,
  MALAYSIA_TIME_ZONE,
} from '../time.js';
import { StatePanel } from '../components/AppChrome.jsx';
import { createRecaptchaToken, preloadRecaptcha, recaptchaSiteKey } from '../recaptcha.js';

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

export function buildGoogleCalendarUrl(event, shareUrl) {
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

export function EventInfoPage({ eventId, navigate }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [playerList, setPlayerList] = useState([]);
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

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    let mounted = true;
    async function checkViewer() {
      const allowed = await isAllowedAdmin(user);
      if (mounted) setViewerIsAdmin(allowed);
    }
    checkViewer();
    return () => { mounted = false; };
  }, [user]);

  const canManagePlayers = Boolean(event?.inviteEnabled === true && user && (viewerIsAdmin || event.createdBy === user.uid));

  const loadEventPlayers = useCallback(async () => {
    if (!canManagePlayers || !event) {
      setPlayerList([]);
      return;
    }
    setPlayerList(await fetchEventPlayers(event.id));
  }, [canManagePlayers, event]);

  useEffect(() => {
    loadEventPlayers();
  }, [loadEventPlayers]);

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
          {event.inviteEnabled === true && <JoinEventForm eventId={event.id} />}
          {canManagePlayers && (
            <JoinedPlayersManager
              eventId={event.id}
              players={playerList}
              onReload={loadEventPlayers}
            />
          )}
        </section>
      )}
    </main>
  );
}

function JoinedPlayersManager({ eventId, players, onReload }) {
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const editPlayer = async (player) => {
    const nextName = window.prompt("Player name", player.name);
    if (!nextName) return;
    setBusyPlayerId(player.id);
    try {
      await updateEventPlayer(eventId, player.id, { name: nextName.trim() });
      await onReload();
    } finally {
      setBusyPlayerId("");
    }
  };

  const removePlayer = async (player) => {
    if (!window.confirm("Remove " + player.name + "?")) return;
    setBusyPlayerId(player.id);
    try {
      await deleteEventPlayer(eventId, player.id);
      await onReload();
    } finally {
      setBusyPlayerId("");
    }
  };

  return (
    <section className="join-form">
      <div className="section-heading">
        <UserRound size={20} />
        <h2>Joined players</h2>
      </div>
      <div className="game-list">
        {players.length === 0 && <p>No players have joined yet.</p>}
        {players.map((player) => (
          <article className="game-entry" key={player.id}>
            <span className="status-dot" />
            <span>{player.name}</span>
            <button className="icon-button" type="button" onClick={() => editPlayer(player)} disabled={busyPlayerId === player.id} title="Edit player">
              <Edit3 size={17} />
            </button>
            <button className="icon-button danger" type="button" onClick={() => removePlayer(player)} disabled={busyPlayerId === player.id} title="Delete player">
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

const joinEventRecaptchaAction = "join_event";

function JoinEventForm({ eventId }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    preloadRecaptcha().catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage(null);

    try {
      const recaptchaToken = await createRecaptchaToken(joinEventRecaptchaAction);
      await joinEventWithPin({
        eventId,
        name: name.trim(),
        pin: pin.trim(),
        recaptchaToken,
      });
      setName('');
      setPin('');
      setMessage('You are on the player list.');
    } catch (err) {
      setError(toInlineError(err, 'Could not join event.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="join-form" onSubmit={submit}>
      <div className="section-heading">
        <UserRound size={20} />
        <h2>Join Event</h2>
      </div>
      <div className="two-col">
        <label>
          Player name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </label>
        <label>
          6-digit PIN
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
          />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      <button className="button" type="submit" disabled={busy || !recaptchaSiteKey}>
        {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
        Join Event
      </button>
    </form>
  );
}

export function EventDetails({ event }) {
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
