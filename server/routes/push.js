import { Router } from 'express';
import { HttpError, requireUser } from '../auth.js';
import { str } from '../validate.js';

export function pushRouter({ db, notifier }) {
  const r = Router();
  r.use(requireUser);

  r.get('/push/key', (_req, res) => res.json({ publicKey: notifier.publicKey }));

  // A device subscribes on behalf of whoever is logged in on it.
  r.post('/push/subscribe', (req, res) => {
    const sub = req.body.subscription ?? {};
    const endpoint = str(sub.endpoint, 'Endpoint', { max: 1000 });
    if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, 'Ugyldigt endpoint');
    const p256dh = str(sub.keys?.p256dh, 'p256dh', { max: 200 });
    const auth = str(sub.keys?.auth, 'auth', { max: 100 });
    db.prepare(`
      INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `).run(endpoint, req.user.id, p256dh, auth);
    res.status(204).end();
  });

  r.post('/push/unsubscribe', (req, res) => {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .run(String(req.body.endpoint ?? ''), req.user.id);
    res.status(204).end();
  });

  r.get('/me/notifications', (req, res) => res.json(prefs(db, req.user.id)));

  r.put('/me/notifications', (req, res) => {
    const current = prefs(db, req.user.id);
    const chat = req.body.chat ?? current.chat;
    if (!['all', 'mine', 'off'].includes(chat)) throw new HttpError(400, 'Ugyldigt valg for chat');
    const events = req.body.events === undefined ? current.events : Boolean(req.body.events);
    db.prepare(`
      INSERT INTO notification_prefs (user_id, chat, events) VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET chat = excluded.chat, events = excluded.events
    `).run(req.user.id, chat, events ? 1 : 0);
    res.json(prefs(db, req.user.id));
  });

  return r;
}

function prefs(db, userId) {
  const row = db.prepare('SELECT chat, events FROM notification_prefs WHERE user_id = ?').get(userId);
  const devices = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;
  return { chat: row?.chat ?? 'mine', events: row ? Boolean(row.events) : true, devices };
}
