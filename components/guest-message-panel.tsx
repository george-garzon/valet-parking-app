'use client';

import { useState, useEffect } from 'react';
import { api, errorMessage } from '@/lib/client-api';
import type { GuestMessage, Ticket } from '@/lib/types';
import { useBusiness } from './business-provider';

export default function GuestMessagePanel({ ticket, notify }: { ticket: Ticket; notify: (message: string) => void }) {
  const business = useBusiness();
  const [message, setMessage] = useState<GuestMessage | null>(ticket.notification || null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api?action=message&id=${ticket.id}`, { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error('Unable to load guest text status.');
      const data = await r.json(); if (!cancelled) setMessage(data);
    }).catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [ticket.id]);
  async function retry() {
    setBusy(true); setError('');
    try { const result = await api<GuestMessage>('retry-message', { id: ticket.id }); setMessage(result); notify(result.status === 'queued' ? 'Guest text submitted.' : result.error || 'Text status updated.'); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  if (!message && !error) return null;
  const statuses = { preview: 'Preview only — no text sent', skipped: 'Guest text not sent', pending: 'Guest text waiting to submit', sending: 'Submitting guest text', queued: 'Submitted to SMS provider', failed: 'Guest text could not be submitted', unknown: 'Text submission not confirmed' };
  return <section className="guest-text-panel"><strong>Guest text</strong>{message && <>
    <p className={`guest-text-status ${message.status}`}>{statuses[message.status]}</p>
    {message.status === 'queued' && <p>Accepted for delivery. Handset delivery has not been confirmed.</p>}
    {message.status === 'skipped' && <p>{business.smsProvider === 'disabled' ? 'Text messaging is turned off.' : 'No guest permission was recorded. Share the private link below.'}</p>}
    {message.error && <p className="form-error">{message.error} The vehicle is saved; you can share its link below.</p>}
    {message.body && <details><summary>View text message</summary><span>To: {message.to_phone}</span><pre>{message.body}</pre>{message.media_url && <a href={message.media_url} target="_blank" rel="noopener noreferrer">View attached image ↗</a>}</details>}
    {message.status === 'failed' && message.consent_at && business.smsProvider === 'twilio' && <button className="button secondary" disabled={busy} onClick={retry}>{busy ? 'Submitting…' : 'Retry guest text'}</button>}
  </>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
