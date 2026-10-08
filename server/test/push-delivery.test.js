// Sends a real, encrypted Web Push request to a local stand-in for a browser push service.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { openDb } from '../db.js';

let pushService;
let received = [];
let respondWith = 201;

before(async () => {
  pushService = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(respondWith).end();
    });
  });
  await new Promise((resolve) => pushService.listen(0, '127.0.0.1', resolve));
});

after(() => pushService.close());

test('notifications are delivered as encrypted, VAPID-signed Web Push requests', async () => {
  const db = openDb(':memory:');
  const app = createApp({ db });
  const insertUser = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'x')");
  const creator = Number(insertUser.run('Tina', 'tina@klub.dk').lastInsertRowid);
  const member = Number(insertUser.run('Mads', 'mads@klub.dk').lastInsertRowid);

  const browserKeys = createECDH('prime256v1');
  browserKeys.generateKeys();
  const endpoint = `http://127.0.0.1:${pushService.address().port}/push/mads-phone`;
  db.prepare('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)')
    .run(endpoint, member, browserKeys.getPublicKey('base64url'), randomBytes(16).toString('base64url'));

  const start = new Date(Date.now() + 864e5).toISOString();
  const end = new Date(Date.now() + 2 * 864e5).toISOString();
  app.locals.notifier.eventsCreated({ id: 1, type: 'training', title: 'Intervaller', start_at: start, end_at: end, location: '' }, 1, creator);
  await app.locals.notifier.flush();

  assert.equal(received.length, 1);
  const [req] = received;
  assert.equal(req.url, '/push/mads-phone');
  assert.equal(req.headers['content-encoding'], 'aes128gcm');
  assert.match(req.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  assert.ok(Number(req.headers.ttl) > 0);
  assert.ok(!req.body.includes('Intervaller'), 'payload must be encrypted');

  // The push service says the subscription is gone: it is removed.
  respondWith = 410;
  received = [];
  app.locals.notifier.eventsCreated({ id: 2, type: 'social', title: 'Fest', start_at: start, end_at: end, location: '' }, 1, creator);
  await app.locals.notifier.flush();
  assert.equal(received.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
});
