// Fills an empty database with demo data: `npm run seed` (or `npm run seed:reset` to start over).
// The trainings are kapholdets uge 40-program, placed in the current week so they can be tried out.
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { openDb, transaction } from './db.js';
import { INFO, INTENSITIES, WEEK, WINDOWS } from './seed-data/kaphold.js';

// Demo times are meant as Danish local time ("17:30"), regardless of the server's zone.
process.env.TZ ??= 'Europe/Copenhagen';

const root = fileURLToPath(new URL('..', import.meta.url));
const file = process.env.DATABASE_FILE ?? `${root}data/kajakklub.db`;
if (process.argv.includes('--reset')) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) rmSync(f);
}
const db = openDb(file);

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('Databasen indeholder allerede data – springer over.');
  process.exit(0);
}

const PASSWORD = 'kajak1234';
const people = [
  ['Tina Træner', 'tina@example.com', 'admin'],
  ['Torsten Træner', 'torsten@example.com', 'coach'],
  ['Christen Træner', 'christen@example.com', 'coach'],
  ['Mads Madsen', 'mads@example.com', 'member'],
  ['Olga Olsen', 'olga@example.com', 'member'],
  ['Freja Friis', 'freja@example.com', 'member'],
  ['Jonas Juul', 'jonas@example.com', 'member'],
];

function at(daysFromToday, hh, mm = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

/** Days until the next given weekday (0 = Sunday), counting today. */
const nextWeekday = (wd) => (wd - new Date().getDay() + 7) % 7;

/** Monday of this week – or of next week from Saturday on, so most sessions are still ahead. */
function weekMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function sessionTimes(monday, day, time, minutes) {
  const [hh, mm] = time.split(':').map(Number);
  const start = new Date(monday);
  start.setDate(start.getDate() + day - 1);
  start.setHours(hh, mm, 0, 0);
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60e3).toISOString() };
}

transaction(db, () => {
  const ids = people.map(([name, email, role]) => Number(db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
  ).run(name, email, hashPassword(PASSWORD), role).lastInsertRowid));
  const [tina, torsten, christen, mads, olga, freja, jonas] = ids;
  const coachIds = { torsten, christen };
  const coachNames = { torsten: 'Torsten', christen: 'Christen' };

  const insertEvent = db.prepare(`
    INSERT INTO events (type, title, description, location, program, capacity, start_at, end_at, series_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const event = (e) => Number(insertEvent.run(e.type, e.title, e.description ?? '', e.location ?? '',
    JSON.stringify(e.program ?? []), e.capacity ?? null, e.start, e.end, e.series ?? null, e.by).lastInsertRowid);
  const respond = db.prepare('INSERT INTO event_responses (event_id, user_id, status, comment) VALUES (?, ?, ?, ?)');

  // Kapholdets uge: each pass becomes a training, with the fixed warm-up in the day's first pass.
  const monday = weekMonday();
  const firstOfDay = new Map();
  for (const sess of WEEK) {
    if (!firstOfDay.has(sess.day) || sess.time < firstOfDay.get(sess.day).time) firstOfDay.set(sess.day, sess);
  }
  const kaphold = {};
  for (const sess of WEEK) {
    const { start, end } = sessionTimes(monday, sess.day, sess.time, sess.minutes);
    const intro = sess.joint
      ? `Fællestræning – dagens hovedpas på vandet.${sess.coach ? ` Træner: ${coachNames[sess.coach]}.` : ''}`
      : `Øvrigt pas – lægges i et af dagens vinduer (${WINDOWS[sess.day].join(', ')}). Tidspunktet her er et forslag.`;
    kaphold[sess.title] = event({
      type: 'training',
      title: sess.title,
      location: 'Klubben',
      description: [intro, sess.description, 'Program: uge 40 (kapholdet). Ring eller skriv til Torsten ved spørgsmål.']
        .filter(Boolean).join('\n\n'),
      program: firstOfDay.get(sess.day) === sess ? [sess.warmup, ...sess.program] : sess.program,
      start, end,
      by: coachIds[sess.coach] ?? torsten,
    });
  }
  const pyramids = kaphold['Kajak: En lang dag i pyramiderne'];
  const vo2 = kaphold['Kajak: Norsk VO2max'];
  const crewSat = kaphold['Kajak (mandskabsbåde): Mandskabsraketter'];
  const crewSun = kaphold['Kajak (mandskabsbåde): Stort spionprogram'];
  respond.run(pyramids, mads, 'yes', '');
  respond.run(pyramids, olga, 'yes', 'Kommer 10 min senere');
  respond.run(pyramids, jonas, 'no', 'Syg');
  respond.run(vo2, mads, 'yes', '');
  respond.run(vo2, freja, 'yes', '');
  for (const id of [crewSat, crewSun]) {
    respond.run(id, olga, 'yes', '');
    respond.run(id, freja, 'yes', '');
  }

  const race = event({ type: 'competition', title: 'Regionsmesterskab', location: 'Silkeborg Kajakstadion',
    description: 'Tilmelding til løbet skal ske senest en uge før. Vi arrangerer samkørsel i chatten.',
    start: at(nextWeekday(6) + 14, 9), end: at(nextWeekday(6) + 14, 16), by: tina, capacity: 12 });
  respond.run(race, freja, 'yes', 'K1 500 m');
  event({ type: 'social', title: 'Standerstrygning og fællesspisning', location: 'Klubhuset',
    description: 'Tag en ret med til fællesbordet.', start: at(nextWeekday(5) + 7, 18), end: at(nextWeekday(5) + 7, 22), by: olga });
  event({ type: 'other', title: 'Arbejdsdag: bådhal og broer', location: 'Bådhallen',
    start: at(nextWeekday(0) + 7, 10), end: at(nextWeekday(0) + 7, 14), by: tina });

  const thread = (title, by, eventId = null) => Number(db.prepare('INSERT INTO threads (title, created_by, event_id) VALUES (?, ?, ?)')
    .run(title, by, eventId).lastInsertRowid);
  const say = (threadId, userId, body, minutesAgo, replyTo = null) => {
    const time = new Date(Date.now() - minutesAgo * 60e3).toISOString();
    const id = Number(db.prepare('INSERT INTO messages (thread_id, user_id, body, reply_to, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(threadId, userId, body, replyTo, time).lastInsertRowid);
    db.prepare('UPDATE threads SET last_message_at = ? WHERE id = ?').run(time, threadId);
    return id;
  };

  const car = thread('Samkørsel til regionsmesterskabet', freja);
  const q = say(car, freja, 'Hvem kører til Silkeborg? Jeg mangler et lift 🙏', 300);
  say(car, mads, 'Jeg kører kl. 7 fra klubben og har 2 ledige pladser + plads på trailer', 280, q);
  say(car, freja, 'Super, så tager jeg den ene!', 275);

  const gear = thread('Udstyr til salg / byttes', jonas);
  say(gear, jonas, 'Sælger en Epic V7 og en vinge-pagaj 215 cm. Skriv hvis du er interesseret.', 2900);

  const info = thread('Kapholdet – tider og intensiteter', torsten);
  say(info, torsten, INFO, 1500);
  say(info, torsten, INTENSITIES, 1499);

  const tue = thread('Kajak: En lang dag i pyramiderne', mads, pyramids);
  say(tue, mads, 'Er der nogen der har en ekstra pagajjakke jeg kan låne på tirsdag?', 60);
  say(tue, torsten, 'Der hænger et par stykker i klubhuset – tag bare en.', 45);
});

console.log(`Demo-data oprettet. Log ind med fx tina@example.com (admin), torsten@example.com (træner) eller mads@example.com (medlem) – adgangskode ${PASSWORD}`);
