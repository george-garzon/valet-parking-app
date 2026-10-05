import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBusinessConfig } from '../lib/config';
import { createTicket, listTickets, getWelcomeMessage, guestTicket } from '../lib/db';
import { renderGuestMessage } from '../lib/message-template';
import { sendWelcomeMessage } from '../lib/notifications';
import { submitTwilioMessage, SmsError } from '../lib/sms';

let storage: string;
const original = { ...process.env };
const input = { guest: 'Alex Test', phone: '+12025550123', make: 'Toyota', model: 'Camry', color: 'Black', plate: 'SMS TEST', space: 'A-1', key_tag: 'K-1', type: 'Transient', notes: '', attendant: 'Jamie', sms_consent: true };
beforeEach(() => {
  for (const key of Object.keys(process.env)) if (/^(BUSINESS_|APP_BRAND_|BRAND_|RATE_|SMS_|TWILIO_|PHONE_|VALET_|PUBLIC_APP_URL)/.test(key)) delete process.env[key];
  storage = mkdtempSync(join(tmpdir(), 'porter-message-test-'));
  Object.assign(process.env, { VALET_STORAGE: storage, BUSINESS_ID: 'test-hotel', BUSINESS_NAME: 'The Test Hotel', APP_BRAND_NAME: 'Hotel Valet', PUBLIC_APP_URL: 'https://valet.example.com', SMS_PROVIDER: 'preview', RATE_TRANSIENT_CENTS: '3100', TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'test-secret', TWILIO_FROM_NUMBER: '+12025550124' });
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (/^(BUSINESS_|APP_BRAND_|BRAND_|RATE_|SMS_|TWILIO_|PHONE_|VALET_|PUBLIC_APP_URL)/.test(key)) delete process.env[key];
  Object.assign(process.env, original);
  rmSync(storage, { recursive: true, force: true });
});
test('preview persists a branded message with the canonical link and configured rate', async () => {
  const ticket = createTicket(input, 'https://untrusted-host.example');
  assert.equal(ticket.rate, 3100);
  const message = await sendWelcomeMessage(ticket.id);
  assert.equal(message.status, 'preview');
  assert.ok(message.body.startsWith('Hotel Valet - The Test Hotel\n\nWelcome to The Test Hotel!'));
  assert.ok(message.body.includes(`https://valet.example.com/?ticket=${ticket.token}`));
  assert.ok(!message.body.includes('untrusted-host'));
  assert.ok(message.body.includes('the valet podium'));
  assert.ok(message.consent_at);
});
test('templates retain explicit line breaks and reject unknown placeholders', () => {
  const ticket = createTicket(input, 'https://localhost');
  const config = getBusinessConfig();
  assert.ok(renderGuestMessage(ticket, config, '', '{business}\\n{guest}\\n{ticket_url}').startsWith('The Test Hotel\nAlex Test\n'));
  assert.throws(() => renderGuestMessage(ticket, config, '', '{constructor} {ticket_url}'), /Unknown/);
  assert.throws(() => renderGuestMessage(ticket, config, '', 'Missing link'), /ticket_url/);
});
test('business IDs isolate tickets even when using the same storage parent', () => {
  const first = createTicket(input, 'https://localhost');
  process.env.BUSINESS_ID = 'another-business';
  assert.deepEqual(listTickets(), []);
  const second = createTicket(input, 'https://localhost');
  assert.equal(second.id, first.id);
  assert.notEqual(second.token, first.token);
  process.env.BUSINESS_ID = 'test-hotel';
  assert.equal(listTickets()[0].token, first.token);
  process.env.BUSINESS_ID = '../escape';
  assert.throws(() => getBusinessConfig(), /BUSINESS_ID/);
});
test('hotel room links persist on guest tickets; other businesses reject room linkage', () => {
  process.env.BUSINESS_TYPE = 'hotel';
  const ticket = createTicket({ ...input, room_number: '320' }, 'https://localhost');
  assert.equal(listTickets()[0].room_number, '320');
  assert.equal(guestTicket(ticket.token).room_number, '320');
  process.env.BUSINESS_TYPE = 'business';
  assert.equal('room_number' in guestTicket(ticket.token), false);
  assert.throws(() => createTicket({ ...input, plate: 'ROOM TEST', room_number: '320' }, ''), /only for hotel/);
  const regular = createTicket({ ...input, plate: 'NO ROOM' }, '');
  assert.equal(regular.room_number, '');
});
test('existing SQLite tickets are upgraded without losing their guest links', () => {
  const directory = join(storage, 'test-hotel');
  mkdirSync(directory);
  const db = new Database(join(directory, 'valet.sqlite'));
  db.exec(`CREATE TABLE tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL,
    guest TEXT NOT NULL, phone TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL,
    color TEXT NOT NULL, plate TEXT NOT NULL, space TEXT NOT NULL, key_tag TEXT NOT NULL,
    type TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'parked',
    rate INTEGER NOT NULL, created_at TEXT NOT NULL, requested_at TEXT, completed_at TEXT, attendant TEXT NOT NULL);`);
  db.prepare(`INSERT INTO tickets (id,token,guest,phone,make,model,color,plate,space,key_tag,type,notes,rate,created_at,attendant)
    VALUES (158754,?, 'Legacy Guest','555-0100','Toyota','Camry','Black','LEGACY','A-01','K-01','Transient','',2500,'2026-01-01T00:00:00Z','Jamie')`).run('legacy'.repeat(8));
  db.close();
  const legacy = guestTicket('legacy'.repeat(8));
  assert.equal(legacy.id, 158754); assert.equal(legacy.room_number, '');
  assert.equal(listTickets()[0].guest, 'Legacy Guest');
});
test('live texts require a valid phone and recorded permission', async () => {
  process.env.SMS_PROVIDER = 'twilio';
  assert.throws(() => createTicket({ ...input, phone: 'bad phone' }, ''), /valid guest mobile/);
  assert.equal(listTickets().length, 0);
  const ticket = createTicket({ ...input, sms_consent: false }, '');
  let calls = 0;
  const message = await sendWelcomeMessage(ticket.id, false, async () => { calls++; return ''; });
  assert.equal(calls, 0); assert.equal(message.status, 'skipped');
  await assert.rejects(() => sendWelcomeMessage(ticket.id, true), /permission/);
});
test('failed submission preserves the car, supports explicit retry, and never resends queued texts', async () => {
  process.env.SMS_PROVIDER = 'twilio';
  const ticket = createTicket(input, '');
  const failure = await sendWelcomeMessage(ticket.id, false, async () => { throw new SmsError('Provider rejected this number'); });
  assert.equal(failure.status, 'failed'); assert.equal(listTickets().length, 1);
  const sid = `SM${'b'.repeat(32)}`;
  let calls = 0;
  const submit = async () => { calls++; return sid; };
  process.env.PUBLIC_APP_URL = 'https://new-valet.example.com';
  const retried = await sendWelcomeMessage(ticket.id, true, submit);
  assert.equal(retried.status, 'queued'); assert.equal(retried.provider_sid, sid);
  assert.ok(retried.body.includes('https://new-valet.example.com/?ticket='));
  await sendWelcomeMessage(ticket.id, true, submit);
  await sendWelcomeMessage(ticket.id, false, submit);
  assert.equal(calls, 1);
});
test('ambiguous provider failures are never automatically retried', async () => {
  process.env.SMS_PROVIDER = 'twilio';
  const ticket = createTicket(input, '');
  const message = await sendWelcomeMessage(ticket.id, false, async () => { throw new SmsError('Timeout', true); });
  assert.equal(message.status, 'unknown');
  let calls = 0;
  await sendWelcomeMessage(ticket.id, true, async () => { calls++; return ''; });
  assert.equal(calls, 0);
});
test('concurrent submissions claim one outbox entry once', async () => {
  process.env.SMS_PROVIDER = 'twilio';
  const ticket = createTicket(input, '');
  let calls = 0;
  const submit = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return `SM${'c'.repeat(32)}`; };
  await Promise.all([sendWelcomeMessage(ticket.id, false, submit), sendWelcomeMessage(ticket.id, false, submit)]);
  assert.equal(calls, 1); assert.equal(getWelcomeMessage(ticket.id)?.status, 'queued');
});
test('Twilio requests encode content and optional MMS without any real network call', async () => {
  const ticket = createTicket(input, '');
  const message = { ...getWelcomeMessage(ticket.id)!, media_url: 'https://example.com/hotel-logo.png' };
  const sid = `SM${'d'.repeat(32)}`;
  process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${'e'.repeat(32)}`;
  await submitTwilioMessage(message, 'https://valet.example.com', async (url, options) => {
    assert.match(String(url), /^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC/);
    assert.equal(options?.method, 'POST');
    const fields = new URLSearchParams(String(options?.body));
    assert.equal(fields.get('To'), input.phone); assert.equal(fields.get('Body'), message.body);
    assert.equal(fields.get('MediaUrl'), message.media_url); assert.equal(fields.get('MessagingServiceSid'), process.env.TWILIO_MESSAGING_SERVICE_SID);
    assert.equal(fields.has('From'), false);
    return Response.json({ sid, status: 'accepted' }, { status: 201 });
  }).then(result => assert.equal(result, sid));
  await assert.rejects(() => submitTwilioMessage(message, 'http://localhost:3000'), /public HTTPS/);
  await assert.rejects(() => submitTwilioMessage(message, 'https://valet.example.com', async () => new Response('', { status: 500 })), (e: unknown) => e instanceof SmsError && e.uncertain);
});
