import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABELS, useSession } from '../session.jsx';
import Header from '../components/Header.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';
import { disablePush } from '../push.js';
import { initials } from './EventDetail.jsx';

export default function Members() {
  const { user, setUser } = useSession();
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone ?? '', currentPassword: '', newPassword: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/members').then(setMembers, (err) => setError(err.message));
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      const updated = await api.patch('/me', profile);
      setUser(updated);
      setProfile({ ...profile, currentPassword: '', newPassword: '' });
      setStatus('Gemt');
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeRole(member, role) {
    try {
      const updated = await api.patch(`/members/${member.id}`, { role });
      setMembers(members.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPassword(member) {
    const password = prompt(`Ny adgangskode til ${member.name} (mindst 8 tegn). Giv den til medlemmet, som kan skifte den bagefter.`);
    if (!password) return;
    try {
      await api.put(`/members/${member.id}/password`, { password });
      alert(`${member.name} har fået en ny adgangskode.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function logout() {
    // This device should stop receiving this member's notifications.
    await disablePush().catch(() => {});
    await api.post('/auth/logout');
    setUser(null);
  }

  const set = (key) => (e) => setProfile({ ...profile, [key]: e.target.value });

  return (
    <>
      <Header title="Klubben" actions={<button className="btn outline small-btn" onClick={logout}>Log ud</button>} />

      <section className="card">
        <h3>Min profil</h3>
        <form className="form" onSubmit={saveProfile}>
          <p className="muted small">{user.email} · {ROLE_LABELS[user.role]}</p>
          <label>Navn<input value={profile.name} onChange={set('name')} required maxLength={80} /></label>
          <label>Telefon<input type="tel" value={profile.phone} onChange={set('phone')} maxLength={30} /></label>
          <details>
            <summary>Skift adgangskode</summary>
            <label>Nuværende adgangskode<input type="password" value={profile.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" /></label>
            <label>Ny adgangskode<input type="password" value={profile.newPassword} onChange={set('newPassword')} minLength={8} autoComplete="new-password" /></label>
          </details>
          {error && <p className="error">{error}</p>}
          {status && <p className="success">{status}</p>}
          <button className="btn primary">Gem</button>
        </form>
      </section>

      <NotificationSettings />

      <section className="card">
        <h3>Medlemmer ({members.length})</h3>
        <ul className="people members">
          {members.map((m) => (
            <li key={m.id}>
              <span className="avatar">{initials(m.name)}</span>
              <span className="grow">
                {m.name}
                <span className="muted small block">
                  {m.phone ? <a href={`tel:${m.phone}`}>{m.phone}</a> : m.email}
                </span>
              </span>
              {user.role === 'admin' && m.id !== user.id && (
                <button className="link small" onClick={() => resetPassword(m)}>Ny kode</button>
              )}
              {user.role === 'admin' ? (
                <select value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Rolle for ${m.name}`}>
                  {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              ) : (
                m.role !== 'member' && <span className="pill">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
        {user.role === 'admin' && (
          <p className="muted small">Trænere kan oprette og redigere træninger og løb. Administratorer kan desuden ændre roller.</p>
        )}
      </section>
    </>
  );
}
