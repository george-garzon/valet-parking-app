import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapAdmin,loginStaff,SESSION_COOKIE } from '../lib/staff-auth';
import { getBusinessConfig } from '../lib/config';
import { printedTicketDocument } from '../lib/printed-ticket';
import { GET } from '../app/api/print/route';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import type { Ticket } from '../lib/types';

const ticket: Ticket = { id: 42, token: 'a'.repeat(48), status: 'parked', guest: '<script>alert("guest")</script>', phone: 'STAFF-PHONE-ONLY', make: 'Acura', model: 'ADX', color: 'Black', plate: '28AHFP', space: 'STAFF-SPACE-ONLY', key_tag: 'STAFF-KEY-ONLY', type: 'Transient', notes: '<img src=x onerror=alert(1)>\nScratch on bumper', attendant: 'STAFF-ATTENDANT-ONLY', room_number: '320', rate: 2500, created_at: '2026-10-04T12:00:00Z', requested_at: null, completed_at: null };
test('printed saved ticket has matching halves, escaped input and a decodable guest QR without staff data', async () => {
  const config = { ...getBusinessConfig(), publicUrl: 'https://valet.example.com', businessType: 'hotel' as const };
  const html = await printedTicketDocument(config, ticket, 'http://localhost');
  assert.equal((html.match(/<strong>VP-0042<\/strong>/g) || []).length, 2);
  assert.ok(html.includes('Podium / key copy')); assert.ok(html.includes('Guest claim ticket'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>alert('));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  const guest = html.split('class="stub guest-stub"')[1];
  for (const privateValue of ['STAFF-PHONE-ONLY', 'STAFF-SPACE-ONLY', 'STAFF-KEY-ONLY', 'STAFF-ATTENDANT-ONLY', 'Scratch on bumper']) assert.ok(!guest.includes(privateValue));
  const image = html.match(/src="data:image\/png;base64,([^"]+)"/)![1];
  const png = PNG.sync.read(Buffer.from(image, 'base64'));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, `https://valet.example.com/?ticket=${ticket.token}`);
  assert.ok(html.includes('window.print()')); assert.ok(html.includes('Save printable HTML'));
  assert.ok(!html.includes('<script src='));
});
test('fallback batches have distinct matching references and no online QR or database tickets', async () => {
  const html = await printedTicketDocument(getBusinessConfig(), null, 'http://localhost', 5);
  const refs = [...html.matchAll(/<strong>(OFF-[^<]+)<\/strong>/g)].map(match => match[1]);
  assert.equal(refs.length, 10); assert.equal(new Set(refs).size, 5);
  for (let i = 0; i < refs.length; i += 2) assert.equal(refs[i], refs[i + 1]);
  assert.ok(!html.includes('data:image')); assert.ok(!html.includes('/?ticket='));
  assert.ok(html.includes('not saved to the app'));
  const next = await printedTicketDocument(getBusinessConfig(), null, 'http://localhost', 1);
  assert.ok(!next.includes(refs[0]));
});
test('print endpoint validates batch limits and prevents caching staff printouts', async () => {
  const original={...process.env},storage=mkdtempSync(join(tmpdir(),'porter-print-'));
  Object.assign(process.env,{VALET_STORAGE:storage,BUSINESS_ID:'printing',PUBLIC_APP_URL:'http://localhost',PARKING_LOTS_ENABLED:'false'});
  try {
    assert.equal((await GET(new Request('http://localhost/api/print?blank=true'))).status,401);
    const admin=bootstrapAdmin('print-admin','Print Admin');const session=loginStaff(admin.user.username,admin.pin);
    const headers={Cookie:`${SESSION_COOKIE}=${session.token}`};
    for (const query of ['', '?id=0', '?id=nope', '?blank=true&count=0', '?blank=true&count=21', '?blank=true&count=1.5']) {
      assert.equal((await GET(new Request(`http://localhost/api/print${query}`,{headers}))).status, 422);
    }
    const response = await GET(new Request('http://localhost/api/print?blank=true&count=2',{headers}));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(((await response.text()).match(/class="sheet"/g) || []).length, 2);
  } finally {for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);rmSync(storage,{recursive:true,force:true});}
});
