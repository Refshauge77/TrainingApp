import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { currentSubscription, disablePush, enablePush, permission, pushSupport } from '../push.js';

export default function NotificationSettings() {
  const support = pushSupport();
  const [enabled, setEnabled] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    currentSubscription().then((s) => setEnabled(Boolean(s) && permission() === 'granted'), () => setEnabled(false));
    api.get('/me/notifications').then(setPrefs, () => {});
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (enabled) await disablePush();
      else await enablePush();
      setEnabled(!enabled);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(change) {
    setPrefs({ ...prefs, ...change });
    try {
      setPrefs(await api.put('/me/notifications', change));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h3>Notifikationer</h3>
      {support === 'ios-install' && (
        <p className="muted">
          På iPhone skal appen først lægges på hjemmeskærmen: tryk på <b>Del</b>-knappen i Safari og vælg
          <b> Føj til hjemmeskærm</b>. Åbn derefter appen derfra og slå notifikationer til her.
        </p>
      )}
      {support === 'unsupported' && <p className="muted">Denne browser understøtter ikke notifikationer.</p>}
      {support === 'ok' && (
        <>
          <div className="setting-row">
            <span className="grow">
              Notifikationer på denne enhed
              <span className="muted small block">
                {permission() === 'denied'
                  ? 'Blokeret – tillad notifikationer for appen i indstillingerne'
                  : enabled ? 'Slået til' : 'Slået fra'}
              </span>
            </span>
            <button className={`btn ${enabled ? 'outline' : 'primary'}`} disabled={busy || enabled === null || permission() === 'denied'}
              onClick={toggle}>
              {enabled ? 'Slå fra' : 'Slå til'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
      {prefs && (
        <div className="form notification-prefs">
          <label>Giv besked om chat-beskeder
            <select value={prefs.chat} onChange={(e) => update({ chat: e.target.value })}>
              <option value="mine">Kun i tråde jeg deltager i</option>
              <option value="all">I alle tråde</option>
              <option value="off">Aldrig</option>
            </select>
            <small className="muted">"Deltager i" = tråde du har startet eller skrevet i, og tråde for aftaler du er tilmeldt.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.events} onChange={(e) => update({ events: e.target.checked })} />
            Nye træninger og aftaler, samt aflysninger og ændrede tidspunkter for det, jeg er tilmeldt
          </label>
          {prefs.devices > 1 && <p className="muted small">Slået til på {prefs.devices} enheder.</p>}
        </div>
      )}
    </section>
  );
}
