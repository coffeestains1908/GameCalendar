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
  RefreshCw,
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
  fetchEventSecret,
  fetchGames,
  generateInvitePin,
  joinEventWithPin,
  updateEvent,
  updateEventPlayer,
} from '../events.js';
import {
  formatCompactDate,
  formatTime,
  malaysiaInputToDate,
  MALAYSIA_TIME_ZONE,
  toInputDate,
  toInputTime,
} from '../time.js';
import { FormError, StatePanel } from '../components/AppChrome.jsx';
import { bindForm, selectGame, syncStartDate } from '../shared/forms.js';
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
  const [editingEvent, setEditingEvent] = useState(false);
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

  const canEditEvent = Boolean(event && user && (viewerIsAdmin || event.createdBy === user.uid));
  const canViewPlayers = event?.inviteEnabled === true;
  const canManagePlayers = Boolean(canViewPlayers && canEditEvent);

  const loadEventPlayers = useCallback(async () => {
    if (!canViewPlayers || !event) {
      setPlayerList([]);
      return;
    }
    setPlayerList(await fetchEventPlayers(event.id));
  }, [canViewPlayers, event]);

  const reloadEvent = useCallback(async () => {
    const nextEvent = await fetchEvent(eventId);
    if (!nextEvent || !nextEvent.published) {
      setEvent(null);
      setEditingEvent(false);
      setPlayerList([]);
      setError({
        title: 'Event not available',
        detail: 'This event is unpublished, deleted, or the link is no longer valid.',
      });
      return null;
    }
    setEvent(nextEvent);
    if (nextEvent.inviteEnabled !== true) setPlayerList([]);
    return nextEvent;
  }, [eventId]);

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
            {canEditEvent && (
              <button className="button compact-action secondary" type="button" onClick={() => setEditingEvent((current) => !current)}>
                <Edit3 size={16} />
                {editingEvent ? 'Close editor' : 'Edit event'}
              </button>
            )}
          </div>
          <EventDetails event={event} />
          {editingEvent && canEditEvent && (
            <EventEditForm
              event={event}
              onCancel={() => setEditingEvent(false)}
              onSaved={async () => {
                setEditingEvent(false);
                const nextEvent = await reloadEvent();
                if (nextEvent?.inviteEnabled === true) {
                  setPlayerList(await fetchEventPlayers(nextEvent.id));
                }
              }}
            />
          )}
          {event.inviteEnabled === true && <JoinEventForm eventId={event.id} onJoined={loadEventPlayers} />}
          {canViewPlayers && !canManagePlayers && (
            <PublicJoinedPlayers players={playerList} />
          )}
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

function eventToEditForm(event) {
  return {
    title: event.title || "",
    game: event.game || "",
    gameColor: event.gameColor || "#2f6df6",
    location: event.location || "",
    description: event.description || "",
    date: toInputDate(event.startAt),
    startTime: toInputTime(event.startAt),
    endDate: toInputDate(event.endAt),
    endTime: toInputTime(event.endAt),
    published: Boolean(event.published),
    inviteEnabled: event.inviteEnabled === true,
  };
}

function EventEditForm({ event, onCancel, onSaved }) {
  const [form, setForm] = useState(() => eventToEditForm(event));
  const [games, setGames] = useState([]);
  const [invitePin, setInvitePin] = useState("");
  const [originalInvitePin, setOriginalInvitePin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(eventToEditForm(event));
    setError(null);
  }, [event]);

  useEffect(() => {
    let mounted = true;
    async function loadEditData() {
      try {
        const [nextGames, secret] = await Promise.all([
          fetchGames(),
          event.inviteEnabled === true ? fetchEventSecret(event.id) : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setGames(nextGames);
        const loadedPin = secret?.pin || "";
        setInvitePin(loadedPin);
        setOriginalInvitePin(loadedPin);
      } catch (err) {
        if (mounted) setError(toUserError(err, "Could not load edit details"));
      }
    }
    loadEditData();
    return () => { mounted = false; };
  }, [event.id, event.inviteEnabled]);

  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);

    const startAt = malaysiaInputToDate(form.date, form.startTime);
    const endAt = malaysiaInputToDate(form.endDate, form.endTime);
    if (endAt <= startAt) {
      setError({
        title: "Invalid event time",
        detail: "End date and time must be after the start date and time.",
      });
      setBusy(false);
      return;
    }

    const payload = {
      title: form.title.trim(),
      gameMaster: event.gameMaster || "",
      gameMasterUid: event.gameMasterUid || "",
      createdBy: event.createdBy || event.gameMasterUid || "",
      inviteEnabled: form.inviteEnabled,
      game: form.game.trim(),
      gameColor: form.gameColor,
      location: form.location.trim(),
      description: form.description.trim(),
      startAt,
      endAt,
      published: form.published,
    };

    try {
      const nextInvitePin = invitePin || generateInvitePin();
      const inviteOptions = form.inviteEnabled && nextInvitePin !== originalInvitePin
        ? { invitePin: nextInvitePin }
        : {};
      await updateEvent(event.id, payload, inviteOptions);
      await onSaved?.();
    } catch (err) {
      setError(toUserError(err, "Unable to save event"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="join-form" onSubmit={submit}>
      <div className="section-heading">
        <Edit3 size={20} />
        <h2>Edit event</h2>
      </div>
      <label>
        Title
        <input value={form.title} onChange={bindForm(setForm, "title")} required />
      </label>
      <label>
        Game
        <select value={form.game} onChange={(event) => selectGame(setForm, games, event.target.value)} required>
          <option value="">Select a game</option>
          {form.game && !games.some((game) => game.name === form.game) && <option value={form.game}>{form.game}</option>}
          {games.map((game) => <option value={game.name} key={game.id}>{game.name}</option>)}
        </select>
      </label>
      <label>
        Location
        <input value={form.location} onChange={bindForm(setForm, "location")} required />
      </label>
      <label>
        Description
        <textarea value={form.description} onChange={bindForm(setForm, "description")} rows="4" required />
      </label>
      <div className="two-col">
        <label>
          Date
          <input type="date" value={form.date} onChange={syncStartDate(setForm)} required />
        </label>
        <label>
          Time start
          <input type="time" value={form.startTime} onChange={bindForm(setForm, "startTime")} required />
        </label>
      </div>
      <div className="two-col">
        <label>
          End date
          <input type="date" value={form.endDate} onChange={bindForm(setForm, "endDate")} required />
        </label>
        <label>
          Time end
          <input type="time" value={form.endTime} onChange={bindForm(setForm, "endTime")} required />
        </label>
      </div>
      <div className="two-col">
        <label className="toggle-row">
          <input type="checkbox" checked={form.published} onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))} />
          Published
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={form.inviteEnabled} onChange={(event) => setForm((current) => ({ ...current, inviteEnabled: event.target.checked }))} />
          Invite enabled
        </label>
      </div>
      {form.inviteEnabled && (
        <label>
          6-digit PIN
          <div className="field-with-action">
            <input
              value={invitePin}
              onChange={(event) => setInvitePin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
            />
            <button className="icon-button" type="button" onClick={() => setInvitePin(generateInvitePin())} title="Randomize PIN">
              <RefreshCw size={17} />
            </button>
          </div>
        </label>
      )}
      {error && <FormError title={error.title} detail={error.detail} actionUrl={error.actionUrl} actionLabel="Open Firebase index" />}
      <div className="form-actions">
        <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="button" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
          Save changes
        </button>
      </div>
    </form>
  );
}

function PublicJoinedPlayers({ players }) {
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
          </article>
        ))}
      </div>
    </section>
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

function JoinEventForm({ eventId, onJoined }) {
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
      await onJoined?.();
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
