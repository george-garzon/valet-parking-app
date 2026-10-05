import 'server-only';
import { randomBytes, randomInt, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { database, ApiError } from './db';
import { getBusinessConfig } from './config';
import type { StaffUser, StaffRole } from './types';

export const SESSION_COOKIE = 'porter_staff';
export const SESSION_SECONDS = 8 * 60 * 60;
type UserRecord = StaffUser & { pin_hash: string };
function db() {
  const connection = database();
  connection.exec(`CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, pin_hash TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS staff_sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS staff_login_limits (
    key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS staff_audit (
    id INTEGER PRIMARY KEY, actor_id INTEGER, event TEXT NOT NULL, subject_id INTEGER, created_at TEXT NOT NULL
  );`);
  return connection;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function pinHash(pin: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`; }
function matches(pin: string, hash: string) { const [salt, value] = hash.split(':'); return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(value, 'hex')); }
function safe(record: UserRecord): StaffUser { return { id: record.id, username: record.username, name: record.name, role: record.role, active: Boolean(record.active) }; }
function audit(actor: number | null, event: string, subject: number | null) { db().prepare('INSERT INTO staff_audit (actor_id,event,subject_id,created_at) VALUES (?,?,?,?)').run(actor,event,subject,new Date().toISOString()); }
function identity(input: Record<string, unknown>) {
  if (typeof input.username !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,39}$/i.test(input.username.trim())) throw new ApiError('Employee ID must be 3–40 letters, numbers, dots, underscores or hyphens.', 422);
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw new ApiError('Enter an employee name (up to 100 characters).', 422);
  if (!['admin','manager','attendant'].includes(String(input.role))) throw new ApiError('Choose a valid role.', 422);
  return { username: input.username.trim().toLowerCase(), name: input.name.trim(), role: input.role as StaffRole };
}
function managed(actor: StaffUser, target: StaffRole) {
  if (actor.role !== 'admin' && !(actor.role === 'manager' && target === 'attendant')) throw new ApiError('You cannot manage this employee role.', 403);
}
function verifyActor(actor: StaffUser) {
  const current=db().prepare('SELECT * FROM staff_users WHERE id=?').get(actor.id) as UserRecord|undefined;
  if (!current?.active || current.role!==actor.role) throw new ApiError('Sign in again to continue.',401);
}
export function createStaff(actor: StaffUser, input: Record<string, unknown>) {
  const data = identity(input); managed(actor, data.role);
  const pin = String(randomInt(10000000,100000000));
  try {
    return db().transaction(() => {
      verifyActor(actor);
      const id = Number(db().prepare('INSERT INTO staff_users (username,name,role,pin_hash) VALUES (?,?,?,?)').run(data.username,data.name,data.role,pinHash(pin)).lastInsertRowid);
      audit(actor.id, 'user-created', id);
      return { user: safe(db().prepare('SELECT * FROM staff_users WHERE id=?').get(id) as UserRecord), pin };
    }).immediate();
  } catch(error) { if (error instanceof Error && error.message.includes('staff_users.username')) throw new ApiError('That employee ID already exists.',409); throw error; }
}
export function bootstrapAdmin(username: string, name: string) {
  const data = identity({ username,name,role:'admin' });
  return db().transaction(() => {
    if ((db().prepare('SELECT COUNT(*) AS count FROM staff_users').get() as {count:number}).count) throw new ApiError('Staff already exist. Use administrator user management.',409);
    const pin = String(randomInt(10000000,100000000));
    const id = Number(db().prepare('INSERT INTO staff_users (username,name,role,pin_hash) VALUES (?,?,?,?)').run(data.username,data.name,'admin',pinHash(pin)).lastInsertRowid);
    audit(null,'administrator-bootstrap',id);
    return { user: safe(db().prepare('SELECT * FROM staff_users WHERE id=?').get(id) as UserRecord), pin };
  }).immediate();
}
export function listStaff(actor: StaffUser) {
  if (!['admin','manager'].includes(actor.role)) throw new ApiError('Employee management requires a manager or administrator.',403);
  return (db().prepare(actor.role === 'admin' ? 'SELECT * FROM staff_users ORDER BY name' : "SELECT * FROM staff_users WHERE role='attendant' ORDER BY name").all() as UserRecord[]).map(safe);
}
export function updateStaff(actor: StaffUser, input: Record<string, unknown>) {
  if (typeof input.id !== 'number' || !Number.isSafeInteger(input.id)) throw new ApiError('Invalid employee ID.',422);
  return db().transaction(() => {
    verifyActor(actor);
    const target = db().prepare('SELECT * FROM staff_users WHERE id=?').get(input.id) as UserRecord | undefined;
    if (!target) throw new ApiError('Employee not found.',404);
    managed(actor,target.role);
    if (input.action === 'reset-pin') {
      const pin = String(randomInt(10000000,100000000));
      db().prepare('UPDATE staff_users SET pin_hash=? WHERE id=?').run(pinHash(pin),target.id);
      db().prepare('DELETE FROM staff_sessions WHERE user_id=?').run(target.id);
      db().prepare('DELETE FROM staff_login_limits WHERE key=?').run(`user:${target.username}`);
      audit(actor.id,'pin-reset',target.id); return { user:safe(target),pin };
    }
    if (input.action !== 'update') throw new ApiError('Unknown employee action.',422);
    const role = input.role ?? target.role;
    if (!['admin','manager','attendant'].includes(String(role)) || typeof input.active !== 'boolean') throw new ApiError('Choose a valid role and active status.',422);
    managed(actor,role as StaffRole);
    if (target.id === actor.id && (!input.active || role !== actor.role)) throw new ApiError('You cannot deactivate yourself or change your own role.',409);
    if (target.role === 'admin' && target.active && (role !== 'admin' || !input.active) && (db().prepare("SELECT COUNT(*) AS count FROM staff_users WHERE role='admin' AND active=1").get() as {count:number}).count <= 1) throw new ApiError('Keep at least one active administrator.',409);
    db().prepare('UPDATE staff_users SET role=?,active=? WHERE id=?').run(role,Number(input.active),target.id);
    db().prepare('DELETE FROM staff_sessions WHERE user_id=?').run(target.id);
    audit(actor.id,'user-updated',target.id);
    return { user:safe({...target,role:role as StaffRole,active:input.active}) };
  }).immediate();
}
export function loginStaff(username: unknown, pin: unknown) {
  if (typeof username !== 'string' || username.length > 100 || typeof pin !== 'string' || !/^\d{6,12}$/.test(pin)) throw new ApiError('Employee ID or PIN is incorrect.',401);
  const normalized = username.trim().toLowerCase(), now = Math.floor(Date.now()/1000);
  // Persist limits per business across process restarts. Reserve attempts before verification.
  db().transaction(() => {
    db().prepare('DELETE FROM staff_login_limits WHERE until<=?').run(now);
    for (const [key,max,period] of [[`user:${normalized}`,5,900],['global',100,60]] as const) {
      const limit = db().prepare('SELECT attempts FROM staff_login_limits WHERE key=?').get(key) as {attempts:number} | undefined;
      if (limit && limit.attempts >= max) throw new ApiError('Too many sign-in attempts. Wait before trying again.',429);
      db().prepare('INSERT INTO staff_login_limits (key,attempts,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key,now+period);
    }
  }).immediate();
  const user = db().prepare('SELECT * FROM staff_users WHERE username=?').get(normalized) as UserRecord | undefined;
  const valid = matches(pin,user?.pin_hash ?? `00000000000000000000000000000000:${'0'.repeat(64)}`);
  if (!user || !user.active || !valid) throw new ApiError('Employee ID or PIN is incorrect.',401);
  const token = randomBytes(32).toString('hex');
  db().transaction(() => {
    const current=db().prepare('SELECT * FROM staff_users WHERE id=?').get(user.id) as UserRecord;
    if (!current?.active || current.pin_hash !== user.pin_hash) throw new ApiError('Employee ID or PIN is incorrect.',401);
    db().prepare('DELETE FROM staff_login_limits WHERE key=?').run(`user:${normalized}`);
    db().prepare('DELETE FROM staff_sessions WHERE expires<=?').run(now);
    db().prepare('INSERT INTO staff_sessions VALUES (?,?,?)').run(digest(token),user.id,now+SESSION_SECONDS);
    audit(user.id,'sign-in',user.id);
  }).immediate();
  return { user:safe(user),token };
}
export function staffSession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const user = db().prepare('SELECT u.* FROM staff_users u JOIN staff_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(digest(token),Math.floor(Date.now()/1000)) as UserRecord | undefined;
  return user ? safe(user) : null;
}
export function logoutStaff(token: string | undefined) { if (token) db().prepare('DELETE FROM staff_sessions WHERE token_hash=?').run(digest(token)); }
export function requestToken(request: Request) { return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1); }
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = getBusinessConfig().publicUrl ? new URL(getBusinessConfig().publicUrl).origin : new URL(request.url).origin;
  if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError('Request origin is not allowed.',403);
}
export function requireStaff(request: Request, roles?: StaffRole[]) {
  if (!['GET','HEAD'].includes(request.method)) requireSameOrigin(request);
  const user = staffSession(requestToken(request));
  if (!user) throw new ApiError('Sign in to continue.',401);
  if (roles && !roles.includes(user.role)) throw new ApiError('Your role does not allow this action.',403);
  return user;
}

export async function staffInput(request: Request): Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();
  if (!reader) throw new ApiError('Enter valid details.',400);
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new ApiError('Request is too large.',413);}chunks.push(value);}
  try {const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed as Record<string,unknown>;}catch{throw new ApiError('Enter valid details.',400);}
}
export function localPinReset(username: string) {
  return db().transaction(()=>{
    const target=db().prepare('SELECT * FROM staff_users WHERE username=?').get(username.trim().toLowerCase()) as UserRecord|undefined;
    if(!target||!target.active)throw new ApiError('Active employee not found.',404);
    const pin=String(randomInt(10000000,100000000));
    db().prepare('UPDATE staff_users SET pin_hash=? WHERE id=?').run(pinHash(pin),target.id);
    db().prepare('DELETE FROM staff_sessions WHERE user_id=?').run(target.id);
    db().prepare('DELETE FROM staff_login_limits WHERE key=?').run(`user:${target.username}`);
    audit(null,'local-pin-reset',target.id);return {user:safe(target),pin};
  }).immediate();
}
