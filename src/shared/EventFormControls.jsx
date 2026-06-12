import { RefreshCw } from 'lucide-react';

export function PublishedSwitch({ checked, setForm }) {
  return (
    <label className="switch-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span>
        <span className="switch-label">Published</span>
        <small>Visible in Public Calendar</small>
      </span>
    </label>
  );
}

export function InvitePanel({ editing, form, generateInvitePin, invitePin, setForm, setInvitePin, shareUrl }) {
  const toggleInvite = (enabled) => {
    setForm((current) => ({ ...current, inviteEnabled: enabled }));
    setInvitePin(enabled ? generateInvitePin() : '');
  };

  return (
    <div className="invite-panel">
      <label className="switch-row">
        <input
          type="checkbox"
          checked={form.inviteEnabled}
          onChange={(event) => toggleInvite(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span>
          <span className="switch-label">Invite enabled</span>
          <small>Allow player to join this event through pin code and game link</small>
        </span>
      </label>

      {form.inviteEnabled && (
        <label>
          6-digit PIN
          <div className="field-with-action">
            <input
              value={invitePin}
              onChange={(event) => setInvitePin(event.target.value.replace(/\D/g, '').slice(0, 6))}
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

      {editing && form.inviteEnabled && (
        <label>
          Invite link
          <input value={shareUrl} readOnly />
        </label>
      )}
    </div>
  );
}
