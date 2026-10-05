import { Router } from 'express';
import { HttpError, requireUser } from '../auth.js';
import { transaction } from '../db.js';
import { id, str } from '../validate.js';

const PAGE_SIZE = 50;

export function threadsRouter({ db, hub }) {
  const r = Router();
  r.use(requireUser);

  const messageSelect = `
    SELECT m.id, m.thread_id, m.user_id, u.name AS user_name, m.created_at, m.deleted,
      CASE WHEN m.deleted THEN '' ELSE m.body END AS body,
      m.reply_to,
      CASE WHEN p.deleted THEN '' ELSE p.body END AS reply_body,
      pu.name AS reply_user_name
    FROM messages m
    LEFT JOIN users u  ON u.id = m.user_id
    LEFT JOIN messages p ON p.id = m.reply_to
    LEFT JOIN users pu ON pu.id = p.user_id
  `;
  const getMessage = db.prepare(`${messageSelect} WHERE m.id = ?`);

  // Thread overview, newest activity first. Event threads only show up once someone has written in them.
  r.get('/threads', (req, res) => {
    const rows = db.prepare(`
      SELECT t.id, COALESCE(e.title, t.title) AS title, t.event_id, t.created_by, t.created_at, t.last_message_at,
        e.start_at AS event_start, e.type AS event_type,
        lm.body AS last_body, lm.deleted AS last_deleted, lu.name AS last_user_name,
        (SELECT COUNT(*) FROM messages m
           WHERE m.thread_id = t.id AND m.id > COALESCE(tr.last_message_id, 0)
             AND (m.user_id IS NULL OR m.user_id != ?)) AS unread
      FROM threads t
      LEFT JOIN events e ON e.id = t.event_id
      LEFT JOIN thread_reads tr ON tr.thread_id = t.id AND tr.user_id = ?
      LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE thread_id = t.id)
      LEFT JOIN users lu ON lu.id = lm.user_id
      WHERE t.event_id IS NULL OR t.last_message_at IS NOT NULL
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
    `).all(req.user.id, req.user.id);
    res.json(rows.map((row) => ({
      ...row,
      last_body: row.last_deleted ? 'Beskeden er slettet' : row.last_body,
      last_deleted: undefined,
    })));
  });

  r.post('/threads', (req, res) => {
    const title = str(req.body.title, 'Emne', { max: 120 });
    const body = str(req.body.body, 'Besked', { max: 4000, required: false });
    const threadId = transaction(db, () => {
      const tid = Number(db.prepare('INSERT INTO threads (title, created_by) VALUES (?, ?)')
        .run(title, req.user.id).lastInsertRowid);
      if (body) insertMessage(tid, req.user.id, body, null);
      return tid;
    });
    hub.broadcast({ type: 'threads-changed', threadId });
    res.status(201).json({ id: threadId });
  });

  r.get('/threads/:id', (req, res) => {
    const thread = loadThread(id(req.params.id));
    const before = req.query.before ? id(req.query.before) : Number.MAX_SAFE_INTEGER;
    const messages = db.prepare(`${messageSelect} WHERE m.thread_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
      .all(thread.id, before, PAGE_SIZE + 1);
    const hasMore = messages.length > PAGE_SIZE;
    res.json({
      ...thread,
      messages: messages.slice(0, PAGE_SIZE).reverse().map(serializeMessage),
      has_more: hasMore,
    });
  });

  r.patch('/threads/:id', (req, res) => {
    const thread = loadThread(id(req.params.id));
    assertOwnerOrAdmin(thread.created_by, req.user, 'Du kan kun omdøbe dine egne tråde');
    if (thread.event_id) throw new HttpError(400, 'Tråde for aftaler får navn efter aftalen');
    db.prepare('UPDATE threads SET title = ? WHERE id = ?').run(str(req.body.title, 'Emne', { max: 120 }), thread.id);
    hub.broadcast({ type: 'threads-changed', threadId: thread.id });
    res.json(loadThread(thread.id));
  });

  r.delete('/threads/:id', (req, res) => {
    const thread = loadThread(id(req.params.id));
    assertOwnerOrAdmin(thread.created_by, req.user, 'Du kan kun slette dine egne tråde');
    db.prepare('DELETE FROM threads WHERE id = ?').run(thread.id);
    hub.broadcast({ type: 'threads-changed', threadId: thread.id });
    res.status(204).end();
  });

  r.post('/threads/:id/messages', (req, res) => {
    const thread = loadThread(id(req.params.id));
    const body = str(req.body.body, 'Besked', { max: 4000 });
    let replyTo = null;
    if (req.body.reply_to) {
      replyTo = id(req.body.reply_to);
      const parent = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(replyTo);
      if (!parent || parent.thread_id !== thread.id) throw new HttpError(400, 'Beskeden der svares på findes ikke');
    }
    const messageId = insertMessage(thread.id, req.user.id, body, replyTo);
    const message = serializeMessage(getMessage.get(messageId));
    hub.broadcast({ type: 'message', threadId: thread.id, message });
    res.status(201).json(message);
  });

  r.delete('/messages/:id', (req, res) => {
    const message = db.prepare('SELECT id, thread_id, user_id FROM messages WHERE id = ?').get(id(req.params.id));
    if (!message) throw new HttpError(404, 'Beskeden findes ikke');
    assertOwnerOrAdmin(message.user_id, req.user, 'Du kan kun slette dine egne beskeder');
    db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(message.id);
    hub.broadcast({ type: 'message-deleted', threadId: message.thread_id, messageId: message.id });
    res.status(204).end();
  });

  r.post('/threads/:id/read', (req, res) => {
    const thread = loadThread(id(req.params.id));
    const lastId = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE thread_id = ?').get(thread.id).id;
    db.prepare(`
      INSERT INTO thread_reads (thread_id, user_id, last_message_id) VALUES (?, ?, ?)
      ON CONFLICT (thread_id, user_id) DO UPDATE SET last_message_id = MAX(last_message_id, excluded.last_message_id)
    `).run(thread.id, req.user.id, lastId);
    res.status(204).end();
  });

  function insertMessage(threadId, userId, body, replyTo) {
    return transaction(db, () => {
      const messageId = Number(db.prepare('INSERT INTO messages (thread_id, user_id, body, reply_to) VALUES (?, ?, ?, ?)')
        .run(threadId, userId, body, replyTo).lastInsertRowid);
      db.prepare("UPDATE threads SET last_message_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(threadId);
      // Your own message means you have read the thread up to here.
      db.prepare(`
        INSERT INTO thread_reads (thread_id, user_id, last_message_id) VALUES (?, ?, ?)
        ON CONFLICT (thread_id, user_id) DO UPDATE SET last_message_id = excluded.last_message_id
      `).run(threadId, userId, messageId);
      return messageId;
    });
  }

  function loadThread(threadId) {
    const thread = db.prepare(`
      SELECT t.id, COALESCE(e.title, t.title) AS title, t.event_id, t.created_by, t.created_at, e.start_at AS event_start, e.type AS event_type
      FROM threads t LEFT JOIN events e ON e.id = t.event_id WHERE t.id = ?
    `).get(threadId);
    if (!thread) throw new HttpError(404, 'Tråden findes ikke');
    return thread;
  }

  return r;
}

function serializeMessage(m) {
  return { ...m, deleted: Boolean(m.deleted) };
}

function assertOwnerOrAdmin(ownerId, user, message) {
  if (user.role !== 'admin' && ownerId !== user.id) throw new HttpError(403, message);
}
