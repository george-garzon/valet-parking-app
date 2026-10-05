'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './icon';
import { Badge } from './ticket-table';
import { actionLabels, money, ticketNumber, type Ticket } from '@/lib/types';
import { useBusiness } from './business-provider';
import VehiclePhotos from './vehicle-photos';
import GuestMessagePanel from './guest-message-panel';

export default function TicketDialog({ ticket: t, close, advance, pending, notify }: {
  ticket: Ticket; close: () => void; advance: (ticket: Ticket) => void; pending: number | null; notify: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const business = useBusiness();
  const input = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); dialog.current?.showModal(); }, []);
  const link = `${business.publicUrl || origin}/?ticket=${t.token}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link); notify('Guest link copied.'); }
    catch { input.current?.select(); notify('Select and copy the link.'); }
  }
  return <dialog id="ticket-dialog" ref={dialog} onCancel={close} onClose={close} aria-label={`Ticket ${ticketNumber(t.id)}`}>
    <div className="dialog-heading"><div className="eyebrow">DIGITAL VALET TICKET</div><button className="icon-button" aria-label="Close ticket" onClick={close}>✕</button></div>
    <h2>{t.make} {t.model}</h2><p className="muted">{ticketNumber(t.id)} · {t.color} · {t.plate}</p><Badge status={t.status} />
    {business.businessType === 'hotel' && t.room_number && <p className="linked-room">Linked to Room # {t.room_number}</p>}
    <dl className="ticket-details">{[['Guest', t.guest], ['Phone', t.phone], ['Parking space', t.space], ['Key tag', t.key_tag], ['Attendant', t.attendant], ['Parking type', t.type], ['Ticket rate', money(t.rate)], ['Payment', t.payment?.paid ? `Paid ${money(t.payment.total)} · Tip ${money(t.payment.tip)}` : 'Not paid online'], ['Arrival', new Date(t.created_at).toLocaleString('en-US', { timeZone: business.timeZone })]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <a className="button secondary full print-ticket-link" href={`/api/print?id=${t.id}`} target="_blank" rel="noopener noreferrer">Print two-part ticket ↗</a>
    <div className="condition"><strong>Condition & notes</strong><p>{t.notes || 'No condition notes recorded.'}</p></div>
    {business.vehiclePhotosEnabled && <VehiclePhotos ticket={t} />}
    <GuestMessagePanel ticket={t} notify={notify} />
    <div className="guest-link"><strong>Guest ticket link</strong><p>Share this private link with the guest. Anyone with it can view this ticket and request the vehicle.</p><div><input ref={input} aria-label="Guest ticket link" readOnly value={link} /><button className="button secondary" onClick={copy}>Copy</button></div><a href={link} target="_blank" rel="noopener noreferrer">Open guest ticket ↗</a></div>
    {t.status !== 'completed' && <button className="button primary full" disabled={pending === t.id} onClick={() => advance(t)}>{actionLabels[t.status]} <Icon name="arrow" /></button>}
  </dialog>;
}
