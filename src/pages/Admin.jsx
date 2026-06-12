import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, isAllowedAdmin } from '../firebase.js';
import { toInlineError, toUserError } from '../errors.js';
import {
  createEvent,
  createGame,
  createUserAccount,
  deleteUserAccount,
  deleteEvent,
  deleteEventPlayer,
  deleteGame,
  fetchAdminEvents,
  fetchEventPlayers,
  fetchEventSecret,
  fetchGames,
  fetchUsers,
  generateInvitePin,
  sendUserPasswordReset,
  setUserDisabled,
  updateEvent,
  updateEventPlayer,
  updateEventPublished,
  updateUserAccount,
  verifyRecaptchaToken,
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
import { createRecaptchaToken, preloadRecaptcha } from '../recaptcha.js';

export function AdminView({ navigate }) {
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    preloadRecaptcha().catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const recaptchaToken = await createRecaptchaToken("admin_login");
      await verifyRecaptchaToken({ recaptchaToken, action: "admin_login" });
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

function AdminDashboard({ user, navigate }) {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState([]);
  const [gameMasters, setGameMasters] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [invitePin, setInvitePin] = useState(generateInvitePin);
  const [originalInvitePin, setOriginalInvitePin] = useState('');
  const [players, setPlayers] = useState([]);
  const [inviteDetails, setInviteDetails] = useState({});
  const [gameForm, setGameForm] = useState({ name: '', color: '#2f6df6' });
  const [userForm, setUserForm] = useState({ uid: '', name: '', email: '', role: 'gm', password: '', active: true });
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [adminTab, setAdminTab] = useState('event');
  const [filters, setFilters] = useState({ search: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const shareUrl = editing ? window.location.origin + '/event/' + encodeURIComponent(editing) : '';

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEvents, nextGames, nextUsers] = await Promise.all([
        fetchAdminEvents(),
        fetchGames(),
        fetchUsers(),
      ]);
      const secretPairs = await Promise.all(
        nextEvents.map(async (event) => {
          if (event.inviteEnabled !== true) return [event.id, null];
          const secret = await fetchEventSecret(event.id);
          return [
            event.id,
            {
              pin: secret?.pin || '',
              url: window.location.origin + '/event/' + encodeURIComponent(event.id),
            },
          ];
        }),
      );
      setEvents(nextEvents);
      setGames(nextGames);
      setManagedUsers(nextUsers);
      setGameMasters(nextUsers.filter((entry) => entry.role === 'gm' && entry.active !== false));
      setInviteDetails(Object.fromEntries(secretPairs.filter(([, details]) => details !== null)));
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

  const editEvent = async (event) => {
    const matchingGame = games.find((game) => game.name === event.game);
    setEditing(event.id);
    setForm({
      title: event.title || '',
      gameMaster: event.gameMaster || '',
      gameMasterUid: event.gameMasterUid || '',
      game: event.game || '',
      gameColor: event.gameColor || matchingGame?.color || '#2f6df6',
      location: event.location || '',
      description: event.description || '',
      date: toInputDate(event.startAt),
      startTime: toInputTime(event.startAt),
      endDate: toInputDate(event.endAt),
      endTime: toInputTime(event.endAt),
      published: Boolean(event.published),
      inviteEnabled: event.inviteEnabled === true,
    });
    setAdminTab('event');
    setInvitePin('');
    setOriginalInvitePin('');
    setPlayers([]);
    try {
      const [secret, nextPlayers] = await Promise.all([
        fetchEventSecret(event.id),
        fetchEventPlayers(event.id),
      ]);
      const loadedPin = secret?.pin || '';
      setInvitePin(loadedPin);
      setOriginalInvitePin(loadedPin);
      setPlayers(nextPlayers);
    } catch (err) {
      setError(toUserError(err, 'Could not load invite details'));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setInvitePin(generateInvitePin());
    setOriginalInvitePin('');
    setPlayers([]);
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

    const selectedGameMaster = gameMasters.find((gameMaster) => gameMaster.name === form.gameMaster);
    const payload = {
      title: form.title.trim(),
      gameMaster: form.gameMaster.trim(),
      gameMasterUid: form.gameMasterUid || selectedGameMaster?.uid || selectedGameMaster?.id || '',
      createdBy: editing ? events.find((entry) => entry.id === editing)?.createdBy || user.uid : user.uid,
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
      const inviteOptions = form.inviteEnabled && invitePin ? { invitePin } : {};
      if (editing) {
        const changedInviteOptions = invitePin !== originalInvitePin ? inviteOptions : {};
        await updateEvent(editing, payload, changedInviteOptions);
      } else {
        await createEvent(payload, inviteOptions);
      }
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
      if (editing === event.id) resetForm();
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

  const savePlayer = async (player) => {
    const nextName = window.prompt('Player name', player.name);
    if (!nextName) return;
    setError(null);
    try {
      await updateEventPlayer(editing, player.id, { name: nextName.trim() });
      setPlayers(await fetchEventPlayers(editing));
    } catch (err) {
      setError(toUserError(err, 'Unable to update player'));
    }
  };

  const removePlayer = async (player) => {
    if (!window.confirm('Remove ' + player.name + '?')) return;
    setError(null);
    try {
      await deleteEventPlayer(editing, player.id);
      setPlayers(await fetchEventPlayers(editing));
    } catch (err) {
      setError(toUserError(err, 'Unable to delete player'));
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

  const resetUserForm = () => {
    setUserForm({ uid: '', name: '', email: '', role: 'gm', password: '', active: true });
    setShowUserPassword(false);
  };

  const submitManagedUser = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        uid: userForm.uid,
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        role: userForm.role,
        active: userForm.active,
      };
      if (payload.uid === user.uid && (payload.active !== true || payload.role !== 'admin')) {
        setError({ title: 'Action blocked', detail: 'You cannot remove your own admin access.' });
        setBusy(false);
        return;
      }
      if (userForm.uid) {
        await updateUserAccount(payload);
      } else {
        await createUserAccount({ ...payload, password: userForm.password });
      }
      resetUserForm();
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to save user'));
    } finally {
      setBusy(false);
    }
  };

  const editManagedUser = (managedUser) => {
    setUserForm({
      uid: managedUser.uid || managedUser.id,
      name: managedUser.name || '',
      email: managedUser.email || '',
      role: managedUser.role === 'admin' ? 'admin' : 'gm',
      password: '',
      active: managedUser.active !== false,
    });
    setAdminTab('user');
  };

  const toggleManagedUserDisabled = async (managedUser) => {
    const uid = managedUser.uid || managedUser.id;
    if (uid === user.uid) {
      setError({ title: 'Action blocked', detail: 'You cannot disable or enable your own account here.' });
      return;
    }
    const disabled = managedUser.active !== false;
    const action = disabled ? 'Disable' : 'Enable';
    if (!window.confirm(`${action} ${managedUser.name || managedUser.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await setUserDisabled({ uid, disabled });
      if (userForm.uid === uid) resetUserForm();
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to update user access'));
    } finally {
      setBusy(false);
    }
  };

  const resetManagedUserPassword = async (managedUser) => {
    if (!managedUser.email) return;
    setBusy(true);
    setError(null);
    try {
      await sendUserPasswordReset(managedUser.email);
      window.alert(`Password reset email sent to ${managedUser.email}.`);
    } catch (err) {
      setError(toUserError(err, 'Unable to send reset email'));
    } finally {
      setBusy(false);
    }
  };

  const removeManagedUser = async (managedUser) => {
    const uid = managedUser.uid || managedUser.id;
    if (uid === user.uid) {
      setError({ title: 'Action blocked', detail: 'You cannot delete your own account.' });
      return;
    }
    if (!window.confirm(`Hard-delete ${managedUser.name || managedUser.email}? This removes the Firebase Auth account.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteUserAccount({ uid });
      if (userForm.uid === uid) resetUserForm();
      await loadAdminData();
    } catch (err) {
      setError(toUserError(err, 'Unable to delete user'));
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
        <section className="admin-list admin-event-list">
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
          <div className="admin-event-scroll">
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
                    {event.inviteEnabled === true && inviteDetails[event.id] && (
                      <small className="invite-summary">
                        PIN {inviteDetails[event.id].pin || '------'} / {inviteDetails[event.id].url}
                      </small>
                    )}
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
          </div>
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
            <button
              type="button"
              className={adminTab === 'user' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAdminTab('user')}
            >
              Users
            </button>
          </div>

          {adminTab === 'event' && (
            <>
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
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.inviteEnabled}
                  onChange={(event) => setForm((current) => ({ ...current, inviteEnabled: event.target.checked }))}
                />
                Invite enabled
              </label>
              <div className="invite-panel">
                <label>
                  6-digit PIN
                  <div className="field-with-action">
                    <input
                      value={invitePin}
                      onChange={(event) => setInvitePin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      required={form.inviteEnabled}
                    />
                    <button className="icon-button" type="button" onClick={() => setInvitePin(generateInvitePin())} title="Randomize PIN">
                      <RefreshCw size={17} />
                    </button>
                  </div>
                </label>
                {editing && (
                  <label>
                    Invite link
                    <input value={shareUrl} readOnly />
                  </label>
                )}
              </div>
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
            {editing && (
              <section className="event-form">
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
                      <button className="icon-button" type="button" onClick={() => savePlayer(player)} title="Edit player">
                        <Edit3 size={17} />
                      </button>
                      <button className="icon-button danger" type="button" onClick={() => removePlayer(player)} title="Delete player">
                        <Trash2 size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            </>
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
                  <input value={gameForm.name} onChange={bindForm(setGameForm, 'name')} placeholder="Game name" required />
                </label>
                <label>
                  Color
                  <input className="color-input" type="color" value={gameForm.color} onChange={bindForm(setGameForm, 'color')} required />
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
                    <button className="icon-button danger" type="button" onClick={() => removeGame(game)} title="Delete game">
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {adminTab === 'user' && (
            <section className="event-form">
              <div className="section-heading">
                <UserRound size={20} />
                <h2>{userForm.uid ? 'Edit User' : 'Create User'}</h2>
              </div>
              <form className="game-entry-form" onSubmit={submitManagedUser}>
                <label>
                  Name
                  <input value={userForm.name} onChange={bindForm(setUserForm, 'name')} required />
                </label>
                <label>
                  Email
                  <input value={userForm.email} onChange={bindForm(setUserForm, 'email')} type="email" required />
                </label>
                <label>
                  Role
                  <select value={userForm.role} onChange={bindForm(setUserForm, 'role')} required>
                    <option value="gm">Game Master</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                {!userForm.uid && (
                  <label>
                    Temporary password
                    <div className="password-field">
                      <input
                        value={userForm.password}
                        onChange={bindForm(setUserForm, 'password')}
                        type={showUserPassword ? 'text' : 'password'}
                        minLength={6}
                        required
                      />
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => setShowUserPassword((current) => !current)}
                        title={showUserPassword ? 'Hide password' : 'Show password'}
                      >
                        {showUserPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </label>
                )}
                <label className="toggle-row">
                  <input type="checkbox" checked={userForm.active} onChange={(event) => setUserForm((current) => ({ ...current, active: event.target.checked }))} />
                  Active
                </label>
                <div className="form-actions">
                  {userForm.uid && (
                    <button className="button secondary" type="button" onClick={resetUserForm}>
                      Cancel
                    </button>
                  )}
                  <button className="button" type="submit" disabled={busy}>
                    {busy ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
                    {userForm.uid ? 'Save User' : 'Create Login'}
                  </button>
                </div>
              </form>
              <div className="game-list">
                {managedUsers.length === 0 && <p>No managed users yet.</p>}
                {managedUsers.map((managedUser) => {
                  const uid = managedUser.uid || managedUser.id;
                  const isCurrentUser = uid === user.uid;
                  const roleLabel = managedUser.role === 'admin' ? 'Admin' : 'GM';
                  const accessTitle = managedUser.active === false ? 'Enable user' : 'Disable user';
                  return (
                  <article className="game-entry user-entry" key={uid}>
                    <span className={managedUser.active === false ? 'status-dot ended' : 'status-dot ongoing'} />
                    <span>{managedUser.name || 'Unnamed'} / {managedUser.email || 'No email'} / {roleLabel}{managedUser.legacy ? ' / Legacy' : ''}</span>
                    <button className="icon-button" type="button" onClick={() => editManagedUser(managedUser)} title="Edit user">
                      <Edit3 size={17} />
                    </button>
                    <button className="icon-button" type="button" onClick={() => resetManagedUserPassword(managedUser)} title="Send password reset email" disabled={!managedUser.email || busy}>
                      <Mail size={17} />
                    </button>
                    <button className="icon-button" type="button" onClick={() => toggleManagedUserDisabled(managedUser)} title={accessTitle} disabled={isCurrentUser || busy}>
                      {managedUser.active === false ? <UserCheck size={17} /> : <UserX size={17} />}
                    </button>
                    <button className="icon-button danger" type="button" onClick={() => removeManagedUser(managedUser)} title="Hard-delete user" disabled={isCurrentUser || busy}>
                      <Trash2 size={17} />
                    </button>
                  </article>
                  );
                })}
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
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
