import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { getBusinessConfig } from './config';
import { renderGuestMessage, DEFAULT_SMS_TEMPLATE } from './message-template';
import type { Ticket, GuestTicket, Status, GuestMessage } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const globalDb = globalThis as typeof globalThis & { valetDatabases?: Map<string, Database.Database>; valetSchemaVersions?: Map<string, number> };
function migrateRoomColumn(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS ticket_photos (
    ticket_id INTEGER NOT NULL REFERENCES tickets(id), kind TEXT NOT NULL,
    mime TEXT NOT NULL, data BLOB NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(ticket_id, kind)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS ticket_payments (
    ticket_id INTEGER PRIMARY KEY, attempt TEXT NOT NULL, tip INTEGER NOT NULL,
    total INTEGER NOT NULL, created INTEGER NOT NULL, session_id TEXT UNIQUE,
    paid INTEGER NOT NULL DEFAULT 0
  )`);
  const columns = db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'room_number')) db.exec("ALTER TABLE tickets ADD COLUMN room_number TEXT NOT NULL DEFAULT ''");
  for (const column of ['lot_id', 'spot_type']) if (!columns.some(c => c.name === column)) db.exec(`ALTER TABLE tickets ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);

}
function database() {
  // Runtime data is user-owned storage, not a build asset to include in file tracing.
  const base = resolve(/* turbopackIgnore: true */ process.env.VALET_STORAGE || join(process.cwd(), 'storage'));
  const businessId = getBusinessConfig().id;
  const directory = businessId === 'parkside' ? base : join(base, businessId);
  const filename = join(directory, 'valet.sqlite');
  globalDb.valetDatabases ??= new Map();
  globalDb.valetSchemaVersions ??= new Map();
  const existing = globalDb.valetDatabases.get(filename);
  if (existing) {
    // Development hot reload can retain a connection created before this migration.
    if (globalDb.valetSchemaVersions.get(filename) !== 5) { migrateRoomColumn(existing); globalDb.valetSchemaVersions.set(filename, 5); }
    return existing;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL,
    guest TEXT NOT NULL, phone TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL,
    color TEXT NOT NULL, plate TEXT NOT NULL, space TEXT NOT NULL, key_tag TEXT NOT NULL,
    type TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'parked',
    rate INTEGER NOT NULL, created_at TEXT NOT NULL, requested_at TEXT,
    completed_at TEXT, attendant TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS active_plate ON tickets(plate) WHERE status != 'completed';
  CREATE TABLE IF NOT EXISTS guest_messages (
    ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id), body TEXT NOT NULL,
    media_url TEXT NOT NULL DEFAULT '', to_phone TEXT NOT NULL, status TEXT NOT NULL,
    consent_at TEXT, provider_sid TEXT, error TEXT, updated_at TEXT NOT NULL
  );`);
  // Upgrade existing prototype databases in place without changing their tickets or tokens.
  migrateRoomColumn(db);
  globalDb.valetDatabases.set(filename, db);
  globalDb.valetSchemaVersions.set(filename, 5);
  return db;
}

export function listTickets() { return (database().prepare('SELECT * FROM tickets ORDER BY id DESC').all() as Ticket[]).map(t => ({ ...t, payment: paymentSummary(t.id) })); }
export function getTicket(id: number) { return database().prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Ticket | undefined; }
export function guestTicket(token: string) {
  const ticket = database().prepare('SELECT id, token, guest, make, model, color, plate, type, status, rate, created_at, requested_at, room_number FROM tickets WHERE token = ?').get(token) as GuestTicket | undefined;
  if (!ticket) throw new ApiError('Ticket not found. Check your ticket link.', 404);
  if (getBusinessConfig().businessType !== 'hotel') delete ticket.room_number;
  ticket.payment = paymentSummary(ticket.id);
  return ticket;
}
export function createTicket(input: Record<string, unknown>, origin: string) {
  const config = getBusinessConfig();
  const fields = ['guest', 'phone', 'make', 'model', 'color', 'plate', 'space', 'key_tag', 'type', 'notes', 'attendant'] as const;
  const values: Record<string, string | number> = {};
  for (const field of fields) {
    if (input[field] !== undefined && typeof input[field] !== 'string') throw new ApiError(`Invalid field: ${field}`, 422);
    const value = ((input[field] as string | undefined) || '').trim();
    if (field !== 'notes' && !(field === 'space' && config.parkingLotsEnabled) && !value) throw new ApiError(`Please complete ${field.replace('_', ' ')}.`, 422);
    if ([...value].length > (field === 'notes' ? 2000 : 120)) throw new ApiError(`Field too long: ${field}`, 422);
    values[field] = value;
  }
  if (input.room_number !== undefined && typeof input.room_number !== 'string') throw new ApiError('Invalid room number', 422);
  const room = ((input.room_number as string | undefined) || '').trim();
  if (room.length > 40) throw new ApiError('Room number must be 40 characters or fewer.', 422);
  if (config.businessType !== 'hotel' && room) throw new ApiError('Room linking is available only for hotel locations.', 422);
  values.room_number = config.businessType === 'hotel' ? room : '';
  if (config.parkingLotsEnabled) {
    const lot = config.parkingLots.find(lot => lot.id === input.lot_id);
    if (!lot) throw new ApiError('Choose a configured parking lot or garage.', 422);
    if (typeof input.spot_type !== 'string' || !['compact', 'large', 'handicap'].includes(input.spot_type)) throw new ApiError('Choose a spot type.', 422);
    values.lot_id = lot.id; values.spot_type = input.spot_type;
    values.space = `${lot.name} · ${input.spot_type}${values.space ? ` · ${values.space}` : ''}`;
  } else if (input.lot_id || input.spot_type) throw new ApiError('Parking lots are disabled.', 422);
  const rates = config.rates;
  if (!Object.hasOwn(rates, values.type)) throw new ApiError('Invalid parking type', 422);
  values.plate = (values.plate as string).toUpperCase();
  values.token = randomBytes(24).toString('hex');
  values.rate = rates[values.type as keyof typeof rates];
  values.created_at = new Date().toISOString();
  if (input.sms_consent !== undefined && typeof input.sms_consent !== 'boolean') throw new ApiError('Invalid guest text consent', 422);
  const consent = input.sms_consent === true;
  if (consent && config.smsProvider === 'twilio') {
    const phone = parsePhoneNumberFromString(values.phone as string, config.phoneCountry as CountryCode);
    if (!phone?.isValid()) throw new ApiError('Enter a valid guest mobile number to send the ticket by text.', 422);
    values.phone = phone.number;
  }
  const keys = Object.keys(values);
  try {
    return database().transaction(() => {
      if (config.parkingLotsEnabled) {
        const lot = config.parkingLots.find(lot => lot.id === values.lot_id)!;
        const { count } = database().prepare("SELECT COUNT(*) AS count FROM tickets WHERE lot_id = ? AND spot_type = ? AND status IN ('parked', 'requested', 'retrieving')").get(values.lot_id, values.spot_type) as { count: number };
        if (count >= lot[values.spot_type as 'compact' | 'large' | 'handicap']) throw new ApiError('This spot type is full in the selected lot. Choose another option.', 409);
      }
      const id = database().prepare(`INSERT INTO tickets (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values)).lastInsertRowid;
      const ticket = database().prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Ticket;
      let status: GuestMessage['status'] = config.smsProvider === 'disabled' ? 'skipped' : config.smsProvider === 'preview' ? 'preview' : consent ? 'pending' : 'skipped';
      let body = '', error: string | null = null;
      if (config.smsProvider !== 'disabled') {
        try { body = renderGuestMessage(ticket, config, origin, process.env.SMS_TEMPLATE || DEFAULT_SMS_TEMPLATE); }
        catch { status = 'failed'; error = 'Unable to prepare the guest text. Check message template settings.'; }
      }
      database().prepare('INSERT INTO guest_messages (ticket_id, body, media_url, to_phone, status, consent_at, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(ticket.id, body, process.env.SMS_MEDIA_URL?.trim() || '', ticket.phone, status, consent ? values.created_at : null, error, values.created_at);
      return ticket;
    }).immediate();
  } catch (error) {
    if (error instanceof Error && error.message.includes('tickets.plate')) throw new ApiError('This license plate already has an active ticket.', 409);
    throw error;
  }
}
export function getWelcomeMessage(id: number) {
  return database().prepare('SELECT ticket_id, body, media_url, to_phone, status, consent_at, provider_sid, error FROM guest_messages WHERE ticket_id = ?').get(id) as GuestMessage | undefined;
}
export function claimWelcomeMessage(id: number, retry: boolean) {
  const eligible = retry ? 'failed' : 'pending';
  const result = database().prepare("UPDATE guest_messages SET status = 'sending', error = NULL, updated_at = ? WHERE ticket_id = ? AND status = ? AND consent_at IS NOT NULL AND provider_sid IS NULL").run(new Date().toISOString(), id, eligible);
  return result.changes > 0;
}
export function finishWelcomeMessage(id: number, status: GuestMessage['status'], providerSid: string | null, error: string | null) {
  database().prepare('UPDATE guest_messages SET status = ?, provider_sid = ?, error = ?, updated_at = ? WHERE ticket_id = ?').run(status, providerSid, error, new Date().toISOString(), id);
}
export function updateWelcomeMessageContent(id: number, body: string, mediaUrl: string) {
  database().prepare("UPDATE guest_messages SET body = ?, media_url = ? WHERE ticket_id = ? AND status = 'sending'").run(body, mediaUrl, id);
}
export function requestVehicle(token: unknown) {
  if (typeof token !== 'string') throw new ApiError('Invalid ticket token', 422);
  const ticket = guestTicket(token);
  if (getBusinessConfig().paymentRequired && ticket.rate > 0 && !ticket.payment?.paid) throw new ApiError('Please pay the parking fee before requesting your vehicle.', 402);
  const result = database().prepare("UPDATE tickets SET status = 'requested', requested_at = ? WHERE token = ? AND status = 'parked'").run(new Date().toISOString(), token);
  if (!result.changes) throw new ApiError('This ticket is unavailable or has already been requested.', 409);
  return { success: true };
}
export function changeStatus(id: unknown, status: unknown) {
  const previous: Partial<Record<Status, Status>> = { requested: 'parked', retrieving: 'requested', ready: 'retrieving', completed: 'ready' };
  if (typeof status !== 'string' || !Object.hasOwn(previous, status)) throw new ApiError('Invalid ticket status', 422);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new ApiError('Invalid ticket ID', 422);
  const now = new Date().toISOString();
  const result = database().prepare(`UPDATE tickets SET status = ?,
    requested_at = CASE WHEN ? = 'requested' THEN ? ELSE requested_at END,
    completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
    WHERE id = ? AND status = ?`).run(status, status, now, status, now, id, previous[status as Status]);
  if (!result.changes) throw new ApiError('Ticket changed. Refresh and try again.', 409);
  return { success: true };
}

export type PaymentRecord = { ticket_id: number; attempt: string; tip: number; total: number; created: number; session_id: string | null; paid: number };
export function paymentRecord(id: number) { return database().prepare('SELECT * FROM ticket_payments WHERE ticket_id = ?').get(id) as PaymentRecord | undefined; }
export function paymentSummary(id: number) {
  const p = paymentRecord(id);
  return p ? { paid: !!p.paid, tip: p.tip, total: p.total } : undefined;
}
export function reservePayment(ticket: GuestTicket, tip: number) {
  database().prepare('INSERT OR IGNORE INTO ticket_payments (ticket_id, attempt, tip, total, created) VALUES (?, ?, ?, ?, ?)').run(ticket.id, randomBytes(16).toString('hex'), tip, ticket.rate + tip, Math.floor(Date.now() / 1000));
  return paymentRecord(ticket.id)!;
}
export function attachPaymentSession(id: number, attempt: string, session: string) {
  database().prepare('UPDATE ticket_payments SET session_id = ? WHERE ticket_id = ? AND attempt = ?').run(session, id, attempt);
}
export function expirePaymentSession(id: number, session: string) {
  database().prepare('DELETE FROM ticket_payments WHERE ticket_id = ? AND session_id = ? AND paid = 0').run(id, session);
}
export function settlePayment(session: string, total: number) {
  return database().transaction(() => {
    const p = database().prepare('SELECT * FROM ticket_payments WHERE session_id = ?').get(session) as PaymentRecord | undefined;
    if (!p || p.total !== total) throw new ApiError('Payment does not match this ticket.', 409);
    database().prepare('UPDATE ticket_payments SET paid = 1 WHERE ticket_id = ?').run(p.ticket_id);
    database().prepare("UPDATE tickets SET status = 'requested', requested_at = ? WHERE id = ? AND status = 'parked'").run(new Date().toISOString(), p.ticket_id);
  })();
}

export type PhotoKind = 'vehicle' | 'plate';
export function photoMetadata(id: number) {
  return database().prepare('SELECT kind, updated_at FROM ticket_photos WHERE ticket_id = ?').all(id) as { kind: PhotoKind; updated_at: string }[];
}
export function readPhoto(id: number, kind: PhotoKind) {
  return database().prepare('SELECT mime, data FROM ticket_photos WHERE ticket_id = ? AND kind = ?').get(id, kind) as { mime: string; data: Buffer } | undefined;
}
export function savePhoto(id: number, kind: PhotoKind, data: Buffer, mime: string) {
  if (!getBusinessConfig().vehiclePhotosEnabled) throw new ApiError('Vehicle photos are disabled.', 403);
  if (!['vehicle', 'plate'].includes(kind)) throw new ApiError('Invalid photo kind.', 422);
  if (!data.length || data.length > 5 * 1024 * 1024) throw new ApiError('Photos must be no larger than 5 MB.', 422);
  const jpeg = data.length > 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  const png = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!((mime === 'image/jpeg' && jpeg) || (mime === 'image/png' && png))) throw new ApiError('Choose a JPEG or PNG image.', 422);
  database().transaction(() => {
    const ticket = getTicket(id);
    if (!ticket) throw new ApiError('Ticket not found.', 404);
    if (ticket.status !== 'parked') throw new ApiError('Photos can only be saved while parked.', 409);
    database().prepare('INSERT INTO ticket_photos (ticket_id, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ticket_id, kind) DO UPDATE SET mime=excluded.mime, data=excluded.data, updated_at=excluded.updated_at').run(id, kind, mime, data, new Date().toISOString());
  })();
}
