'use client';
import ParkingAvailability from './parking-availability';
import { availableSpots, spotTypes } from '@/lib/types';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Icon from './icon';
import { useBusiness } from './business-provider';
import TicketTable, { Badge } from './ticket-table';
import EmployeeStation from './employee-station';
import TicketDialog from './ticket-dialog';
import GuestView from './guest-view';
import WorkerView, { type WorkerTask } from './worker-view';
import { api, errorMessage } from '@/lib/client-api';
import { businessDay, money, ticketNumber, labels, nextStatus, type Ticket } from '@/lib/types';

const navigation = [
  ['dashboard', 'grid', 'Overview'], ['vehicles', 'car', 'Vehicles'],
  ['employee', 'key', 'Employee station'], ['guest', 'user', 'Guest experience'],
] as const;
type View = typeof navigation[number][0];
function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function ArrivalChart({ tickets }: { tickets: Ticket[] }) {
  const business = useBusiness();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const counts = days.map(d => tickets.filter(t => businessDay(t.created_at, business.timeZone) === businessDay(d, business.timeZone)).length);
  const max = Math.max(4, ...counts);
  return <><div className="chart"><div className="chart-scale"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="chart-bars">{days.map((d, i) => <div className="chart-column" key={i}><div className="bar-track"><div className={`bar ${i === 6 ? 'today' : ''}`} style={{ height: `${counts[i] / max * 100}%` }} title={`${counts[i]} arrivals`}><span>{counts[i] || ''}</span></div></div><small>{d.toLocaleDateString('en-US', { weekday: 'short', timeZone: business.timeZone })}</small></div>)}</div></div><div className="chart-legend"><i />Vehicles checked in</div></>;
}
function VehicleInventory({ tickets, open }: { tickets: Ticket[]; open: (ticket: Ticket) => void }) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const q = search.toLowerCase();
  const filtered = tickets.filter(t => (filter === 'all' || (filter === 'active' ? t.status !== 'completed' : t.status === filter)) && [t.guest, t.plate, t.make, t.model, ticketNumber(t.id)].some(v => v.toLowerCase().includes(q)));
  return <section className="panel"><div className="toolbar"><div className="tabs">{['active', 'all', 'requested', 'completed'].map(f => <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'active' : ''}>{f === 'active' ? 'On site' : f === 'all' ? 'All vehicles' : f === 'requested' ? 'Requested' : 'Completed'}</button>)}</div><label className="search"><Icon name="search" /><input type="search" placeholder="Search guest, vehicle, or plate" aria-label="Search vehicles" value={search} onChange={e => setSearch(e.target.value)} /></label></div><TicketTable tickets={filtered} open={open} /></section>;
}
export default function ValetApp({ worker = false }: { worker?: boolean }) {
  const router = useRouter(), params = useSearchParams();
  const business = useBusiness();
  const guestToken = worker ? '' : params.get('ticket') || '';
  const taskParam = params.get('task');
  const workerTask: WorkerTask = ['checkin', 'retrievals', 'vehicles', 'ready'].includes(taskParam || '') ? taskParam as WorkerTask : 'home';
  const candidate = params.get('view');
  const view: View = guestToken ? 'guest' : navigation.some(([id]) => id === candidate) ? candidate as View : 'dashboard';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const refresh = useCallback(async () => {
    const records = await api<Ticket[]>('list');
    setTickets(records); setLoaded(true); setError('');
  }, []);
  useEffect(() => {
    if (guestToken) return;
    let cancelled = false;
    api<Ticket[]>('list').then(t => { if (!cancelled) { setTickets(t); setLoaded(true); setError(''); } }).catch(e => { if (!cancelled) setError(errorMessage(e)); });
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(e => setError(errorMessage(e))); }, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [guestToken, refresh]);
  useEffect(() => { setSelected(null); }, [view, guestToken, workerTask]);
  const active = tickets.filter(t => t.status !== 'completed');
  const requests = tickets.filter(t => ['requested', 'retrieving', 'ready'].includes(t.status));
  function navigate(view: View) { router.push(`/?view=${view}`); }
  async function advance(ticket: Ticket) {
    const status = nextStatus[ticket.status]; if (!status || pending !== null) return;
    setPending(ticket.id);
    try {
      await api('status', { id: ticket.id, status });
      // Apply the successful mutation immediately, even if a subsequent refresh fails.
      setTickets(current => current.map(t => t.id === ticket.id ? { ...t, status } : t));
      setSelected(null); notify(`Ticket ${ticketNumber(ticket.id)} · ${labels[status]}`);
      await refresh();
    } catch (error) { notify(errorMessage(error)); }
    finally { setPending(null); }
  }
  function saved(ticket: Ticket) {
    setTickets(current => [ticket, ...current]); setSelected(ticket);
    notify(ticket.notification?.status === 'queued' ? 'Vehicle saved. Guest text submitted.' : ['failed', 'unknown'].includes(ticket.notification?.status || '') ? 'Vehicle saved. Check the guest text status in the ticket.' : 'Vehicle saved. Guest ticket is ready.');
    refresh().catch(e => setError(errorMessage(e)));
  }
  async function seedDemo() {
    setSeeding(true);
    try {
      const samples = [
        ['Alex Morgan', 'Mercedes-Benz', 'E-Class', 'Graphite gray', 'DEMO 001', 'A-12', 'K-001', 'Overnight'],
        ['Taylor Brooks', 'Porsche', '911 Carrera', 'White', 'DEMO 002', 'A-08', 'K-002', 'Transient'],
        ['Jordan Lee', 'BMW', 'X5', 'Black', 'DEMO 003', 'B-04', 'K-003', 'Transient'],
        ['Sam Rivera', 'Tesla', 'Model Y', 'Silver', 'DEMO 004', 'B-11', 'K-004', 'Monthly'],
      ];
      const assigned = [...tickets];
      for (const [guest, make, model, color, plate, space, key_tag, type] of samples) {
        const allocation = business.parkingLotsEnabled ? business.parkingLots.flatMap(lot => spotTypes.filter(spot => availableSpots(lot, spot, assigned) > 0).map(spot => ({ lot_id: lot.id, spot_type: spot })))[0] : undefined;
        if (business.parkingLotsEnabled && !allocation) throw new Error('No capacity available for another sample vehicle.');
        assigned.push(await api<Ticket>('create', { guest, phone: '555-0100', make, model, color, plate, space, key_tag, type, ...allocation, attendant: 'Jamie Davis', notes: 'Sample vehicle for testing. No damage noted.' }));
      }
      notify('Four sample vehicles saved. Open a ticket to try the guest workflow.');
    } catch (error) { notify(errorMessage(error)); }
    finally { setSeeding(false); await refresh().catch(e => setError(errorMessage(e))); }
  }
  const toastElement = <div id="toast" role="status" aria-live="polite" className={toast ? 'show' : ''}>{toast}</div>;
  if (guestToken) return <><div className="guest-page"><Link className="brand" href="/">{business.logoUrl ? <img className="business-logo" src={business.logoUrl} alt={business.businessName} /> : <Icon name="car" />}{business.brandName}<span className="brand-dot">.</span></Link><main id="guest-content"><GuestView token={guestToken} notify={notify} /></main><p className="guest-footer">{business.businessName} · Valet service</p></div>{toastElement}</>;
  if (!loaded) return <div className="startup-error"><h1>{error ? 'Unable to load Porter' : `Loading ${business.brandName}…`}</h1>{error && <><p role="alert">{error}</p><button className="button primary" onClick={() => refresh().catch(e => setError(errorMessage(e)))}>Try again</button></>}</div>;
  if (worker) return <><WorkerView task={workerTask} tickets={tickets} open={setSelected} saved={saved} advance={advance} pending={pending} error={error} />{selected && <TicketDialog ticket={tickets.find(t => t.id === selected.id) || selected} close={() => setSelected(null)} advance={advance} pending={pending} notify={notify} />}{toastElement}</>;
  const intakeButton = <button className="button primary" onClick={() => navigate('employee')}><Icon name="plus" />Check in vehicle</button>;
  const today = tickets.filter(t => businessDay(t.created_at, business.timeZone) === businessDay(new Date(), business.timeZone));
  const completed = tickets.filter(t => t.status === 'completed' && t.completed_at && businessDay(t.completed_at, business.timeZone) === businessDay(new Date(), business.timeZone));
  const metrics = [
    ['car', 'Vehicles on site', active.length, 'Currently in your care', 'mint'],
    ['clock', 'Retrieval requests', requests.length, 'Waiting, retrieving, or ready', 'orange'],
    ['exit', 'Check-ins today', today.length, 'Arrivals at this location', 'blue'],
    ['money', 'Completed ticket value', money(completed.reduce((sum, t) => sum + t.rate, 0)), 'Today · payments not connected', 'purple'],
  ] as const;
  return <><aside className="sidebar"><Link className="brand" href="/?view=dashboard"><span className="brand-mark">{business.logoUrl ? <img className="business-logo" src={business.logoUrl} alt={business.businessName} /> : <Icon name="car" />}</span>{business.brandName}<span className="brand-dot">.</span></Link><div className="workspace"><span className="workspace-icon">{business.businessName[0]}</span><div><strong>{business.businessName}</strong><small>Valet operations</small></div></div><p className="nav-label">WORKSPACE</p><nav>{navigation.map(([id, icon, text]) => <button key={id} aria-label={text} onClick={() => navigate(id)} className={`nav-item ${view === id ? 'selected' : ''}`}><Icon name={icon} /><span>{text}</span>{id === 'vehicles' && <b>{active.length}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="demo-note"><span className="live-dot" />Local MVP<small>Staff views are open for testing</small></div><div className="profile"><span className="avatar">JD</span><div><strong>Jamie Davis</strong><small>Operations manager</small></div></div></div></aside>
    <div className="main"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{navigation.find(([id]) => id === view)?.[2]}</strong></div><div className="topbar-right"><span className="live"><i />Local data</span><span className="topbar-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: business.timeZone })}</span><span className="avatar small">JD</span></div></header>
    <main id="main-content">{error && <p className="form-error" role="alert">Unable to refresh data: {error}. Retrying shortly.</p>}
      {view === 'dashboard' && <>
        <Heading eyebrow="YOUR OPERATIONS, AT A GLANCE" title="A smooth arrival. Every time." description="Manage your vehicles, team, and guest experience in one place." action={intakeButton} />
        <div className="metrics">{metrics.map(([i, label, value, sub, color]) => <article className="metric" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon name={i} /></span></div><strong>{value}</strong><small>{sub}</small></article>)}</div>
        <div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Arrival activity</h2><p>A clear view of your week</p></div><span className="period">Last 7 days</span></div><ArrivalChart tickets={tickets} /></section>
          <section className="panel retrieval-panel"><div className="panel-heading"><div><h2>Retrieval queue <span className="count">{requests.length}</span></h2><p>Keep your guests moving</p></div><span className="live-dot" /></div><div className="queue-list">{requests.length ? requests.slice(0, 3).map(t => <button className="queue-item" key={t.id} onClick={() => setSelected(t)}><span className="car-icon"><Icon name="car" /></span><span><strong>{t.make} {t.model}</strong><small>{ticketNumber(t.id)} · {t.guest}</small></span><Badge status={t.status} /></button>) : <div className="queue-empty"><Icon name="check" /><strong>All caught up</strong><p>Guest requests will appear here.</p></div>}</div><button className="text-button full" onClick={() => navigate('employee')}>Open employee station <Icon name="arrow" /></button></section>
        </div><section className="panel vehicle-panel"><div className="panel-heading"><div><h2>Recent vehicles</h2><p>Every ticket, from arrival to pickup</p></div><button className="text-button" onClick={() => navigate('vehicles')}>View all vehicles <Icon name="arrow" /></button></div><TicketTable tickets={tickets.slice(0, 5)} open={setSelected} /></section>
        <div className="help-strip"><span><Icon name="key" /><strong>Ready for your next arrival?</strong> Check in a car to create its digital guest ticket.</span>{tickets.length === 0 ? <button className="text-button" disabled={seeding} onClick={seedDemo}>{seeding ? 'Saving samples…' : 'Try sample vehicles →'}</button> : <span className="muted">Records are saved on this computer</span>}</div>
      </>}
      {view === 'vehicles' && <><Heading eyebrow="VEHICLE MANAGEMENT" title="Every vehicle. Accounted for." description="Find tickets, track keys, and follow each vehicle through pickup." action={intakeButton} /><ParkingAvailability tickets={tickets} /><VehicleInventory tickets={tickets} open={setSelected} /></>}
      {view === 'employee' && <><Heading eyebrow="EMPLOYEE STATION" title="Great service starts here." description="Check in a vehicle, record its condition, and manage guest requests." action={<Link className="button secondary" href="/worker"><Icon name="grid" />Open worker view</Link>} /><EmployeeStation requests={requests} vehicles={tickets} saved={saved} advance={advance} pending={pending} /></>}
      {view === 'guest' && <><Heading eyebrow="GUEST EXPERIENCE" title="Your car, a tap away." description="Preview the guest experience using a private link from a saved ticket." /><div id="guest-content"><GuestView token="" notify={notify} /></div></>}
    </main><footer>{business.brandName} valet operations <span>{business.businessName} · Local prototype</span></footer></div>
    {selected && <TicketDialog ticket={tickets.find(t => t.id === selected.id) || selected} close={() => setSelected(null)} advance={advance} pending={pending} notify={notify} />}{toastElement}
  </>;
}
