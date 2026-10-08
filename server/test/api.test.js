import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../db.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp({ db: openDb(':memory:'), inviteCode: 'padle' });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

/** Tiny client that keeps its own session cookie. */
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
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  };
}

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();

describe('Holte Roklub API', () => {
  const admin = client();
  const member = client();
  const other = client();
  let trainingId;

  test('first user needs the invite code too, and becomes admin', async () => {
    const without = await admin('POST', '/auth/register', { name: 'Træner Tina', email: 'tina@klub.dk', password: 'hemmelig1' });
    assert.equal(without.status, 403);
    const res = await admin('POST', '/auth/register', { name: 'Træner Tina', email: 'tina@klub.dk', password: 'hemmelig1', inviteCode: 'padle' });
    assert.equal(res.status, 201);
    assert.equal(res.data.role, 'admin');
  });

  test('later users need the club invite code', async () => {
    const wrong = await member('POST', '/auth/register', { name: 'Mads', email: 'mads@klub.dk', password: 'hemmelig1', inviteCode: 'nej' });
    assert.equal(wrong.status, 403);
    const ok = await member('POST', '/auth/register', { name: 'Mads', email: 'mads@klub.dk', password: 'hemmelig1', inviteCode: 'padle' });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.role, 'member');
    await other('POST', '/auth/register', { name: 'Olga', email: 'olga@klub.dk', password: 'hemmelig1', inviteCode: 'padle' });
  });

  test('login and unauthenticated access', async () => {
    const anon = client();
    assert.equal((await anon('GET', '/events')).status, 401);
    assert.equal((await anon('POST', '/auth/login', { email: 'mads@klub.dk', password: 'forkert!!' })).status, 401);
    assert.equal((await anon('POST', '/auth/login', { email: 'MADS@klub.dk', password: 'hemmelig1' })).status, 200);
  });

  test('only coaches/admins can create trainings', async () => {
    const event = {
      type: 'training', title: 'Intervaltræning', location: 'Klubhuset',
      start_at: hoursFromNow(24), end_at: hoursFromNow(25.5), capacity: 1,
      program: [
        { title: 'Opvarmning', details: 'Roligt tempo', minutes: 15 },
        { title: 'Hovedsæt', details: '6 x 500 m', minutes: 45 },
        { title: '', details: '' },
      ],
    };
    assert.equal((await member('POST', '/events', event)).status, 403);
    const res = await admin('POST', '/events', event);
    assert.equal(res.status, 201);
    trainingId = res.data.ids[0];
    assert.equal(res.data.event.program.length, 2);
    assert.equal(res.data.event.program[1].title, 'Hovedsæt');
  });

  test('members can create other appointments, and recurring series', async () => {
    const res = await member('POST', '/events', {
      type: 'social', title: 'Standerhejsning',
      occurrences: [0, 1, 2].map((w) => ({ start_at: hoursFromNow(48 + w * 168), end_at: hoursFromNow(50 + w * 168) })),
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.ids.length, 3);
    assert.equal(res.data.event.series_count, 3);

    // ...but cannot edit someone else's training
    assert.equal((await member('PATCH', `/events/${trainingId}`, { title: 'Hack' })).status, 403);

    // editing the first occurrence with scope=series updates the later ones
    const edit = await member('PATCH', `/events/${res.data.ids[0]}`, { title: 'Klubaften', scope: 'series' });
    assert.equal(edit.status, 200);
    const last = await member('GET', `/events/${res.data.ids[2]}`);
    assert.equal(last.data.title, 'Klubaften');

    assert.equal((await member('DELETE', `/events/${res.data.ids[1]}?scope=series`)).status, 204);
    assert.equal((await member('GET', `/events/${res.data.ids[2]}`)).status, 404);
    assert.equal((await member('GET', `/events/${res.data.ids[0]}`)).status, 200);
  });

  test('sign up and sign off, respecting capacity', async () => {
    const yes = await member('PUT', `/events/${trainingId}/response`, { status: 'yes', comment: 'Tager kaffe med' });
    assert.equal(yes.status, 200);
    assert.equal(yes.data.my_status, 'yes');
    assert.equal(yes.data.yes_count, 1);

    const full = await other('PUT', `/events/${trainingId}/response`, { status: 'yes' });
    assert.equal(full.status, 409);

    await member('PUT', `/events/${trainingId}/response`, { status: 'no' });
    const now = await other('PUT', `/events/${trainingId}/response`, { status: 'yes' });
    assert.equal(now.status, 200);

    const detail = (await admin('GET', `/events/${trainingId}`)).data;
    assert.deepEqual(detail.responses.map((r) => [r.name, r.status]), [['Mads', 'no'], ['Olga', 'yes']]);
    assert.deepEqual(detail.no_response.map((u) => u.name), ['Træner Tina']);

    const list = (await other('GET', '/events')).data;
    const item = list.find((e) => e.id === trainingId);
    assert.equal(item.my_status, 'yes');
    assert.equal(item.yes_count, 1);
  });

  test('cancelled events cannot be signed up for', async () => {
    await admin('PATCH', `/events/${trainingId}`, { cancelled: true });
    assert.equal((await member('PUT', `/events/${trainingId}/response`, { status: 'yes' })).status, 409);
    await admin('PATCH', `/events/${trainingId}`, { cancelled: false });
  });

  test('chat threads with replies and unread counts', async () => {
    const created = await member('POST', '/threads', { title: 'Samkørsel til Silkeborg', body: 'Hvem har plads i bilen?' });
    assert.equal(created.status, 201);
    const threadId = created.data.id;

    let threads = (await admin('GET', '/threads')).data;
    assert.equal(threads[0].title, 'Samkørsel til Silkeborg');
    assert.equal(threads[0].unread, 1);
    assert.equal(threads[0].last_user_name, 'Mads');

    const first = (await admin('GET', `/threads/${threadId}`)).data.messages[0];
    const reply = await admin('POST', `/threads/${threadId}/messages`, { body: 'Jeg har 2 pladser', reply_to: first.id });
    assert.equal(reply.status, 201);
    assert.equal(reply.data.reply_body, 'Hvem har plads i bilen?');
    assert.equal(reply.data.reply_user_name, 'Mads');

    await admin('POST', `/threads/${threadId}/read`);
    threads = (await admin('GET', '/threads')).data;
    assert.equal(threads[0].unread, 0);
    assert.equal((await member('GET', '/threads')).data[0].unread, 1);

    // only the author (or an admin) can delete a message
    assert.equal((await other('DELETE', `/messages/${first.id}`)).status, 403);
    assert.equal((await member('DELETE', `/messages/${first.id}`)).status, 204);
    const messages = (await other('GET', `/threads/${threadId}`)).data.messages;
    assert.equal(messages[0].deleted, true);
    assert.equal(messages[0].body, '');
    assert.equal(messages[1].reply_body, '');
  });

  test('each event gets its own thread, hidden until someone writes', async () => {
    const t1 = await member('POST', `/events/${trainingId}/thread`);
    const t2 = await other('POST', `/events/${trainingId}/thread`);
    assert.equal(t1.data.id, t2.data.id);
    assert.ok(!(await member('GET', '/threads')).data.some((t) => t.id === t1.data.id));

    await member('POST', `/threads/${t1.data.id}/messages`, { body: 'Skal vi have våddragt på?' });
    const listed = (await other('GET', '/threads')).data.find((t) => t.id === t1.data.id);
    assert.equal(listed.title, 'Intervaltræning');
    assert.equal(listed.event_id, trainingId);
    assert.equal((await admin('GET', `/events/${trainingId}`)).data.thread_id, t1.data.id);
  });

  test('repeated wrong passwords lock the login for a while', async () => {
    const anon = client();
    for (let i = 0; i < 5; i++) {
      assert.equal((await anon('POST', '/auth/login', { email: 'olga@klub.dk', password: 'forkert!!' })).status, 401);
    }
    assert.equal((await anon('POST', '/auth/login', { email: 'olga@klub.dk', password: 'hemmelig1' })).status, 429);
    // other members are unaffected
    assert.equal((await anon('POST', '/auth/login', { email: 'mads@klub.dk', password: 'hemmelig1' })).status, 200);
  });

  test('admins can set a new password for a member', async () => {
    const members = (await admin('GET', '/members')).data;
    const mads = members.find((m) => m.name === 'Mads');
    assert.equal((await other('PUT', `/members/${mads.id}/password`, { password: 'nyt-kodeord' })).status, 403);
    assert.equal((await admin('PUT', `/members/${mads.id}/password`, { password: 'nyt-kodeord' })).status, 204);
    assert.equal((await member('GET', '/me')).status, 401, 'old sessions are logged out');
    assert.equal((await member('POST', '/auth/login', { email: 'mads@klub.dk', password: 'nyt-kodeord' })).status, 200);
  });

  test('health check needs no login', async () => {
    assert.deepEqual((await client()('GET', '/health')).data, { ok: true });
  });

  test('admins manage roles', async () => {
    const members = (await admin('GET', '/members')).data;
    const mads = members.find((m) => m.name === 'Mads');
    assert.equal((await member('PATCH', `/members/${mads.id}`, { role: 'coach' })).status, 403);
    assert.equal((await admin('PATCH', `/members/${mads.id}`, { role: 'coach' })).data.role, 'coach');
    const me = (await admin('GET', '/me')).data;
    assert.equal((await admin('PATCH', `/members/${me.id}`, { role: 'member' })).status, 400);
  });
});
