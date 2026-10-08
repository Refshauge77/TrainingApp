import { useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';

export default function Login() {
  const { setUser } = useSession();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setUser(await api.post(mode === 'login' ? '/auth/login' : '/auth/register', form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img src="/icon.svg" alt="" className="login-logo" />
      <h1>Holte Roklub</h1>
      <p className="muted">Træninger, aftaler og snak – samlet ét sted.</p>

      <form className="card form" onSubmit={submit}>
        {mode === 'register' && (
          <label>Navn<input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
        )}
        <label>E-mail<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
        <label>Adgangskode
          <input type="password" value={form.password} onChange={set('password')} minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        </label>
        {mode === 'register' && (
          <label>Klubkode
            <input value={form.inviteCode} onChange={set('inviteCode')} autoCapitalize="none" />
            <small className="muted">Få koden af en træner eller bestyrelsen.</small>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Log ind' : 'Opret bruger'}</button>
      </form>

      <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Ny i klubben? Opret en bruger' : 'Har du allerede en bruger? Log ind'}
      </button>
    </div>
  );
}
