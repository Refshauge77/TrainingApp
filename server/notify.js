import webpush from 'web-push';

const NEW_EVENT_TITLES = { training: 'Ny træning', competition: 'Nyt løb', social: 'Ny aftale', other: 'Ny aftale' };

/**
 * VAPID keys identify this server to the browsers' push services. They come from
 * the environment, or are generated once and kept in the database.
 */
export function vapidKeys(db) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get();
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
  return keys;
}

function webPushSender(keys) {
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  return async (subscription, payload) => {
    // web-push encrypts and signs; the request itself goes out with fetch.
    const { endpoint, method, headers, body } = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: { subject, ...keys },
      TTL: 24 * 3600,
    });
    delete headers['Content-Length'];
    const res = await fetch(endpoint, { method, headers, body, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      throw Object.assign(new Error(`Push-tjenesten svarede ${res.status}`), { statusCode: res.status, body: await res.text() });
    }
  };
}

/**
 * Decides who gets a push notification for what, and sends it to all their devices.
 * Sending never blocks or fails the API request that triggered it.
 */
export function createNotifier({ db, send, timeZone = process.env.CLUB_TIMEZONE ?? 'Europe/Copenhagen' }) {
  const keys = vapidKeys(db);
  send ??= webPushSender(keys);
  const pending = new Set();

  const fmtWhen = new Intl.DateTimeFormat('da-DK', {
    timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const when = (iso) => fmtWhen.format(new Date(iso));

  const prefsJoin = 'LEFT JOIN notification_prefs p ON p.user_id = u.id';

  function toUsers(userIds, payload) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const body = JSON.stringify(payload);
    for (const sub of subs) {
      const job = Promise.resolve()
        .then(() => send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body))
        .catch((err) => {
          // 404/410: the browser has dropped the subscription, so forget it.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
          } else {
            console.error('Push-notifikation fejlede:', err?.statusCode ?? '', err?.body ?? err?.message ?? err);
          }
        })
        .finally(() => pending.delete(job));
      pending.add(job);
    }
  }

  function chatMessage(threadId, message) {
    const thread = db.prepare(`
      SELECT t.id, t.created_by, t.event_id, COALESCE(e.title, t.title) AS title
      FROM threads t LEFT JOIN events e ON e.id = t.event_id WHERE t.id = ?
    `).get(threadId);
    // 'all' = every thread; 'mine' = threads you started, wrote in, or for an event you're signed up for.
    const recipients = db.prepare(`
      SELECT u.id FROM users u ${prefsJoin}
      WHERE u.id != ? AND (
        COALESCE(p.chat, 'mine') = 'all'
        OR (COALESCE(p.chat, 'mine') = 'mine' AND (
          ? = u.id
          OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = ? AND m.user_id = u.id)
          OR EXISTS (SELECT 1 FROM event_responses r WHERE r.event_id = ? AND r.user_id = u.id AND r.status = 'yes')
        ))
      )
    `).all(message.user_id, thread.created_by, thread.id, thread.event_id).map((r) => r.id);
    toUsers(recipients, {
      title: thread.title,
      body: `${message.user_name}: ${truncate(message.body, 140)}`,
      url: `/chat/${thread.id}`,
      tag: `thread-${thread.id}`,
    });
  }

  function eventsCreated(event, count, actorId) {
    const recipients = db.prepare(`
      SELECT u.id FROM users u ${prefsJoin} WHERE u.id != ? AND COALESCE(p.events, 1) = 1
    `).all(actorId).map((r) => r.id);
    const repeat = count > 1 ? ` (+ ${count - 1} gentagelser)` : '';
    toUsers(recipients, {
      title: `${NEW_EVENT_TITLES[event.type]}: ${event.title}`,
      body: `${capitalize(when(event.start_at))}${repeat}${event.location ? ` · ${event.location}` : ''}`,
      url: `/aftaler/${event.id}`,
      tag: `event-${event.id}`,
    });
  }

  /** Something important changed for people who are signed up (cancelled, moved, deleted). */
  function eventChanged(event, kind, actorId, signedUp = null) {
    signedUp ??= db.prepare("SELECT user_id FROM event_responses WHERE event_id = ? AND status = 'yes'")
      .all(event.id).map((r) => r.user_id);
    if (new Date(event.end_at) < new Date()) return;
    const wanted = new Set(db.prepare(`SELECT u.id FROM users u ${prefsJoin} WHERE COALESCE(p.events, 1) = 1`).all().map((r) => r.id));
    const recipients = signedUp.filter((id) => id !== actorId && wanted.has(id));
    const titles = {
      cancelled: `Aflyst: ${event.title}`,
      deleted: `Aflyst: ${event.title}`,
      moved: `Nyt tidspunkt: ${event.title}`,
    };
    toUsers(recipients, {
      title: titles[kind],
      body: kind === 'moved' ? `Nu ${when(event.start_at)}` : `${capitalize(when(event.start_at))} – du var tilmeldt`,
      url: kind === 'deleted' ? '/kalender' : `/aftaler/${event.id}`,
      tag: `event-${event.id}`,
    });
  }

  return {
    publicKey: keys.publicKey,
    chatMessage,
    eventsCreated,
    eventChanged,
    /** Resolves when all notifications sent so far are done (used by tests). */
    flush: () => Promise.all([...pending]),
  };
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
