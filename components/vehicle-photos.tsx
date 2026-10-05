'use client';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { Ticket } from '@/lib/types';

type Photo = { kind: 'vehicle' | 'plate'; updated_at: string };
export default function VehiclePhotos({ ticket }: { ticket: Ticket }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPhotos([]); setError('');
    fetch(`/api/photos?id=${ticket.id}`).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (!cancelled) setPhotos(data);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [ticket.id]);
  async function upload(event: ChangeEvent<HTMLInputElement>, kind: Photo['kind']) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG or PNG up to 5 MB.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('photo', file); form.set('kind', kind);
      const response = await fetch(`/api/photos?id=${ticket.id}`, { method: 'POST', body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setPhotos(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to upload photo.'); }
    finally { setBusy(false); }
  }
  return <section className="vehicle-photos"><h3>Parking photos</h3><p>Staff record · JPEG or PNG, up to 5 MB each.</p><div className="photo-grid">{(['vehicle', 'plate'] as const).map(kind => {
    const photo = photos.find(p => p.kind === kind), label = kind === 'vehicle' ? 'Vehicle' : 'License plate';
    const url = `/api/photos?id=${ticket.id}&kind=${kind}&v=${encodeURIComponent(photo?.updated_at || '')}`;
    return <div key={kind}><strong>{label}</strong>{photo ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${label} parking record`} /></a> : <div className="photo-empty">No photo saved</div>}{ticket.status === 'parked' && <label className="field">{photo ? 'Replace photo' : 'Add photo'}<input aria-label={`${photo ? 'Replace' : 'Add'} ${label.toLowerCase()} photo`} type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={event => void upload(event, kind)} /></label>}</div>;
  })}</div>{busy && <p role="status">Saving photo…</p>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
