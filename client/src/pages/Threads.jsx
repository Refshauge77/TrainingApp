import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmtChatStamp, fmtShortDay } from '../dates.js';
import { useLive } from '../session.jsx';
import Header from '../components/Header.jsx';
import Icon from '../components/Icon.jsx';
import { EVENT_TYPES } from '../components/eventTypes.js';

export default function Threads() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/threads').then(setThreads, (err) => setError(err.message));
  }, []);
  useEffect(load, [load]);
  useLive((msg) => {
    if (['message', 'message-deleted', 'threads-changed', 'events-changed'].includes(msg.type)) load();
  });

  async function create(e) {
    e.preventDefault();
    try {
      const { id } = await api.post('/threads', form);
      navigate(`/chat/${id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const shown = (threads ?? []).filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <Header title="Chat" actions={(
        <button className="icon-btn primary" aria-label="Ny tråd" onClick={() => setCreating(!creating)}>
          <Icon name={creating ? 'close' : 'plus'} />
        </button>
      )} />

      {creating && (
        <form className="card form new-thread" onSubmit={create}>
          <label>Emne<input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Fx Samkørsel til DM" maxLength={120} required /></label>
          <label>Første besked<textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
          <button className="btn primary">Opret tråd</button>
        </form>
      )}

      {threads?.length > 5 && (
        <div className="pad search"><input type="search" placeholder="Søg i tråde" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      )}
      {error && <p className="error pad">{error}</p>}
      {threads === null && <p className="muted pad">Indlæser…</p>}
      {threads?.length === 0 && (
        <div className="empty">
          <p>Ingen tråde endnu. Start en tråd om et emne – fx samkørsel, udstyr eller sommerturen.</p>
          <p className="muted small">Hver aftale i kalenderen har også sin egen tråd.</p>
        </div>
      )}

      <ul className="thread-list">
        {shown.map((t) => (
          <li key={t.id}>
            <Link to={`/chat/${t.id}`} className={t.unread ? 'unread' : ''}>
              <span className="thread-avatar" style={{ background: t.event_type ? EVENT_TYPES[t.event_type].color : 'var(--accent)' }}>
                <Icon name={t.event_id ? 'calendar' : 'chat'} size={20} />
              </span>
              <span className="thread-main">
                <span className="thread-top">
                  <strong>{t.title}</strong>
                  <time>{fmtChatStamp(t.last_message_at ?? t.created_at)}</time>
                </span>
                <span className="thread-bottom">
                  <span className="preview">
                    {t.event_start && <em>{fmtShortDay(t.event_start)} · </em>}
                    {t.last_body ? <>{t.last_user_name ?? 'Tidligere medlem'}: {t.last_body}</> : 'Ingen beskeder endnu'}
                  </span>
                  {t.unread > 0 && <b className="badge">{t.unread}</b>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
