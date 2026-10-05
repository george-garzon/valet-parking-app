import 'server-only';
import { randomBytes } from 'node:crypto';
import { ticketQrCode } from './qr-code';
import { money, ticketNumber, type BusinessConfig, type Ticket } from './types';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const field = (label: string, value: string = '') => `<div class="field"><span>${escape(label)}</span><strong>${value ? escape(value) : '<span class="write-in">&nbsp;</span>'}</strong></div>`;

export async function printedTicketDocument(config: BusinessConfig, ticket: Ticket | null, origin: string, count = 1) {
  const url = ticket ? `${config.publicUrl || origin}/?ticket=${encodeURIComponent(ticket.token)}` : '';
  const qr = url ? await ticketQrCode(url) : '';
  const batch = `OFF-${new Date().toISOString().slice(0,10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const sheets = Array.from({ length: ticket ? 1 : count }, (_, index) => {
    const number = ticket ? ticketNumber(ticket.id) : `${batch}-${String(index + 1).padStart(2, '0')}`;
    const heading = (label: string) => `<header><div><small>${escape(config.businessName)}</small><h1>${label}</h1></div><div class="number"><small>Ticket number</small><strong>${escape(number)}</strong></div></header>`;
    const vehicle = ticket ? `${ticket.make} ${ticket.model}` : '';
    const arrival = ticket ? new Date(ticket.created_at).toLocaleString('en-US', { timeZone: config.timeZone }) : '';
    return `<article class="sheet" aria-label="Two-part valet ticket ${escape(number)}">
      <section class="stub staff-stub" aria-label="Podium and key copy">
        ${heading('Podium / key copy')}<p class="instruction">Keep this half at the podium with the vehicle's keys.</p>
        <div class="grid">${field('Guest', ticket?.guest)}${field('Phone', ticket?.phone)}${field('Vehicle', vehicle)}${field('Color / plate', ticket ? `${ticket.color} / ${ticket.plate}` : '')}${field('Lot / space / level', ticket?.space)}${field('Key tag', ticket?.key_tag)}${field('Attendant', ticket?.attendant)}${field('Arrival', arrival)}${field('Parking type', ticket?.type)}${field('Parking fee', ticket ? money(ticket.rate) : '')}${config.businessType === 'hotel' ? field('Room / suite', ticket?.room_number) : ''}</div>
        <div class="notes"><span>Condition / notes</span><p>${ticket?.notes ? escape(ticket.notes).replaceAll('\n','<br>') : '<span class="write-in">&nbsp;</span>'}</p></div>
        <p class="manual">Manual log: □ Parked &nbsp; □ Requested &nbsp; □ Retrieving &nbsp; □ Ready &nbsp; □ Collected</p>
        <div class="grid">${field('Handoff time / attendant')}${field('Payment status / reference')}</div>
      </section>
      <div class="cut">✂ Cut or tear here — matching ticket numbers on both halves</div>
      <section class="stub guest-stub" aria-label="Guest copy">
        ${heading('Guest claim ticket')}<p class="instruction">Keep this half. Present it at the valet podium when collecting your vehicle.</p>
        <div class="guest-body"><div class="grid">${field('Vehicle', vehicle)}${field('Color / plate', ticket ? `${ticket.color} / ${ticket.plate}` : '')}${field('Arrival', arrival)}${field('Parking fee', ticket ? money(ticket.rate) : '')}${config.businessType === 'hotel' ? field('Room / suite', ticket?.room_number) : ''}</div>
        ${qr ? `<figure><img src="${qr}" width="120" height="120" alt="QR code to open your private guest ticket"><figcaption>Scan to request your vehicle.<br>Internet connection required.</figcaption></figure>` : '<div class="offline-note"><strong>Paper fallback ticket</strong><p>This reference is not an online ticket. Request your vehicle at the podium.</p></div>'}</div>
        <p class="pickup">Pickup: ${escape(config.pickupLocation)}</p>
        ${url ? `<p class="guest-url">${escape(url)}</p><p class="footnote">Keep this link private. If you cannot connect, ask at the podium.</p>` : '<p class="footnote">Staff: record this paper reference on the digital ticket when service returns.</p>'}
        <p class="footnote">Printed parking fees do not confirm payment. Staff verify payment separately.</p>
      </section>
    </article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${ticket ? escape(ticketNumber(ticket.id)) : 'Blank fallback tickets'} · ${escape(config.brandName)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font:13px Arial,sans-serif}h1,p,figure{margin:0}h1{font-size:20px;margin-top:5px}small{font-size:11px}.toolbar{max-width:780px;margin:20px auto;padding:16px;background:white;border-radius:8px}.toolbar p{margin-top:10px;line-height:1.5}.toolbar button{padding:10px 16px;margin:0 8px 8px 0;font:inherit;cursor:pointer}.sheet{background:#fff;width:190mm;max-width:100%;margin:20px auto;padding:8mm;break-after:page}.sheet:last-child{break-after:auto}.stub{padding:4mm 0}header{display:flex;justify-content:space-between;gap:16px;align-items:start;border-bottom:2px solid #111;padding-bottom:12px}.number{text-align:right}.number strong{display:block;font-size:20px;margin-top:5px;letter-spacing:.5px;overflow-wrap:anywhere}.instruction{margin:10px 0;font-size:12px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px}.field{min-width:0}.field>span,.notes>span{display:block;font-size:10px;text-transform:uppercase;color:#444;letter-spacing:.5px;margin-bottom:3px}.field strong{display:block;font-size:13px;line-height:1.4;overflow-wrap:anywhere}.write-in{display:block;border-bottom:1px solid #777;min-height:20px}.notes{margin:12px 0}.notes p{line-height:1.4;font-size:12px;overflow-wrap:anywhere;white-space:normal}.manual{font-size:11px;margin:12px 0;line-height:1.6}.cut{border-block:1px dashed #555;text-align:center;font-size:10px;padding:10px 0;margin:12px -8mm}.guest-body{display:flex;align-items:start;gap:16px;margin-top:14px}.guest-body>.grid{flex:1}figure{flex-shrink:0;text-align:center}figure img{display:block}figcaption{font-size:10px;line-height:1.5}.pickup{font-weight:bold;margin-top:14px}.guest-url{font-size:10px;overflow-wrap:anywhere;margin-top:10px}.footnote{font-size:10px;line-height:1.5;margin-top:8px}.offline-note{width:120px;font-size:12px;border:1px solid #111;padding:10px;line-height:1.5}.offline-note p{margin-top:6px}
    @page{size:auto;margin:10mm}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0 auto;width:100%;padding:0;box-shadow:none}.cut{margin-inline:0}header,.field,figure,.cut{break-inside:avoid}}@media screen and (max-width:600px){.sheet{padding:16px}.number strong{font-size:15px}.guest-body{flex-wrap:wrap}.toolbar{margin:10px}.cut{margin-inline:0}}
  </style></head><body><nav class="toolbar" aria-label="Print controls"><button id="print" type="button">Print ${ticket ? 'ticket' : 'fallback tickets'}</button><button id="save" type="button">Save printable HTML</button><p>Use A4 or Letter paper, portrait, 100% scale, and turn browser headers/footers off. Cut along the dashed line. Use your printer's copy setting for reprints. Review the preview; long condition notes may need extra pages.</p><p>${ticket ? 'This is a snapshot of the saved ticket, not proof of payment. The saved HTML contains staff details and a private guest link; keep it in approved staff storage.' : 'Print these before an outage. Each pair has a matching paper reference. These references are not saved to the app; record them during reconciliation. Reprinting or reopening a saved batch repeats its references — do not issue duplicates.'}</p></nav>${sheets}<script>
    document.getElementById('print').addEventListener('click',()=>window.print());
    document.getElementById('save').addEventListener('click',()=>{const blob=new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='valet-tickets.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  </script></body></html>`;
}
