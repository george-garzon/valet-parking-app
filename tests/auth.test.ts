import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { database,createTicket } from '../lib/db';
import { localPinReset,bootstrapAdmin,createStaff,updateStaff,listStaff,loginStaff,logoutStaff,staffSession,requireStaff,SESSION_COOKIE } from '../lib/staff-auth';
import { GET as authGet,POST as authPost } from '../app/api/auth/route';
import { GET as usersGet,POST as usersPost } from '../app/api/users/route';
import { GET as apiGet,POST as apiPost } from '../app/api/route';
import { GET as photosGet } from '../app/api/photos/route';
import { GET as printGet } from '../app/api/print/route';
import type { StaffUser } from '../lib/types';
const original={...process.env};let storage:string,admin:StaffUser,pin:string;
beforeEach(()=>{
  storage=mkdtempSync(join(tmpdir(),'porter-auth-'));
  Object.assign(process.env,{VALET_STORAGE:storage,BUSINESS_ID:'auth-test',PUBLIC_APP_URL:'http://localhost',PARKING_LOTS_ENABLED:'false',GUEST_PAYMENTS_ENABLED:'false',GUEST_PAYMENT_REQUIRED:'false',SMS_PROVIDER:'disabled'});
  const setup=bootstrapAdmin('owner-admin','Owner Admin');admin=setup.user;pin=setup.pin;
});
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);rmSync(storage,{recursive:true,force:true});});
const headers=(token:string)=>({Cookie:`${SESSION_COOKIE}=${token}`,Origin:'http://localhost'});
const post=(path:string,body:unknown,token='')=>new Request(`http://localhost${path}`,{method:'POST',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify(body)});
test('bootstrap has no defaults, hashes PINs, prevents second bootstrap, and sessions expire/revoke',()=>{
  assert.match(pin,/^\d{8}$/);assert.throws(()=>bootstrapAdmin('second-admin','Second'),/already exist/);
  const record=database().prepare('SELECT pin_hash FROM staff_users WHERE id=?').get(admin.id) as {pin_hash:string};
  assert.ok(!record.pin_hash.includes(pin));
  const first=loginStaff(admin.username,pin),second=loginStaff(admin.username,pin);assert.notEqual(first.token,second.token);
  assert.equal(staffSession(first.token)?.id,admin.id);
  const stored=database().prepare('SELECT token_hash FROM staff_sessions').all() as {token_hash:string}[];
  assert.ok(stored.every(row=>row.token_hash!==first.token&&row.token_hash!==second.token));
  logoutStaff(first.token);assert.equal(staffSession(first.token),null);
  database().prepare('UPDATE staff_sessions SET expires=0').run();assert.equal(staffSession(second.token),null);
  assert.ok(!JSON.stringify(listStaff(admin)).includes('pin'));
});
test('manager can manage only attendants; users cannot escalate privileges or deactivate themselves',()=>{
  const manager=createStaff(admin,{username:'manager-1',name:'Manager',role:'manager'}).user;
  const attendant=createStaff(manager,{username:'runner-1',name:'Runner',role:'attendant'}).user;
  assert.throws(()=>createStaff(manager,{username:'new-admin',name:'Bad',role:'admin'}),/cannot manage/);
  assert.throws(()=>createStaff(attendant,{username:'new-runner',name:'Bad',role:'attendant'}),/cannot manage/);
  assert.throws(()=>updateStaff(manager,{action:'update',id:attendant.id,role:'admin',active:true}),/cannot manage/);
  assert.throws(()=>updateStaff(manager,{action:'reset-pin',id:admin.id}),/cannot manage/);
  assert.throws(()=>updateStaff(admin,{action:'update',id:admin.id,role:'admin',active:false}),/yourself/);
  assert.equal(listStaff(manager).length,1);assert.throws(()=>listStaff(attendant),/requires/);
});
test('PIN reset, role changes and deactivation revoke sessions and reject old credentials',()=>{
  const employee=createStaff(admin,{username:'runner-one',name:'Runner',role:'attendant'});
  const session=loginStaff(employee.user.username,employee.pin);
  const reset=updateStaff(admin,{action:'reset-pin',id:employee.user.id});
  assert.equal(staffSession(session.token),null);assert.throws(()=>loginStaff(employee.user.username,employee.pin),/incorrect/);
  const newSession=loginStaff(employee.user.username,reset.pin!);
  updateStaff(admin,{action:'update',id:employee.user.id,role:'manager',active:true});
  assert.equal(staffSession(newSession.token),null);
  const promoted=loginStaff(employee.user.username,reset.pin!);assert.equal(promoted.user.role,'manager');
  updateStaff(admin,{action:'update',id:employee.user.id,role:'manager',active:false});
  assert.equal(staffSession(promoted.token),null);assert.throws(()=>loginStaff(employee.user.username,reset.pin!),/incorrect/);
});
test('PIN guessing is limited per employee with generic errors for nonexistent users',()=>{
  for(let i=0;i<5;i++)assert.throws(()=>loginStaff('owner-admin','00000000'),/incorrect/);
  assert.throws(()=>loginStaff('owner-admin',pin),/Too many/);
  assert.throws(()=>loginStaff('unknown-user','00000000'),/incorrect/);
  database().prepare('UPDATE staff_login_limits SET until=0').run();assert.ok(loginStaff('owner-admin',pin));
});
test('businesses isolate users and sessions',()=>{
  const session=loginStaff(admin.username,pin);
  process.env.BUSINESS_ID='another-business';assert.equal(staffSession(session.token),null);
  const other=bootstrapAdmin('owner-admin','Other Owner');assert.notEqual(other.pin,pin);
  assert.ok(loginStaff(other.user.username,other.pin));
});
test('auth endpoint issues HttpOnly cookies, rejects cross-origin login/logout, and signs out',async()=>{
  assert.equal((await authPost(new Request('http://localhost/api/auth',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({action:'login',username:admin.username,pin})}))).status,403);
  const response=await authPost(post('/api/auth',{action:'login',username:admin.username,pin}));assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);
  const token=cookie.split(';')[0].split('=')[1];
  assert.equal((await authGet(new Request('http://localhost/api/auth',{headers:headers(token)}))).status,200);
  assert.throws(()=>requireStaff(new Request('http://localhost/api/users',{headers:headers(token)}),['attendant']),/role/);
  assert.equal((await authPost(post('/api/auth',{action:'logout'},token))).status,200);assert.equal(staffSession(token),null);
  process.env.PUBLIC_APP_URL='https://valet.example.com';
  const secure=await authPost(new Request('https://valet.example.com/api/auth',{method:'POST',headers:{Origin:'https://valet.example.com','Content-Type':'application/json'},body:JSON.stringify({action:'login',username:admin.username,pin})}));
  assert.match(secure.headers.get('set-cookie')!,/Secure/);
});
test('staff ticket, photo, print and user endpoints reject anonymous requests; guest links remain usable',async()=>{
  assert.equal((await apiGet(new NextRequest('http://localhost/api?action=list'))).status,401);
  assert.equal((await apiGet(new NextRequest('http://localhost/api?action=message&id=1'))).status,401);
  assert.equal((await photosGet(new Request('http://localhost/api/photos?id=1'))).status,401);
  assert.equal((await printGet(new Request('http://localhost/api/print?blank=true'))).status,401);
  assert.equal((await usersGet(new Request('http://localhost/api/users'))).status,401);
  const data={guest:'Guest',phone:'555-0100',make:'Acura',model:'ADX',color:'Black',plate:'TEST',space:'A1',key_tag:'K1',type:'Transient',attendant:'Impersonation',notes:''};
  const ticket=createTicket(data,'http://localhost');
  assert.equal((await apiGet(new NextRequest(`http://localhost/api?action=guest&token=${ticket.token}`))).status,200);
  assert.equal((await apiPost(new NextRequest(post('/api?action=create',data)))).status,401);
  const employee=createStaff(admin,{username:'attendant-1',name:'Actual Attendant',role:'attendant'});
  const session=loginStaff(employee.user.username,employee.pin);
  assert.equal((await usersGet(new Request('http://localhost/api/users',{headers:headers(session.token)}))).status,403);
  assert.equal((await usersPost(post('/api/users',{action:'create',username:'new-admin',name:'Bad',role:'admin'},session.token))).status,403);
  const saved=await apiPost(new NextRequest(post('/api?action=create',{...data,plate:'TEST2'},session.token)));
  assert.equal(saved.status,201);assert.equal((await saved.json()).attendant,'Actual Attendant');
  const csrf=post('/api?action=status',{id:ticket.id,status:'requested'},session.token);csrf.headers.set('Origin','https://evil.example');
  assert.equal((await apiPost(new NextRequest(csrf))).status,403);
});

test('local operator recovery resets an active administrator without creating a default account',()=>{
  const session=loginStaff(admin.username,pin);
  const reset=localPinReset(admin.username);assert.match(reset.pin,/^\d{8}$/);
  assert.equal(staffSession(session.token),null);
  assert.throws(()=>loginStaff(admin.username,pin),/incorrect/);
  assert.ok(loginStaff(admin.username,reset.pin));
  assert.throws(()=>localPinReset('missing-admin'),/not found/);
});
test('authentication rejects malformed and oversized payloads before credential verification',async()=>{
  const oversized=new Request('http://localhost/api/auth',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:'x'.repeat(4097)});
  assert.equal((await authPost(oversized)).status,413);
  assert.equal((await authPost(post('/api/auth',null))).status,400);
});
test('employee API creates and resets credentials once without exposing stored PIN hashes',async()=>{
  const session=loginStaff(admin.username,pin);
  const created=await usersPost(post('/api/users',{action:'create',username:'api-runner',name:'API Runner',role:'attendant'},session.token));
  assert.equal(created.status,201);const data=await created.json();assert.match(data.pin,/^\d{8}$/);
  const list=await usersGet(new Request('http://localhost/api/users',{headers:headers(session.token)}));const employees=await list.json();
  assert.equal(employees.length,2);assert.ok(!JSON.stringify(employees).includes('pin'));
  const runnerSession=loginStaff(data.user.username,data.pin);
  const reset=await usersPost(post('/api/users',{action:'reset-pin',id:data.user.id},session.token));
  assert.equal(reset.status,200);assert.equal(staffSession(runnerSession.token),null);
  const resetData=await reset.json();assert.ok(loginStaff(data.user.username,resetData.pin));
});
