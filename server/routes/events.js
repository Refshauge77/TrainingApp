import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { HttpError, canPlanTrainings, requireUser } from '../auth.js';
import { transaction } from '../db.js';
import { id, isoDate, str } from '../validate.js';

export const EVENT_TYPES = ['training', 'competition', 'social', 'other'];
const PLANNER_ONLY_TYPES = ['training', 'competition'];
const MAX_OCCURRENCES = 60;

export function eventsRouter({ db, hub, notifier }) {
  const r = Router();
  r.use(requireUser);

  const listStmt = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'yes') AS yes_count,
      (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'no')  AS no_count,
      (SELECT status FROM event_responses WHERE event_id = e.id AND user_id = ?)      AS my_status
    FROM events e
    WHERE e.end_at >= ? AND e.start_at < ?
    ORDER BY e.start_at
  `);

  r.get('/events', (req, res) => {
    const from = req.query.from ? isoDate(req.query.from, 'Fra') : new Date(Date.now() - 864e5).toISOString();
    const to = req.query.to ? isoDate(req.query.to, 'Til') : new Date(Date.now() + 90 * 864e5).toISOString();
    res.json(listStmt.all(req.user.id, from, to).map(serialize));
  });

  r.get('/events/:id', (req, res) => {
    res.json(eventDetail(db, id(req.params.id), req.user.id));
  });

  r.post('/events', (req, res) => {
    const fields = parseFields(req.body);
    assertMayCreate(req.user, fields.type);

    const occurrences = Array.isArray(req.body.occurrences) && req.body.occurrences.length
      ? req.body.occurrences
      : [{ start_at: req.body.start_at, end_at: req.body.end_at }];
    if (occurrences.length > MAX_OCCURRENCES) {
      throw new HttpError(400, `Man kan højst oprette ${MAX_OCCURRENCES} gentagelser ad gangen`);
    }
    const times = occurrences.map(parseTimes);
    const seriesId = times.length > 1 ? randomUUID() : null;

    const insert = db.prepare(`
      INSERT INTO events (type, title, description, location, program, capacity, start_at, end_at, series_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const ids = transaction(db, () => times.map(({ start_at, end_at }) => Number(insert.run(
      fields.type, fields.title, fields.description, fields.location, fields.program, fields.capacity,
      start_at, end_at, seriesId, req.user.id,
    ).lastInsertRowid)));

    hub.broadcast({ type: 'events-changed' });
    const event = eventDetail(db, ids[0], req.user.id);
    notifier.eventsCreated(event, ids.length, req.user.id);
    res.status(201).json({ ids, event });
  });

  r.patch('/events/:id', (req, res) => {
    const event = loadEditable(db, id(req.params.id), req.user);
    const fields = parseFields({ ...serialize(event), ...req.body });
    if (fields.type !== event.type) assertMayCreate(req.user, fields.type);
    const { start_at, end_at } = parseTimes({ start_at: req.body.start_at ?? event.start_at, end_at: req.body.end_at ?? event.end_at });
    const cancelled = req.body.cancelled === undefined ? event.cancelled : (req.body.cancelled ? 1 : 0);

    transaction(db, () => {
      db.prepare(`
        UPDATE events SET type = ?, title = ?, description = ?, location = ?, program = ?, capacity = ?,
          start_at = ?, end_at = ?, cancelled = ?
        WHERE id = ?
      `).run(fields.type, fields.title, fields.description, fields.location, fields.program, fields.capacity,
        start_at, end_at, cancelled, event.id);

      // "Apply to series": copy the content (not the time) to the later occurrences.
      if (req.body.scope === 'series' && event.series_id) {
        db.prepare(`
          UPDATE events SET type = ?, title = ?, description = ?, location = ?, program = ?, capacity = ?
          WHERE series_id = ? AND start_at > ?
        `).run(fields.type, fields.title, fields.description, fields.location, fields.program, fields.capacity,
          event.series_id, event.start_at);
      }
    });

    hub.broadcast({ type: 'events-changed', eventId: event.id });
    const updated = eventDetail(db, event.id, req.user.id);
    if (cancelled && !event.cancelled) notifier.eventChanged(updated, 'cancelled', req.user.id);
    else if (!cancelled && start_at !== event.start_at) notifier.eventChanged(updated, 'moved', req.user.id);
    res.json(updated);
  });

  r.delete('/events/:id', (req, res) => {
    const event = loadEditable(db, id(req.params.id), req.user);
    const doomed = req.query.scope === 'series' && event.series_id
      ? db.prepare('SELECT * FROM events WHERE series_id = ? AND start_at >= ?').all(event.series_id, event.start_at)
      : [event];
    // Tell people who were signed up – collected before the rows (and their responses) disappear.
    const toNotify = doomed.filter((e) => !e.cancelled).map((e) => [e, db.prepare(
      "SELECT user_id FROM event_responses WHERE event_id = ? AND status = 'yes'",
    ).all(e.id).map((r) => r.user_id)]);
    if (req.query.scope === 'series' && event.series_id) {
      db.prepare('DELETE FROM events WHERE series_id = ? AND start_at >= ?').run(event.series_id, event.start_at);
    } else {
      db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
    }
    hub.broadcast({ type: 'events-changed', eventId: event.id });
    for (const [e, signedUp] of toNotify) notifier.eventChanged(e, 'deleted', req.user.id, signedUp);
    res.status(204).end();
  });

  // Sign up ("yes") or sign off ("no") for an event.
  r.put('/events/:id/response', (req, res) => {
    const eventId = id(req.params.id);
    const status = req.body.status;
    if (!['yes', 'no'].includes(status)) throw new HttpError(400, 'Svar skal være "yes" eller "no"');
    const comment = str(req.body.comment, 'Kommentar', { max: 300, required: false });

    transaction(db, () => {
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) throw new HttpError(404, 'Aftalen findes ikke');
      if (event.cancelled) throw new HttpError(409, 'Aftalen er aflyst');
      if (new Date(event.end_at) < new Date()) throw new HttpError(409, 'Aftalen er allerede afholdt');

      if (status === 'yes' && event.capacity) {
        const taken = db.prepare(`
          SELECT COUNT(*) AS n FROM event_responses WHERE event_id = ? AND status = 'yes' AND user_id != ?
        `).get(eventId, req.user.id).n;
        if (taken >= event.capacity) throw new HttpError(409, 'Der er desværre ikke flere pladser');
      }

      db.prepare(`
        INSERT INTO event_responses (event_id, user_id, status, comment, updated_at)
        VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT (event_id, user_id) DO UPDATE SET
          status = excluded.status, comment = excluded.comment, updated_at = excluded.updated_at
      `).run(eventId, req.user.id, status, comment);
    });

    hub.broadcast({ type: 'events-changed', eventId });
    res.json(eventDetail(db, eventId, req.user.id));
  });

  // Every event has its own chat thread, created the first time someone opens it.
  r.post('/events/:id/thread', (req, res) => {
    const eventId = id(req.params.id);
    const event = db.prepare('SELECT id, title FROM events WHERE id = ?').get(eventId);
    if (!event) throw new HttpError(404, 'Aftalen findes ikke');
    db.prepare('INSERT INTO threads (title, event_id, created_by) VALUES (?, ?, ?) ON CONFLICT (event_id) DO NOTHING')
      .run(event.title, eventId, req.user.id);
    res.json(db.prepare('SELECT id FROM threads WHERE event_id = ?').get(eventId));
  });

  return r;
}

function serialize(row) {
  return {
    ...row,
    program: typeof row.program === 'string' ? JSON.parse(row.program) : row.program,
    cancelled: Boolean(row.cancelled),
  };
}

export function eventDetail(db, eventId, userId) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!row) throw new HttpError(404, 'Aftalen findes ikke');
  const responses = db.prepare(`
    SELECT r.user_id, u.name, r.status, r.comment, r.updated_at
    FROM event_responses r JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ? ORDER BY r.updated_at
  `).all(eventId);
  const noResponse = db.prepare(`
    SELECT id AS user_id, name FROM users
    WHERE id NOT IN (SELECT user_id FROM event_responses WHERE event_id = ?)
    ORDER BY name COLLATE NOCASE
  `).all(eventId);
  const creator = row.created_by ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.created_by) : null;
  const thread = db.prepare('SELECT id FROM threads WHERE event_id = ?').get(eventId);
  const seriesCount = row.series_id
    ? db.prepare('SELECT COUNT(*) AS n FROM events WHERE series_id = ?').get(row.series_id).n
    : 0;
  return {
    ...serialize(row),
    creator,
    thread_id: thread?.id ?? null,
    series_count: seriesCount,
    responses,
    no_response: noResponse,
    yes_count: responses.filter((r) => r.status === 'yes').length,
    my_status: responses.find((r) => r.user_id === userId)?.status ?? null,
  };
}

function parseFields(body) {
  const type = body.type;
  if (!EVENT_TYPES.includes(type)) throw new HttpError(400, 'Ugyldig type');
  let capacity = body.capacity === '' || body.capacity == null ? null : Number(body.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    throw new HttpError(400, 'Antal pladser skal være et positivt heltal');
  }
  return {
    type,
    title: str(body.title, 'Titel', { max: 120 }),
    description: str(body.description, 'Beskrivelse', { max: 5000, required: false }),
    location: str(body.location, 'Sted', { max: 200, required: false }),
    program: JSON.stringify(parseProgram(body.program)),
    capacity,
  };
}

function parseProgram(program) {
  if (program == null) return [];
  if (!Array.isArray(program)) throw new HttpError(400, 'Programmet har et ugyldigt format');
  if (program.length > 50) throw new HttpError(400, 'Programmet må højst have 50 punkter');
  return program
    .map((item) => {
      const minutes = item?.minutes === '' || item?.minutes == null ? null : Number(item.minutes);
      if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) {
        throw new HttpError(400, 'Varighed i programmet skal være et antal minutter');
      }
      return {
        title: str(item?.title, 'Programpunkt', { max: 120, required: false }),
        details: str(item?.details, 'Programdetaljer', { max: 2000, required: false }),
        minutes,
      };
    })
    .filter((item) => item.title || item.details);
}

function parseTimes(occ) {
  const start_at = isoDate(occ?.start_at, 'Starttidspunkt');
  const end_at = isoDate(occ?.end_at, 'Sluttidspunkt');
  if (end_at <= start_at) throw new HttpError(400, 'Sluttidspunktet skal være efter starttidspunktet');
  return { start_at, end_at };
}

function assertMayCreate(user, type) {
  if (PLANNER_ONLY_TYPES.includes(type) && !canPlanTrainings(user)) {
    throw new HttpError(403, 'Kun trænere og administratorer kan oprette træninger og løb');
  }
}

function loadEditable(db, eventId, user) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) throw new HttpError(404, 'Aftalen findes ikke');
  if (!canPlanTrainings(user) && event.created_by !== user.id) {
    throw new HttpError(403, 'Du kan kun redigere dine egne aftaler');
  }
  return event;
}
