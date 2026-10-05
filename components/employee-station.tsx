'use client';

import { useState, useRef, type FormEvent, type InputHTMLAttributes } from 'react';
import Icon from './icon';
import { Badge } from './ticket-table';
import { api, errorMessage } from '@/lib/client-api';
import { actionLabels, ticketNumber, type Ticket } from '@/lib/types';
import { money } from '@/lib/types';
import { useBusiness } from './business-provider';
import { useStaff } from './staff-gate';
import ParkingSelector from './parking-selector';
import VehicleSelector from './vehicle-selector';

function Field({ label, name, placeholder, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field">{label}<input name={name} placeholder={placeholder} required maxLength={120} {...props} /></label>;
}
export default function EmployeeStation({ requests, saved, advance, pending, intakeOnly = false, vehicles = [] }: {
  requests: Ticket[]; saved: (ticket: Ticket) => void; advance: (ticket: Ticket) => void; pending: number | null;
  intakeOnly?: boolean;
  vehicles?: Ticket[];
}) {
  const [saving, setSaving] = useState(false);
  const [vehicleFormKey, setVehicleFormKey] = useState(0);
  const business = useBusiness();
  const staff = useStaff();
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const ticket = await api<Ticket>('create', { ...data, sms_consent: data.sms_consent === 'on' });
      form.current?.reset(); setVehicleFormKey(key => key + 1); saved(ticket);
    } catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  }
  return <div className={intakeOnly ? 'worker-intake' : 'employee-grid'}><section className="panel intake"><div className="panel-heading"><div><h2>New vehicle check-in</h2><p>Create a ticket in just a few moments</p></div><span className="step-tag">01 / ARRIVAL</span></div>
    <div className="paper-ticket-tools"><a href="/api/print?blank=true&count=5" target="_blank" rel="noopener noreferrer">Print 5 blank fallback tickets ↗</a><p>Print ahead for outages. Keep one half with the keys and give the matching half to the guest.</p></div>
    <form id="check-in" ref={form} onSubmit={submit}>
      <h3><span>1</span>Guest information</h3><div className="form-grid">
        <Field label="Guest name" name="guest" placeholder="e.g. Alex Morgan" autoComplete="name" />
        <Field label="Phone number" name="phone" placeholder="e.g. (305) 555-0123" type="tel" autoComplete="tel" />
        {business.businessType === 'hotel' && <label className="field">Room number <span className="field-optional">(optional)</span><input name="room_number" placeholder="e.g. 320 or PH-2" maxLength={40} autoComplete="off" /></label>}
      </div><h3><span>2</span>Vehicle details</h3><div className="form-grid">
        <VehicleSelector key={vehicleFormKey} existingVehicles={vehicles} />
        <Field label="Color" name="color" placeholder="e.g. Graphite gray" /><Field label="License plate" name="plate" placeholder="e.g. ABC 1234" autoCapitalize="characters" />
      </div><h3><span>3</span>Parking & handoff</h3><div className="form-grid">
        {business.parkingLotsEnabled ? <ParkingSelector key={vehicleFormKey} tickets={vehicles} /> : <Field label="Parking space" name="space" placeholder="e.g. A-12" />}<Field label="Key tag" name="key_tag" placeholder="e.g. K-042" />
        <label className="field">Parking type<select name="type" defaultValue="Transient"><option value="Transient">Transient · {money(business.rates.Transient)} / visit</option><option value="Overnight">Overnight · {money(business.rates.Overnight)} / stay</option><option value="Monthly">Monthly · {money(business.rates.Monthly)} / period</option></select></label>
        <Field label="Receiving attendant" name="attendant" value={staff?.name || ''} readOnly />
      </div><label className="field notes">Condition & arrival notes<textarea name="notes" rows={3} maxLength={2000} placeholder="Record existing scratches, dents, or special instructions…" /></label>
      {business.smsProvider !== 'disabled' && <div className="guest-text-optin"><label><input type="checkbox" name="sms_consent" /><span>The guest agrees to receive their valet ticket by text.</span></label><p>{business.smsProvider === 'preview' ? 'A text preview will be saved. No text will be sent in preview mode.' : 'Their private ticket link will be texted when you save this vehicle.'}</p></div>}
      <div className="form-footer"><span><Icon name="key" />A private guest link is created on save.</span><button className="button primary" type="submit" disabled={saving}><Icon name="check" />{saving ? 'Saving…' : 'Save & create ticket'}</button></div>
      <p className="form-error" role="alert">{error}</p>
    </form></section>{!intakeOnly && <section className="panel dispatch"><div className="panel-heading"><div><h2>Dispatch board</h2><p>{requests.length} active retrieval requests</p></div><span className="live-dot" /></div>
    <div className="dispatch-list">{requests.length ? requests.map(t => <article className="dispatch-card" key={t.id}><div className="dispatch-title"><strong>{t.make} {t.model}</strong><Badge status={t.status} /></div><p>{ticketNumber(t.id)} · {t.guest}</p><div className="dispatch-meta"><span>Space <strong>{t.space}</strong></span><span>Key <strong>{t.key_tag}</strong></span></div><button className={`button ${t.status === 'ready' ? 'primary' : 'secondary'} full`} disabled={pending === t.id} onClick={() => advance(t)}>{actionLabels[t.status]} <Icon name="arrow" /></button></article>) : <div className="queue-empty"><Icon name="clock" /><strong>No pending requests</strong><p>Requests from guest tickets appear here. You can also request a car from its ticket.</p></div>}</div>
  </section>}</div>;
}
