import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, fetchGameMasterProfile } from '../firebase.js';
import { toInlineError, toUserError } from '../errors.js';
import {
  createEvent,
  deleteEvent,
  deleteEventPlayer,
  fetchEventPlayers,
  fetchEventSecret,
  fetchGameMasterEvents,
  fetchGames,
  generateInvitePin,
  updateEvent,
  updateEventPlayer,
} from '../events.js';
import {
  formatDateTime,
  getEventStatus,
  malaysiaInputToDate,
  toInputDate,
  toInputTime,
} from '../time.js';
import { FormError, StatePanel } from '../components/AppChrome.jsx';
import { bindForm, emptyForm, selectGame, syncStartDate } from '../shared/forms.js';

export function GameMasterView({ navigate }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => { setUser(nextUser); setAuthLoading(false); }), []);

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      if (!user) { setProfile(null); setProfileLoading(false); return; }
      setProfileLoading(true);
      const nextProfile = await fetchGameMasterProfile(user);
      if (mounted) { setProfile(nextProfile); setProfileLoading(false); }
    }
    loadProfile();
    return () => { mounted = false; };
  }, [user]);

  if (authLoading || profileLoading) return <main className="app-shell"><StatePanel icon={<Loader2 className="spin" />} title="Checking Game Master sign-in" /></main>;
  if (!user) return <GameMasterSignInView navigate={navigate} />;
  if (!profile || profile.active === false) {
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Game Master</p><h1>Access denied</h1></div><button className="button secondary" type="button" onClick={() => signOut(auth)}><LogOut size={17} />Sign out</button></header><StatePanel icon={<Shield />} title="This account is not an active Game Master" detail={user.email} /></main>;
  }
  return <GameMasterDashboard user={user} profile={profile} navigate={navigate} />;
}

function GameMasterSignInView({ navigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(toInlineError(err, "Sign-in failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-heading">
          <UserRound size={32} />
          <h1>GM Login</h1>
          <p>Sign in with your Game Master email and password.</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button full" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
            Sign in
          </button>
          <button className="button secondary full" type="button" onClick={() => navigate("/")} disabled={busy}>
            <CalendarDays size={17} />
            Back to public calendar
          </button>
        </form>
      </section>
    </main>
  );
}

function GameMasterDashboard({ user, profile, navigate }) {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, gameMaster: profile.name, gameMasterUid: user.uid });
  const [invitePin, setInvitePin] = useState(generateInvitePin);
  const [players, setPlayers] = useState([]);
  const [inviteDetails, setInviteDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const shareUrl = editing ? window.location.origin + "/event/" + encodeURIComponent(editing) : "";

  const loadGmData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEvents, nextGames] = await Promise.all([fetchGameMasterEvents(user.uid), fetchGames()]);
      const secretPairs = await Promise.all(
        nextEvents.map(async (event) => {
          const secret = await fetchEventSecret(event.id);
          return [event.id, { pin: secret?.pin || "", url: window.location.origin + "/event/" + encodeURIComponent(event.id) }];
        }),
      );
      setEvents(nextEvents);
      setGames(nextGames);
      setInviteDetails(Object.fromEntries(secretPairs));
    } catch (err) {
      setError(toUserError(err, "Could not load Game Master events"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadGmData(); }, [user.uid]);

  const resetGmForm = () => { setEditing(null); setPlayers([]); setInvitePin(generateInvitePin()); setForm({ ...emptyForm, gameMaster: profile.name, gameMasterUid: user.uid }); setError(null); };

  const editGmEvent = async (event) => {
    const matchingGame = games.find((game) => game.name === event.game);
    setEditing(event.id);
    setForm({ title: event.title || "", gameMaster: profile.name, gameMasterUid: user.uid, game: event.game || "", gameColor: event.gameColor || matchingGame?.color || "#2f6df6", location: event.location || "", description: event.description || "", date: toInputDate(event.startAt), startTime: toInputTime(event.startAt), endDate: toInputDate(event.endAt), endTime: toInputTime(event.endAt), published: Boolean(event.published), inviteEnabled: event.inviteEnabled === true });
    try { const [secret, nextPlayers] = await Promise.all([fetchEventSecret(event.id), fetchEventPlayers(event.id)]); setInvitePin(secret?.pin || generateInvitePin()); setPlayers(nextPlayers); }
    catch (err) { setError(toUserError(err, "Could not load invite details")); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    const startAt = malaysiaInputToDate(form.date, form.startTime);
    const endAt = malaysiaInputToDate(form.endDate, form.endTime);
    if (endAt <= startAt) { setError({ title: "Invalid event time", detail: "End date and time must be after the start date and time." }); setBusy(false); return; }
    const payload = { title: form.title.trim(), gameMaster: profile.name, gameMasterUid: user.uid, createdBy: user.uid, inviteEnabled: form.inviteEnabled, game: form.game.trim(), gameColor: form.gameColor, location: form.location.trim(), description: form.description.trim(), startAt, endAt, published: form.published };
    try { if (editing) await updateEvent(editing, payload, { invitePin }); else await createEvent(payload, { invitePin }); resetGmForm(); await loadGmData(); }
    catch (err) { setError(toUserError(err, "Unable to save event")); }
    finally { setBusy(false); }
  };

  const remove = async (event) => {
    if (!window.confirm("Delete " + event.title + "?")) return;
    setBusy(true); setError(null);
    try { await deleteEvent(event.id); if (editing === event.id) resetGmForm(); await loadGmData(); }
    catch (err) { setError(toUserError(err, "Unable to delete event")); }
    finally { setBusy(false); }
  };

  const savePlayer = async (player) => { const nextName = window.prompt("Player name", player.name); if (!nextName) return; await updateEventPlayer(editing, player.id, { name: nextName.trim() }); setPlayers(await fetchEventPlayers(editing)); };
  const removePlayer = async (player) => { if (!window.confirm("Remove " + player.name + "?")) return; await deleteEventPlayer(editing, player.id); setPlayers(await fetchEventPlayers(editing)); };

  return (
    <main className="app-shell admin-shell">
      <header className="topbar"><div><p className="eyebrow">Signed in as {profile.name}</p><h1>GM Events</h1></div><div className="topbar-actions"><button className="button secondary" type="button" onClick={() => navigate("/")}><Eye size={17} />Public</button><button className="icon-button" type="button" onClick={loadGmData} title="Refresh events"><RefreshCw size={18} /></button><button className="button secondary" type="button" onClick={() => signOut(auth)}><LogOut size={17} />Sign out</button></div></header>
      <section className="admin-layout"><section className="admin-list"><div className="section-heading"><CalendarDays size={20} /><h2>My events</h2></div>{loading && <StatePanel icon={<Loader2 className="spin" />} title="Loading events" />}{!loading && error && <StatePanel icon={<CalendarDays />} title={error.title} detail={error.detail} />}{!loading && !error && events.length === 0 && <StatePanel icon={<CalendarDays />} title="No events yet" />}{!loading && !error && events.map((event) => <article className="admin-event compact" key={event.id}><div className="admin-event-main"><div className="admin-event-title"><span className={"status-dot " + getEventStatus(event)} /><h3>{event.title}</h3>{event.inviteEnabled === true && inviteDetails[event.id] && <small className="invite-summary">PIN {inviteDetails[event.id].pin || "------"} / {inviteDetails[event.id].url}</small>}</div></div><time>{formatDateTime(event.startAt)}</time><span className="visibility-state">{event.published ? <Eye size={16} /> : <EyeOff size={16} />}</span><div className="admin-event-actions"><button className="icon-button" type="button" onClick={() => editGmEvent(event)} title="Edit event"><Edit3 size={17} /></button><button className="icon-button danger" type="button" onClick={() => remove(event)} title="Delete event"><Trash2 size={17} /></button></div></article>)}</section>
        <section className="admin-tools"><form className="event-form" onSubmit={submit}><div className="section-heading"><Plus size={20} /><h2>{editing ? "Edit event" : "Create event"}</h2></div><label>Title<input value={form.title} onChange={bindForm(setForm, "title")} required /></label><div className="two-col"><label>Game Master<input value={profile.name} readOnly disabled title="Game Master is assigned from your login" /></label><label>Game<select value={form.game} onChange={(event) => selectGame(setForm, games, event.target.value)} required><option value="">Select a game</option>{form.game && !games.some((game) => game.name === form.game) && <option value={form.game}>{form.game}</option>}{games.map((game) => <option value={game.name} key={game.id}>{game.name}</option>)}</select></label></div><label>Location<input value={form.location} onChange={bindForm(setForm, "location")} required /></label><label>Description<textarea value={form.description} onChange={bindForm(setForm, "description")} rows="4" required /></label><div className="two-col"><label>Date<input type="date" value={form.date} onChange={syncStartDate(setForm)} required /></label><label>Time start<input type="time" value={form.startTime} onChange={bindForm(setForm, "startTime")} required /></label></div><div className="two-col"><label>End date<input type="date" value={form.endDate} onChange={bindForm(setForm, "endDate")} required /></label><label>Time end<input type="time" value={form.endTime} onChange={bindForm(setForm, "endTime")} required /></label></div><div className="two-col"><label className="toggle-row"><input type="checkbox" checked={form.published} onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))} />Published</label><label className="toggle-row"><input type="checkbox" checked={form.inviteEnabled} onChange={(event) => setForm((current) => ({ ...current, inviteEnabled: event.target.checked }))} />Invite enabled</label></div><div className="invite-panel"><label>6-digit PIN<div className="field-with-action"><input value={invitePin} onChange={(event) => setInvitePin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" required /><button className="icon-button" type="button" onClick={() => setInvitePin(generateInvitePin())} title="Randomize PIN"><RefreshCw size={17} /></button></div></label>{editing && <label>Invite link<input value={shareUrl} readOnly /></label>}</div>{error && <FormError title={error.title} detail={error.detail} actionUrl={error.actionUrl} actionLabel="Open Firebase index" />}<div className="form-actions">{editing && <button className="button secondary" type="button" onClick={resetGmForm}>Cancel</button>}<button className="button" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}{editing ? "Save changes" : "Create event"}</button></div></form>{editing && <section className="event-form"><div className="section-heading"><UserRound size={20} /><h2>Joined players</h2></div><div className="game-list">{players.length === 0 && <p>No players have joined yet.</p>}{players.map((player) => <article className="game-entry" key={player.id}><span className="status-dot" /><span>{player.name}</span><button className="icon-button" type="button" onClick={() => savePlayer(player)} title="Edit player"><Edit3 size={17} /></button><button className="icon-button danger" type="button" onClick={() => removePlayer(player)} title="Delete player"><Trash2 size={17} /></button></article>)}</div></section>}</section></section>
    </main>
  );
}
