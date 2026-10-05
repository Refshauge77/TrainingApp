import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../db.js';

let server;
let baseUrl;
let app;
let sent = [];
const goneEndpoints = new Set();

before(async () => {
  app = createApp({
    db: openDb(':memory:'),
    sendPush: async (subscription, payload) => {
      if (goneEndpoints.has(subscription.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      sent.push({ to: subscription.endpoint.split('/').pop(), ...JSON.parse(payload) });
    },
  });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());
beforeEach(() => { sent = []; });

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  };
}

/** Notifications delivered since the last call, as "recipient: title". */
async function delivered() {
  await app.locals.notifier.flush();
  const list = sent.map((n) => `${n.to}: ${n.title}`).sort();
  sent = [];
  return list;
}

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();

describe('push notifications', () => {
  const tina = client();
  const mads = client();
  const olga = client();
  let trainingId;

  test('users subscribe their devices', async () => {
    for (const [c, name] of [[tina, 'tina'], [mads, 'mads'], [olga, 'olga']]) {
      await c('POST', '/auth/register', { name, email: `${name}@klub.dk`, password: 'hemmelig1' });
      const res = await c('POST', '/push/subscribe', {
        subscription: { endpoint: `https://push.example/${name}`, keys: { p256dh: 'pk', auth: 'au' } },
      });
      assert.equal(res.status, 204);
    }
    assert.match((await tina('GET', '/push/key')).data.publicKey, /^[\w-]{80,}$/);
    assert.deepEqual((await mads('GET', '/me/notifications')).data, { chat: 'mine', events: true, devices: 1 });
    assert.equal((await mads('POST', '/push/subscribe', { subscription: { endpoint: 'http://insecure' } })).status, 400);
  });

  test('new events notify everyone except the creator', async () => {
    const res = await tina('POST', '/events', {
      type: 'training', title: 'Intervaltræning', location: 'Klubhuset',
      occurrences: [0, 1].map((w) => ({ start_at: hoursFromNow(24 + w * 168), end_at: hoursFromNow(25 + w * 168) })),
    });
    trainingId = res.data.ids[0];
    assert.deepEqual(await delivered(), ['mads: Ny træning: Intervaltræning', 'olga: Ny træning: Intervaltræning']);
  });

  test('event notifications can be turned off', async () => {
    await olga('PUT', '/me/notifications', { events: false });
    await tina('POST', '/events', { type: 'social', title: 'Fællesspisning', start_at: hoursFromNow(48), end_at: hoursFromNow(50) });
    assert.deepEqual(await delivered(), ['mads: Ny aftale: Fællesspisning']);
    await olga('PUT', '/me/notifications', { events: true });
  });

  test('chat notifies participants by default, everyone with "all"', async () => {
    const { data: { id: threadId } } = await mads('POST', '/threads', { title: 'Samkørsel', body: 'Hvem kører?' });
    assert.deepEqual(await delivered(), []);

    await tina('PUT', '/me/notifications', { chat: 'all' });
    await olga('POST', `/threads/${threadId}/messages`, { body: 'Jeg har plads' });
    const msgs = sent.slice();
    assert.deepEqual(await delivered(), ['mads: Samkørsel', 'tina: Samkørsel']);
    assert.equal(msgs[0].body, 'olga: Jeg har plads');
    assert.equal(msgs[0].url, `/chat/${threadId}`);

    await mads('POST', `/threads/${threadId}/messages`, { body: 'Fedt!' });
    assert.deepEqual(await delivered(), ['olga: Samkørsel', 'tina: Samkørsel']);

    await olga('PUT', '/me/notifications', { chat: 'off' });
    await mads('POST', `/threads/${threadId}/messages`, { body: 'Vi ses' });
    assert.deepEqual(await delivered(), ['tina: Samkørsel']);
    await olga('PUT', '/me/notifications', { chat: 'mine' });
    await tina('PUT', '/me/notifications', { chat: 'mine' });
  });

  test('event threads notify people who are signed up', async () => {
    await mads('PUT', `/events/${trainingId}/response`, { status: 'yes' });
    const { data: { id: threadId } } = await olga('POST', `/events/${trainingId}/thread`);
    await olga('POST', `/threads/${threadId}/messages`, { body: 'Våddragt?' });
    assert.deepEqual(await delivered(), ['mads: Intervaltræning']);
  });

  test('cancelling, moving and deleting notify those signed up', async () => {
    await tina('PATCH', `/events/${trainingId}`, { start_at: hoursFromNow(26), end_at: hoursFromNow(27) });
    assert.deepEqual(await delivered(), ['mads: Nyt tidspunkt: Intervaltræning']);

    await tina('PATCH', `/events/${trainingId}`, { title: 'Intervaller' });
    assert.deepEqual(await delivered(), []);

    await tina('PATCH', `/events/${trainingId}`, { cancelled: true });
    assert.deepEqual(await delivered(), ['mads: Aflyst: Intervaller']);
    await tina('PATCH', `/events/${trainingId}`, { cancelled: false });

    await tina('DELETE', `/events/${trainingId}`);
    assert.deepEqual(await delivered(), ['mads: Aflyst: Intervaller']);
  });

  test('subscriptions the browser has dropped are removed', async () => {
    goneEndpoints.add('https://push.example/mads');
    await tina('POST', '/events', { type: 'other', title: 'Arbejdsdag', start_at: hoursFromNow(72), end_at: hoursFromNow(74) });
    assert.deepEqual(await delivered(), ['olga: Ny aftale: Arbejdsdag']);
    assert.equal((await mads('GET', '/me/notifications')).data.devices, 0);
  });

  test('unsubscribing a device stops notifications', async () => {
    await olga('POST', '/push/unsubscribe', { endpoint: 'https://push.example/olga' });
    await tina('POST', '/events', { type: 'other', title: 'Generalforsamling', start_at: hoursFromNow(80), end_at: hoursFromNow(82) });
    assert.deepEqual(await delivered(), []);
  });
});
