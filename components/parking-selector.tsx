'use client';
import { useState } from 'react';
import { useBusiness } from './business-provider';
import { availableSpots, spotTypes, spotLabels, type Ticket } from '@/lib/types';
export default function ParkingSelector({ tickets }: { tickets: Ticket[] }) {
  const { parkingLots } = useBusiness();
  const [lotId, setLotId] = useState('');
  const [type, setType] = useState('');
  const lot = parkingLots.find(lot => lot.id === lotId);
  return <><label className="field">Lot or garage<select name="lot_id" required value={lotId} onChange={event => { setLotId(event.target.value); setType(''); }}><option value="" disabled>Choose a lot or garage</option>{parkingLots.map(lot => {
    const available = spotTypes.reduce((sum, type) => sum + availableSpots(lot, type, tickets), 0);
    return <option key={lot.id} value={lot.id} disabled={available === 0}>{lot.name} · {available} available</option>;
  })}</select></label><label className="field">Spot type<select name="spot_type" required disabled={!lot} value={type} onChange={event => setType(event.target.value)}><option value="" disabled>Choose a spot type</option>{lot && spotTypes.map(type => { const available = availableSpots(lot, type, tickets); return <option key={type} value={type} disabled={available === 0}>{spotLabels[type]} · {available} available</option>; })}</select></label><label className="field">Space / level reference <span className="field-optional">(optional)</span><input name="space" maxLength={120} placeholder="e.g. Level 2, space 14" /></label></>;
}
