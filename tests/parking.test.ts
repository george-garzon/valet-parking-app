import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapAdmin, loginStaff, SESSION_COOKIE } from '../lib/staff-auth';
import { availableSpots } from '../lib/types';
import { getBusinessConfig } from '../lib/config';
import { createTicket, listTickets, changeStatus, savePhoto, readPhoto, photoMetadata, guestTicket } from '../lib/db';
import { GET, POST } from '../app/api/photos/route';

const original = { ...process.env };
let storage: string;
let authHeaders: Record<string,string>;
const input = { guest: 'Alex', phone: '555-0100', make: 'Acura', model: 'ADX', color: 'Black', plate: 'TEST1', space: 'A-01', lot_id: 'lot-a', spot_type: 'compact', key_tag: 'K1', type: 'Transient', notes: '', attendant: 'Jamie' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=', 'base64');
beforeEach(() => {
  storage = mkdtempSync(join(tmpdir(), 'porter-parking-'));
  Object.assign(process.env, { VALET_STORAGE: storage, BUSINESS_ID: 'parking-test', SMS_PROVIDER: 'disabled', VEHICLE_PHOTOS_ENABLED: 'true', PARKING_LOTS_ENABLED: 'true', PARKING_LOTS: '[{"id":"lot-a","name":"Lot A","compact":1,"large":2,"handicap":0},{"id":"garage-b","name":"Garage B","compact":3,"large":0,"handicap":1}]', GUEST_PAYMENT_REQUIRED: 'false' });
  process.env.PUBLIC_APP_URL='http://localhost';
  const admin=bootstrapAdmin('test-admin','Test Admin');
  const session=loginStaff(admin.user.username,admin.pin);
  authHeaders={Cookie:`${SESSION_COOKIE}=${session.token}`,Origin:'http://localhost'};
});
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); rmSync(storage, { recursive: true, force: true }); });
test('lot capacity blocks overbooking until ready and tracks each category independently', () => {
  const ticket = createTicket(input, 'http://localhost');
  const lot = getBusinessConfig().parkingLots[0];
  assert.equal(ticket.lot_id, 'lot-a'); assert.equal(ticket.spot_type, 'compact');
  assert.equal(availableSpots(lot, 'compact', listTickets()), 0);
  assert.equal(availableSpots(lot, 'large', listTickets()), 2);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'), /full/);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2', lot_id: 'missing' }, 'http://localhost'), /configured/);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2', spot_type: 'handicap' }, 'http://localhost'), /full/);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2', spot_type: 'bus' }, 'http://localhost'), /spot type/);
  assert.ok(createTicket({ ...input, plate: 'TEST3', spot_type: 'large', space: '' }, 'http://localhost'));
  assert.ok(createTicket({ ...input, plate: 'TEST4', lot_id: 'garage-b', spot_type: 'handicap' }, 'http://localhost'));
  changeStatus(ticket.id, 'requested'); changeStatus(ticket.id, 'retrieving');
  assert.throws(() => createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'), /full/);
  changeStatus(ticket.id, 'ready');
  assert.equal(availableSpots(lot, 'compact', listTickets()), 1);
  assert.ok(createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'));
  process.env.PARKING_LOTS_ENABLED = 'false';
  const { lot_id, spot_type, ...legacy } = input;
  const old = createTicket({ ...legacy, plate: 'TEST5', space: 'X-99' }, 'http://localhost');
  assert.equal(old.space, 'X-99'); assert.equal(old.lot_id, '');
  assert.throws(() => createTicket({ ...legacy, plate: 'TEST6', space: '' }, 'http://localhost'), /complete space/);
});
test('lot configuration rejects malformed, duplicate, negative, fractional and empty capacities', () => {
  for (const lots of ['oops', '[]', '[{}]', '[{"id":"a","name":"A","compact":-1,"large":1,"handicap":0}]', '[{"id":"a","name":"A","compact":1.5,"large":1,"handicap":0}]', '[{"id":"a","name":"A","compact":0,"large":0,"handicap":0}]', '[{"id":"a","name":"A","compact":1,"large":0,"handicap":0},{"id":"a","name":"B","compact":1,"large":0,"handicap":0}]']) {
    process.env.PARKING_LOTS = lots; assert.throws(() => getBusinessConfig());
  }
});
test('capacity reduction cannot accept new vehicles and legacy assignments stay excluded', () => {
  createTicket(input, 'http://localhost');
  process.env.PARKING_LOTS = '[{"id":"lot-a","name":"Renamed garage","compact":0,"large":1,"handicap":0}]';
  const lot = getBusinessConfig().parkingLots[0];
  assert.equal(availableSpots(lot, 'compact', listTickets()), 0);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'), /full/);
  assert.ok(!('lot_id' in guestTicket(listTickets()[0].token)));
});
test('photos persist, replace independently, stay business isolated, and never enter guest data', async () => {
  const ticket = createTicket(input, 'http://localhost');
  const form = new FormData(); form.set('kind', 'vehicle'); form.set('photo', new File([png], 'car.png', { type: 'image/png' }));
  const response = await POST(new Request(`http://localhost/api/photos?id=${ticket.id}`, { method: 'POST', headers:authHeaders, body: form }));
  assert.equal(response.status, 200);
  savePhoto(ticket.id, 'plate', png, 'image/png'); savePhoto(ticket.id, 'vehicle', png, 'image/png');
  assert.equal(photoMetadata(ticket.id).length, 2);
  assert.deepEqual(readPhoto(ticket.id, 'vehicle')?.data, png);
  const image = await GET(new Request(`http://localhost/api/photos?id=${ticket.id}&kind=vehicle`,{headers:authHeaders}));
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.ok(!JSON.stringify(guestTicket(ticket.token)).includes('photo'));
  process.env.BUSINESS_ID = 'other-parking'; assert.equal(readPhoto(ticket.id, 'vehicle'), undefined);
  process.env.BUSINESS_ID = 'parking-test'; changeStatus(ticket.id, 'requested');
  assert.throws(() => savePhoto(ticket.id, 'plate', png, 'image/png'), /while parked/);
});
test('photos reject invalid formats, oversize files, disabled feature and excessive request bodies', async () => {
  const ticket = createTicket(input, 'http://localhost');
  assert.throws(() => savePhoto(ticket.id, 'vehicle', Buffer.from('<svg/>'), 'image/png'), /JPEG or PNG/);
  assert.throws(() => savePhoto(ticket.id, 'vehicle', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'), /5 MB/);
  const oversized = await POST(new Request(`http://localhost/api/photos?id=${ticket.id}`, { method: 'POST', headers:authHeaders, body: new Uint8Array(6 * 1024 * 1024 + 1) }));
  assert.equal(oversized.status, 413);
  process.env.VEHICLE_PHOTOS_ENABLED = 'false';
  assert.throws(() => savePhoto(ticket.id, 'plate', png, 'image/png'), /disabled/);
  assert.equal((await GET(new Request(`http://localhost/api/photos?id=${ticket.id}`,{headers:authHeaders}))).status, 403);
});
