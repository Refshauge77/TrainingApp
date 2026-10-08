import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { syncSubscription } from './push.js';
import { SessionContext, createLiveBus } from './session.jsx';
import Login from './pages/Login.jsx';
import Calendar from './pages/Calendar.jsx';
import EventDetail from './pages/EventDetail.jsx';
import EventForm from './pages/EventForm.jsx';
import Threads from './pages/Threads.jsx';
import Thread from './pages/Thread.jsx';
import Members from './pages/Members.jsx';
import Icon from './components/Icon.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [unread, setUnread] = useState(0);
  const live = useMemo(createLiveBus, []);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/me').then(setUser, () => setUser(null));
  }, []);

  // Tapping a notification while the app is open: the service worker asks us to navigate.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e) => { if (e.data?.type === 'navigate') navigate(e.data.url); };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    if (user) syncSubscription().catch(() => {});
  }, [user?.id]);

  // One live connection per logged-in browser tab.
  useEffect(() => {
    if (!user) return;
    const source = new EventSource('/api/stream');
    source.onmessage = (e) => live.emit(JSON.parse(e.data));
    return () => source.close();
  }, [user?.id, live]);

  // Unread badge for the chat tab.
  useEffect(() => {
    if (!user) return;
    const refresh = () => api.get('/threads')
      .then((threads) => setUnread(threads.reduce((sum, t) => sum + t.unread, 0)))
      .catch(() => {});
    refresh();
    const unsubscribe = live.subscribe((msg) => {
      if (msg.type === 'message' || msg.type === 'threads-changed' || msg.type === 'read') refresh();
    });
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, live]);

  if (user === undefined) return <div className="splash">Indlæser…</div>;

  const session = { user, setUser, live };
  if (!user) {
    return (
      <SessionContext.Provider value={session}>
        <Login />
      </SessionContext.Provider>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="app">
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/kalender" replace />} />
            <Route path="/kalender" element={<Calendar />} />
            <Route path="/aftaler/ny" element={<EventForm />} />
            <Route path="/aftaler/:id" element={<EventDetail />} />
            <Route path="/aftaler/:id/rediger" element={<EventForm />} />
            <Route path="/chat" element={<Threads />} />
            <Route path="/chat/:id" element={<Thread />} />
            <Route path="/medlemmer" element={<Members />} />
            <Route path="*" element={<Navigate to="/kalender" replace />} />
          </Routes>
        </main>
        <nav className="tabbar">
          <NavLink to="/kalender"><Icon name="calendar" /><span>Kalender</span></NavLink>
          <NavLink to="/chat">
            <Icon name="chat" /><span>Chat</span>
            {unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
          </NavLink>
          <NavLink to="/medlemmer"><Icon name="people" /><span>Klubben</span></NavLink>
        </nav>
      </div>
    </SessionContext.Provider>
  );
}
