'use client';
import { useBusiness } from './business-provider';
import type { Ticket } from '@/lib/types';
import { ticketNumber } from '@/lib/types';
export default function ParkingMap({ tickets, open }: { tickets: Ticket[]; open: (ticket: Ticket) => void }) {
  const business = useBusiness();
  if (!business.parkingMapEnabled) return null;
  const occupants = (space: string) => tickets.filter(t => ['parked', 'requested', 'retrieving'].includes(t.status) && t.space.trim().toUpperCase() === space);
  const spaces = business.parkingRows.flat(), occupied = spaces.filter(space => occupants(space).length).length;
  const unassigned = tickets.filter(t => ['parked', 'requested', 'retrieving'].includes(t.status) && !spaces.includes(t.space.trim().toUpperCase()));
  return <section className="panel parking-map"><div className="panel-heading"><div><h2>Parking map</h2><p>{spaces.length - occupied} available · {occupied} occupied</p></div></div><div className="parking-legend"><span>🟢 Available</span><span>🔴 Occupied</span></div><div className="parking-map-rows">{business.parkingRows.map((row, index) => <div className="parking-map-row" key={index} aria-label={`Parking row ${index + 1}`}>{row.map(space => {
    const cars = occupants(space), car = cars[0];
    return <button type="button" key={space} className={`parking-space ${car ? 'occupied' : 'available'}`} disabled={!car} onClick={() => car && open(car)} aria-label={`${space}: ${car ? `Occupied by ${car.plate}${cars.length > 1 ? `, ${cars.length} tickets assigned` : ''}` : 'Available'}`}><strong>{space}</strong><small>{car ? 'Occupied' : 'Available'}</small>{car && <span>{car.plate}<br />{ticketNumber(car.id)}{cars.length > 1 && ` · ${cars.length} tickets`}</span>}</button>;
  })}</div>)}</div>{unassigned.length > 0 && <p className="form-error">{unassigned.length} active vehicle(s) use spaces outside this map. Their spaces are not counted above.</p>}<p className="parking-map-note">Spaces free up when vehicles are marked ready for pickup. Select an occupied space to open its ticket.</p></section>;
}
