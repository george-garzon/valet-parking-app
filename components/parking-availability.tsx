'use client';
import { useBusiness } from './business-provider';
import { availableSpots, occupiesParking, spotTypes, spotLabels, type Ticket } from '@/lib/types';
export default function ParkingAvailability({ tickets }: { tickets: Ticket[] }) {
  const business = useBusiness();
  if (!business.parkingLotsEnabled) return null;
  const unmapped = tickets.filter(t => occupiesParking(t) && !business.parkingLots.some(lot => lot.id === t.lot_id && spotTypes.includes(t.spot_type as typeof spotTypes[number])));
  return <section className="panel parking-availability"><div className="panel-heading"><div><h2>Parking availability</h2><p>Available spots by lot and vehicle size</p></div></div><div className="parking-lots">{business.parkingLots.map(lot => {
    const total = spotTypes.reduce((sum, type) => sum + lot[type], 0), available = spotTypes.reduce((sum, type) => sum + availableSpots(lot, type, tickets), 0);
    return <article className="parking-lot" key={lot.id}><div className="parking-lot-heading"><h3>{lot.name}</h3><strong className={available ? 'spots-available' : 'spots-full'}>{available} / {total} available</strong></div><dl>{spotTypes.map(type => {
      const remaining = availableSpots(lot, type, tickets), used = tickets.filter(t => occupiesParking(t) && t.lot_id === lot.id && t.spot_type === type).length;
      return <div key={type}><dt>{spotLabels[type]}</dt><dd className={remaining ? 'spots-available' : 'spots-full'}>{remaining} / {lot[type]} available{used > lot[type] && <small>Over capacity by {used - lot[type]}</small>}</dd></div>;
    })}</dl></article>;
  })}</div>{unmapped.length > 0 && <p className="form-error">{unmapped.length} active vehicle(s) have no configured lot assignment and are excluded from these counts.</p>}<p className="parking-map-note">Spots free up when vehicles are marked ready for pickup.</p></section>;
}
