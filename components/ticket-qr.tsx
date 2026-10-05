'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useBusiness } from './business-provider';
import { ticketNumber } from '@/lib/types';
import Icon from './icon';

export default function TicketQr({ id, token }: { id: number; token: string }) {
  const business = useBusiness();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setImage(''); setError(false);
    const url = `${business.publicUrl || window.location.origin}/?ticket=${token}`;
    // Local generation keeps the guest's private link away from external QR services.
    import('@/lib/qr-code').then(module => module.ticketQrCode(url)).then(data => { if (!cancelled) setImage(data); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [business.publicUrl, token]);
  function close() { dialog.current?.close(); }
  return <div className="ticket-qr"><button type="button" className="ticket-qr-thumbnail" aria-label={`Show QR code for ticket ${ticketNumber(id)}`} aria-haspopup="dialog" disabled={!image} onClick={() => dialog.current?.showModal()}>
    {image ? <img src={image} alt={`Ticket ${ticketNumber(id)} QR code`} width={60} height={60} /> : <span>{error ? 'QR unavailable' : 'Loading QR…'}</span>}
  </button><small>Tap to enlarge</small>
    <dialog ref={dialog} className="ticket-qr-modal" aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}>
      <div className="ticket-qr-modal-heading"><h2 id={titleId}>Ticket #{ticketNumber(id)}</h2><button type="button" className="icon-button" aria-label="Close QR code" onClick={close}>✕</button></div>
      <p>Scan to open your private valet ticket.</p>
      <div className="ticket-qr-large">{image && <img src={image} alt="Ticket QR Code" width={360} height={360} />}</div>
      <a className="button primary full" href={image} download={`ticket-${ticketNumber(id)}-qr.png`}><Icon name="download" />Download QR Code</a>
      <small>This QR code opens your guest ticket. Keep it with you.</small>
    </dialog>
  </div>;
}
