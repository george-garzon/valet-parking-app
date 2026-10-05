import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBusinessConfig } from '../lib/config';
import { createTicket, changeStatus, savePhoto, readPhoto, photoMetadata, guestTicket } from '../lib/db';
import { GET, POST } from '../app/api/photos/route';

const original = { ...process.env };
let storage: string;
const input = { guest: 'Alex', phone: '555-0100', make: 'Acura', model: 'ADX', color: 'Black', plate: 'TEST1', space: 'A-01', key_tag: 'K1', type: 'Transient', notes: '', attendant: 'Jamie' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=', 'base64');
beforeEach(() => {
  storage = mkdtempSync(join(tmpdir(), 'porter-parking-'));
  Object.assign(process.env, { VALET_STORAGE: storage, BUSINESS_ID: 'parking-test', SMS_PROVIDER: 'disabled', VEHICLE_PHOTOS_ENABLED: 'true', PARKING_MAP_ENABLED: 'true', PARKING_MAP_ROWS: '[["A-01","A-02"],["B-01"]]', GUEST_PAYMENT_REQUIRED: 'false' });
});
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); rmSync(storage, { recursive: true, force: true }); });
test('configured spaces reject duplicate occupancy until ready, with case normalization', () => {
  const ticket = createTicket({ ...input, space: 'a-01' }, 'http://localhost');
  assert.equal(ticket.space, 'A-01');
  assert.throws(() => createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'), /occupied/);
  assert.throws(() => createTicket({ ...input, plate: 'TEST2', space: 'X-99' }, 'http://localhost'), /configured/);
  changeStatus(ticket.id, 'requested'); changeStatus(ticket.id, 'retrieving');
  assert.throws(() => createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'), /occupied/);
  changeStatus(ticket.id, 'ready');
  assert.ok(createTicket({ ...input, plate: 'TEST2' }, 'http://localhost'));
  process.env.PARKING_MAP_ENABLED = 'false';
  assert.ok(createTicket({ ...input, plate: 'TEST3', space: 'X-99' }, 'http://localhost'));
});
test('parking map config rejects malformed, empty, or duplicate space rows', () => {
  for (const rows of ['oops', '[]', '[[]]', '[["A-01","a-01"]]', '[[1]]']) {
    process.env.PARKING_MAP_ROWS = rows; assert.throws(() => getBusinessConfig());
  }
});
test('photos persist, replace independently, stay business isolated, and never enter guest data', async () => {
  const ticket = createTicket(input, 'http://localhost');
  const form = new FormData(); form.set('kind', 'vehicle'); form.set('photo', new File([png], 'car.png', { type: 'image/png' }));
  const response = await POST(new Request(`http://localhost/api/photos?id=${ticket.id}`, { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  savePhoto(ticket.id, 'plate', png, 'image/png'); savePhoto(ticket.id, 'vehicle', png, 'image/png');
  assert.equal(photoMetadata(ticket.id).length, 2);
  assert.deepEqual(readPhoto(ticket.id, 'vehicle')?.data, png);
  const image = await GET(new Request(`http://localhost/api/photos?id=${ticket.id}&kind=vehicle`));
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
  const oversized = await POST(new Request(`http://localhost/api/photos?id=${ticket.id}`, { method: 'POST', body: new Uint8Array(6 * 1024 * 1024 + 1) }));
  assert.equal(oversized.status, 413);
  process.env.VEHICLE_PHOTOS_ENABLED = 'false';
  assert.throws(() => savePhoto(ticket.id, 'plate', png, 'image/png'), /disabled/);
  assert.equal((await GET(new Request(`http://localhost/api/photos?id=${ticket.id}`))).status, 403);
});
