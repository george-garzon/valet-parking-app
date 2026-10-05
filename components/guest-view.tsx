'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './icon';
import { Badge } from './ticket-table';
import { api, errorMessage } from '@/lib/client-api';
import { money, ticketNumber, type GuestTicket, type Status } from '@/lib/types';
import { useBusiness } from './business-provider';
import TicketQr from './ticket-qr';
import RequestCar from './request-car';

const messages: Record<Status, [string, string]> = {
  parked: ['Ready when you are.', 'Request your vehicle when you’re ready to leave. Your valet will receive your request.'],
  requested: ['Your request is in the queue.', 'Your valet has received your request. This page updates automatically.'],
  retrieving: ['We’re bringing your car around.', 'Please make your way to the main valet entrance.'],
  ready: ['Your car is ready!', 'Meet your valet at the main entrance for your keys.'],
  completed: ['Thanks for visiting.', 'Your vehicle has been handed over. We hope to see you again soon.'],
};
export default function GuestView({ token, notify }: { token: string; notify: (message: string) => void }) {
  const router = useRouter();
  const business = useBusiness();
  const [ticket, setTicket] = useState<GuestTicket | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tip, setTip] = useState('0');
  const [checkoutError, setCheckoutError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const refresh = useCallback(async () => {
    if (!token) return;
    try { setTicket(await api<GuestTicket>('guest', undefined, token)); setError(''); setRefreshError(''); }
    catch (error) { setRefreshError(errorMessage(error)); }
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    setTicket(null); setError(''); setRefreshError('');
    if (token) api<GuestTicket>('guest', undefined, token).then(t => { if (!cancelled) setTicket(t); }).catch(e => { if (!cancelled) setError(errorMessage(e)); });
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token, refresh]);
  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get('payment_session');
    if (!token || !session) return;
    setBusy(true);
    api<{ paid: boolean }>('confirm-payment', { token, session }).then(async result => {
      if (result.paid) { notify('Payment confirmed. Your valet has received your request.'); window.history.replaceState(null, '', `/?ticket=${token}`); }
      else notify('Your payment is still processing. Please refresh shortly.');
      await refresh();
    }).catch(e => notify(errorMessage(e))).finally(() => setBusy(false));
  }, [token, refresh, notify]);
  async function pay() {
    const cents = Math.round(Number(tip) * 100);
    if (!/^\d+(\.\d{1,2})?$/.test(tip) || cents > 100000) { setCheckoutError('Enter a tip between $0 and $1,000, with up to two decimal places.'); return; }
    setBusy(true); setCheckoutError('');
    try {
      const result = await api<{ url?: string; paid?: boolean }>('checkout', { token, tip: cents });
      if (result.url) window.location.assign(result.url);
      else { await refresh(); setCheckoutOpen(false); }
    } catch (e) { setCheckoutError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function request() {
    setBusy(true);
    try { await api('request', { token }); await refresh(); notify('Your valet has received your request.'); }
    catch (error) { setCheckoutError(errorMessage(error)); notify(errorMessage(error)); await refresh(); }
    finally { setBusy(false); }
  }
  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = new URL(String(new FormData(event.currentTarget).get('link')));
      const token = url.searchParams.get('ticket');
      if (!token) throw new Error();
      router.push(`/?ticket=${encodeURIComponent(token)}`);
    } catch { setError('Please paste a valid guest ticket link.'); }
  }
  if (!token) return <section className="guest-card"><div className="guest-car"><Icon name="key" /></div><h2>Welcome to {business.businessName}</h2><p>Open the private ticket link provided by your valet, or paste it below.</p><form onSubmit={lookup}><label className="field">Guest ticket link<input name="link" required placeholder="Paste your guest ticket link" /></label><button className="button primary full">Open my ticket <Icon name="arrow" /></button><p className="form-error" role="alert">{error}</p></form></section>;
  if (error) return <section className="guest-card"><h2>Ticket unavailable</h2><p role="alert">{error}</p></section>;
  if (!ticket) return <section className="guest-card">Loading your ticket…</section>;
  const t = ticket, step = ['parked', 'requested', 'retrieving', 'ready', 'completed'].indexOf(t.status);
  return <section className="guest-card"><div className="eyebrow">{business.businessName.toUpperCase()}</div><h1>Hello, {t.guest.split(' ')[0]}.</h1><p>Your vehicle is in good hands.</p><div className="guest-car"><Icon name="car" /></div><h2>{t.make} {t.model}</h2><p>{t.color} <span>·</span> <span className="plate">{t.plate}</span></p><Badge status={t.status} />
    <div className="guest-summary guest-summary-with-qr"><span>Digital ticket<strong>{ticketNumber(t.id)}</strong>{business.businessType === 'hotel' && t.room_number && <span className="linked-room">Linked to Room # {t.room_number}</span>}</span><TicketQr id={t.id} token={t.token} /><span>Parking rate<strong>{money(t.rate)}</strong></span></div>
    <div className="progress-track">{['Checked in', 'Requested', 'Retrieving', 'Ready', 'Collected'].map((label, i) => <div key={label} className={i <= step ? 'done' : ''}><i>{i <= step ? '✓' : i + 1}</i><small>{label}</small></div>)}</div>
    <div className="guest-message"><strong>{messages[t.status][0]}</strong><p>{t.status === 'retrieving' ? `Please make your way to ${business.pickupLocation}.` : t.status === 'ready' ? `Meet your valet at ${business.pickupLocation} for your keys.` : messages[t.status][1]}</p></div>
    {t.payment?.paid && <p className="payment-confirmed">Paid {money(t.payment.total)}{t.payment.tip > 0 && ` · Includes ${money(t.payment.tip)} tip`}</p>}
    {t.status === 'parked' && <div className="guest-request-wrap"><button type="button" className="guest-request-button" title="Request" disabled={busy} onClick={() => { setCheckoutError(''); if (business.paymentsEnabled && !t.payment?.paid) setCheckoutOpen(true); else void request(); }}><span className="request-car-circle"><RequestCar /></span><span>{busy ? 'Please wait…' : 'Request'}</span></button></div>}
    {checkoutOpen && t.status === 'parked' && <div className="guest-checkout" role="region" aria-label="Payment and vehicle request">
      <h3>Request your vehicle</h3><p>Parking fee <strong>{money(t.rate)}</strong></p>
      {business.tipsEnabled && !t.payment && <><label className="field">Leave a tip <span className="muted">Optional</span><input aria-label="Tip amount in dollars" type="number" min="0" max="1000" step="0.01" value={tip} onChange={e => setTip(e.target.value)} /></label><div className="tip-presets">{[0, ...business.tipPresets].map(c => <button type="button" key={c} aria-pressed={Number(tip) * 100 === c} onClick={() => setTip(String(c / 100))}>{c === 0 ? 'No tip' : money(c)}</button>)}</div></>}
      {t.payment && <p>Your checkout includes a {money(t.payment.tip)} tip. Continue to complete payment.</p>}
      <p className="checkout-total">Total <strong>{money(t.payment?.total ?? (t.rate + (business.tipsEnabled ? Math.round((Number(tip) || 0) * 100) : 0)))}</strong></p>
      <button className="button primary full" disabled={busy} onClick={pay}>{busy ? 'Opening checkout…' : t.payment ? 'Continue payment & request' : 'Pay & request vehicle'}</button>
      {!business.paymentRequired && <button className="button secondary full" disabled={busy} onClick={request}>Request now · Pay at valet</button>}
      {business.paymentRequired && t.rate === 0 && Number(tip) === 0 && <button className="button secondary full" disabled={busy} onClick={request}>Request vehicle · No payment due</button>}
      {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
      <button className="checkout-back" disabled={busy} onClick={() => setCheckoutOpen(false)}>Back to ticket</button>
    </div>}
    {refreshError && <p className="form-error" role="alert">Unable to refresh status. Retrying shortly.</p>}
    <p className="guest-payment">If you need help requesting your vehicle, please proceed to {business.pickupLocation}.</p>
  </section>;
}
