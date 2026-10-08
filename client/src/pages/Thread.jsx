import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDay, fmtShortDay, fmtTime, sameDay } from '../dates.js';
import { useLive, useSession } from '../session.jsx';
import Header from '../components/Header.jsx';
import Icon from '../components/Icon.jsx';

export default function Thread() {
  const { id } = useParams();
  const threadId = Number(id);
  const { user, live } = useSession();
  const navigate = useNavigate();
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const inputRef = useRef(null);

  const markRead = useCallback(() => {
    api.post(`/threads/${threadId}/read`).then(() => live.emit({ type: 'read' })).catch(() => {});
  }, [threadId, live]);

  useEffect(() => {
    setThread(null);
    stickToBottom.current = true;
    api.get(`/threads/${threadId}`).then((data) => {
      setThread(data);
      setMessages(data.messages);
      setHasMore(data.has_more);
      markRead();
    }, (err) => setError(err.message));
  }, [threadId, markRead]);

  useLive((msg) => {
    if (msg.threadId !== threadId) return;
    if (msg.type === 'message') {
      setMessages((list) => (list.some((m) => m.id === msg.message.id) ? list : [...list, msg.message]));
      if (document.visibilityState === 'visible') markRead();
    } else if (msg.type === 'message-deleted') {
      setMessages((list) => list.map((m) => (m.id === msg.messageId ? { ...m, deleted: true, body: '' } : m)));
    } else if (msg.type === 'threads-changed') {
      api.get(`/threads/${threadId}`).then((data) => setThread(data), () => navigate('/chat', { replace: true }));
    }
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    const el = listRef.current;
    const prevHeight = el.scrollHeight;
    const data = await api.get(`/threads/${threadId}?before=${messages[0].id}`);
    stickToBottom.current = false;
    setMessages((list) => [...data.messages, ...list]);
    setHasMore(data.has_more);
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight; });
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    setError('');
    stickToBottom.current = true;
    try {
      const message = await api.post(`/threads/${threadId}/messages`, { body, reply_to: replyTo?.id });
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      setReplyTo(null);
    } catch (err) {
      setText(body);
      setError(err.message);
    }
    inputRef.current?.focus();
  }

  async function removeMessage(m) {
    setSelected(null);
    if (confirm('Slet beskeden?')) await api.delete(`/messages/${m.id}`).catch((err) => setError(err.message));
  }

  async function renameThread() {
    const title = prompt('Nyt emne for tråden', thread.title);
    if (title?.trim()) setThread({ ...thread, ...(await api.patch(`/threads/${threadId}`, { title })) });
  }

  async function deleteThread() {
    if (!confirm('Slet hele tråden med alle beskeder?')) return;
    await api.delete(`/threads/${threadId}`);
    navigate('/chat', { replace: true });
  }

  if (!thread) {
    return <><Header title="Chat" back="/chat" />{error ? <p className="error pad">{error}</p> : <p className="muted pad">Indlæser…</p>}</>;
  }

  const mayManage = user.role === 'admin' || thread.created_by === user.id;

  return (
    <div className="thread-page">
      <Header
        title={thread.title}
        subtitle={thread.event_id ? <Link to={`/aftaler/${thread.event_id}`}>Aftale {fmtShortDay(thread.event_start)} · se detaljer</Link> : null}
        back="/chat"
        actions={mayManage && !thread.event_id && (
          <>
            <button className="icon-btn" aria-label="Omdøb tråd" onClick={renameThread}><Icon name="edit" /></button>
            <button className="icon-btn" aria-label="Slet tråd" onClick={deleteThread}><Icon name="trash" /></button>
          </>
        )}
      />

      <div className="messages" ref={listRef} onScroll={onScroll} onClick={() => setSelected(null)}>
        {hasMore && <button className="btn outline small-btn" onClick={loadOlder}>Hent ældre beskeder</button>}
        {messages.length === 0 && <p className="muted center">Ingen beskeder endnu – skriv den første!</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.user_id === user.id;
          const newDay = !prev || !sameDay(prev.created_at, m.created_at);
          const grouped = !newDay && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60e3;
          return (
            <div key={m.id}>
              {newDay && <div className="day-divider"><span>{sameDay(m.created_at, new Date()) ? 'I dag' : fmtDay(m.created_at)}</span></div>}
              <div className={`bubble-row ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
                <div className={`bubble${m.deleted ? ' deleted' : ''}`}
                  onClick={(e) => { e.stopPropagation(); if (!m.deleted) setSelected(selected === m.id ? null : m.id); }}>
                  {!mine && !grouped && <span className="author">{m.user_name ?? 'Tidligere medlem'}</span>}
                  {m.reply_to && (
                    <span className="quote">
                      <b>{m.reply_user_name ?? 'Tidligere medlem'}</b>
                      <span>{m.reply_body || 'Beskeden er slettet'}</span>
                    </span>
                  )}
                  <span className="text">{m.deleted ? 'Beskeden er slettet' : m.body}</span>
                  <time>{fmtTime(m.created_at)}</time>
                </div>
                {selected === m.id && (
                  <div className="bubble-actions">
                    <button onClick={() => { setReplyTo(m); setSelected(null); inputRef.current?.focus(); }}><Icon name="reply" size={16} /> Svar</button>
                    {(mine || user.role === 'admin') && <button onClick={() => removeMessage(m)}><Icon name="trash" size={16} /> Slet</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form className="composer" onSubmit={send}>
        {error && <p className="error small">{error}</p>}
        {replyTo && (
          <div className="replying">
            <span><b>Svarer {replyTo.user_name}</b>{replyTo.body}</span>
            <button type="button" className="icon-btn" aria-label="Annuller svar" onClick={() => setReplyTo(null)}><Icon name="close" size={18} /></button>
          </div>
        )}
        <div className="composer-row">
          <textarea ref={inputRef} rows={1} value={text} placeholder="Skriv en besked" maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on desktop; on phones the keyboard's return key inserts a new line.
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) send(e);
            }} />
          <button className="send" aria-label="Send" disabled={!text.trim()}><Icon name="send" /></button>
        </div>
      </form>
    </div>
  );
}
