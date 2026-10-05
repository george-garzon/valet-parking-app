'use client';
import ParkingAvailability from './parking-availability';

import Link from 'next/link';
import { useState } from 'react';
import Icon from './icon';
import { Badge } from './ticket-table';
import EmployeeStation from './employee-station';
import { actionLabels, ticketNumber, type Ticket } from '@/lib/types';
import { useBusiness } from './business-provider';

export type WorkerTask = 'home' | 'checkin' | 'retrievals' | 'vehicles' | 'ready';
const taskTitles: Record<WorkerTask, string> = { home: 'Worker station', checkin: 'Check in a car', retrievals: 'Retrieve a car', vehicles: 'Find a vehicle', ready: 'Ready for pickup' };

function WorkerVehicles({ tickets, task, open, advance, pending }: {
  tickets: Ticket[]; task: WorkerTask; open: (ticket: Ticket) => void;
  advance: (ticket: Ticket) => void; pending: number | null;
}) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const items = tickets.filter(t =>
    (task === 'ready' ? t.status === 'ready' : task === 'retrievals' ? ['requested', 'retrieving'].includes(t.status) : t.status !== 'completed') &&
    [t.guest, t.plate, t.make, t.model, t.space, t.key_tag, ticketNumber(t.id)].some(value => value.toLowerCase().includes(q))
  ).sort((a, b) => task === 'retrievals' ? (a.requested_at || '').localeCompare(b.requested_at || '') : b.id - a.id);
  return <>
    <label className="worker-search"><Icon name="search" /><input type="search" aria-label="Find a vehicle" placeholder="Plate, guest, space, or key…" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <p className="worker-result-count">{items.length} {items.length === 1 ? 'vehicle' : 'vehicles'}{task === 'vehicles' ? ' on site' : ''}</p>
    <div className="worker-vehicles">{items.length ? items.map(t => <article className="worker-vehicle" key={t.id}>
      <button className="worker-vehicle-summary" onClick={() => open(t)} aria-label={`View ${t.make} ${t.model}, ${t.plate}`}>
        <span className="worker-vehicle-icon"><Icon name="car" /></span><span><strong>{t.make} {t.model}</strong><small>{t.guest} · {ticketNumber(t.id)}</small></span><Icon name="arrow" />
      </button>
      <div className="worker-vehicle-status"><span className="plate">{t.plate}</span><Badge status={t.status} /></div>
      <dl className="worker-parking"><div><dt><Icon name="location" />Space</dt><dd>{t.space}</dd></div><div><dt><Icon name="key" />Key</dt><dd>{t.key_tag}</dd></div></dl>
      {task !== 'vehicles' && <button className={`button full ${t.status === 'ready' ? 'primary' : 'secondary'}`} disabled={pending !== null} onClick={() => advance(t)}>{pending === t.id ? 'Updating…' : actionLabels[t.status]}<Icon name={t.status === 'ready' ? 'check' : 'arrow'} /></button>}
    </article>) : <div className="worker-empty"><Icon name={q ? 'search' : 'check'} /><h2>{q ? 'No matching vehicles' : task === 'retrievals' ? 'No cars waiting' : task === 'ready' ? 'No cars ready yet' : 'No vehicles on site'}</h2><p>{q ? 'Try a different plate, guest, space, or key.' : task === 'vehicles' ? 'New check-ins will appear here.' : 'This list updates as your team handles requests.'}</p>{task === 'vehicles' && !q && <Link className="button primary" href="/worker?task=checkin">Check in a car <Icon name="plus" /></Link>}</div>}</div>
  </>;
}

export default function WorkerView({ task, tickets, open, saved, advance, pending, error }: {
  task: WorkerTask; tickets: Ticket[]; open: (ticket: Ticket) => void; saved: (ticket: Ticket) => void;
  advance: (ticket: Ticket) => void; pending: number | null; error: string;
}) {
  const business = useBusiness();
  const active = tickets.filter(t => t.status !== 'completed');
  const retrievals = tickets.filter(t => ['requested', 'retrieving'].includes(t.status));
  const ready = tickets.filter(t => t.status === 'ready');
  const tiles = [
    { task: 'checkin', icon: 'plus', label: 'Check in', hint: 'Add a new vehicle', className: 'worker-tile-main', count: null },
    { task: 'retrievals', icon: 'key', label: 'Retrieve', hint: 'Bring a car around', className: 'worker-tile-retrieve', count: retrievals.length },
    { task: 'vehicles', icon: 'car', label: 'Vehicles', hint: 'Find a car or key', className: 'worker-tile-vehicles', count: active.length },
    { task: 'ready', icon: 'check', label: 'Ready', hint: 'Complete a handoff', className: 'worker-tile-ready', count: ready.length },
  ];
  return <div className="worker-page"><main className={`worker-content ${task === 'home' ? 'worker-home' : ''}`}>
    {error && <p className="worker-error" role="alert">Unable to refresh. Retrying shortly.</p>}
    {task === 'home' ? <>
      <div className="worker-intro"><p><span className="live-dot" />{business.businessName}</p><h1>Let’s get moving.</h1><span>What do you need to do?</span></div>
      <nav className="worker-grid" aria-label="Worker actions">{tiles.map(tile => <Link key={tile.task} className={`worker-tile ${tile.className}`} href={`/worker?task=${tile.task}`} aria-label={tile.label}>
        {tile.count !== null && <span className="worker-tile-count" aria-label={`${tile.count} vehicles`}>{tile.count}</span>}
        <span className="worker-tile-icon"><Icon name={tile.icon} /></span><strong>{tile.label}</strong><small>{tile.hint}</small>
      </Link>)}</nav>
      <div className="worker-shift"><span><Icon name="car" /><strong>{active.length}</strong> on site</span><i /><span><Icon name="clock" /><strong>{retrievals.length + ready.length}</strong> pickups</span></div>
      <Link className="worker-desktop-link" href="/?view=dashboard">Open desktop dashboard <Icon name="arrow" /></Link>
    </> : <>
      <div className="worker-task-title"><Link href="/worker" className="worker-home-button" aria-label="All actions"><Icon name="grid" /></Link><h1>{taskTitles[task]}</h1></div>
      {task === 'vehicles' && <ParkingAvailability tickets={tickets} />}
      {task === 'checkin' ? <EmployeeStation intakeOnly requests={[]} vehicles={tickets} saved={saved} advance={advance} pending={pending} /> : <WorkerVehicles key={task} tickets={tickets} task={task} open={open} advance={advance} pending={pending} />}
      <nav className="worker-bottom-nav" aria-label="Worker navigation"><Link href="/worker"><Icon name="grid" /><span>Actions</span></Link>{tiles.map(tile => <Link key={tile.task} href={`/worker?task=${tile.task}`} aria-current={task === tile.task ? 'page' : undefined}><Icon name={tile.icon} /><span>{tile.label}</span></Link>)}</nav>
    </>}
  </main></div>;
}
