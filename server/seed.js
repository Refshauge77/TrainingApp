// Fills an empty database with demo data: `npm run seed`
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';
import { openDb, transaction } from './db.js';

// Demo times are meant as Danish local time ("17:30"), regardless of the server's zone.
process.env.TZ ??= 'Europe/Copenhagen';

const root = fileURLToPath(new URL('..', import.meta.url));
const db = openDb(process.env.DATABASE_FILE ?? `${root}data/kajakklub.db`);

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('Databasen indeholder allerede data – springer over.');
  process.exit(0);
}

const PASSWORD = 'kajak1234';
const people = [
  ['Tina Træner', 'tina@example.com', 'admin'],
  ['Søren Coach', 'soren@example.com', 'coach'],
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

const interval = [
  { title: 'Opvarmning', details: 'Roligt tempo, teknikfokus på rotation', minutes: 15 },
  { title: 'Hovedsæt', details: '6 x 500 m i konkurrencetempo\nPause: 1 min mellem hver', minutes: 40 },
  { title: 'Nedpadling + udstrækning', details: '', minutes: 15 },
];
const distance = [
  { title: 'Opvarmning', details: '2 km roligt', minutes: 10 },
  { title: 'Langtur', details: '12 km i jævnt tempo (puls zone 2)\nVi holder samlet ved broen', minutes: 75 },
  { title: 'Udstrækning på land', details: '', minutes: 10 },
];

transaction(db, () => {
  const ids = people.map(([name, email, role]) => Number(db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
  ).run(name, email, hashPassword(PASSWORD), role).lastInsertRowid));
  const [tina, soren, mads, olga, freja, jonas] = ids;

  const insertEvent = db.prepare(`
    INSERT INTO events (type, title, description, location, program, capacity, start_at, end_at, series_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const event = (e) => Number(insertEvent.run(e.type, e.title, e.description ?? '', e.location ?? '',
    JSON.stringify(e.program ?? []), e.capacity ?? null, e.start, e.end, e.series ?? null, e.by).lastInsertRowid);
  const respond = db.prepare('INSERT INTO event_responses (event_id, user_id, status, comment) VALUES (?, ?, ?, ?)');

  const tuesdays = randomUUID();
  const thursdays = randomUUID();
  const tuesdayIds = [];
  for (let w = 0; w < 8; w++) {
    tuesdayIds.push(event({ type: 'training', title: 'Intervaltræning', location: 'Klubhuset', program: interval, series: tuesdays,
      start: at(nextWeekday(2) + w * 7, 17, 30), end: at(nextWeekday(2) + w * 7, 19), by: soren,
      description: 'Husk våddragt eller tørdragt – vandet er koldt.' }));
    event({ type: 'training', title: 'Distancetræning', location: 'Klubhuset', program: distance, series: thursdays,
      start: at(nextWeekday(4) + w * 7, 17, 30), end: at(nextWeekday(4) + w * 7, 19, 15), by: tina });
  }
  respond.run(tuesdayIds[0], mads, 'yes', '');
  respond.run(tuesdayIds[0], olga, 'yes', 'Kommer 10 min senere');
  respond.run(tuesdayIds[0], jonas, 'no', 'Syg');

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

  const tue = thread('Intervaltræning', mads, tuesdayIds[0]);
  say(tue, mads, 'Er der nogen der har en ekstra pagajjakke jeg kan låne på tirsdag?', 60);
  say(tue, soren, 'Der hænger et par stykker i klubhuset – tag bare en.', 45);
});

console.log(`Demo-data oprettet. Log ind med fx tina@example.com / ${PASSWORD} (admin)`);
