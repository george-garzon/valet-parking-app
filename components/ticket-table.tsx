import Icon from './icon';
import { labels, ticketNumber, type Status, type Ticket } from '@/lib/types';
import { useBusiness } from './business-provider';

export function Badge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}><i />{labels[status]}</span>;
}

export default function TicketTable({ tickets, open }: { tickets: Ticket[]; open: (ticket: Ticket) => void }) {
  const business = useBusiness();
  return <div className="table-wrap"><table><thead><tr>
    {['Vehicle / ticket', 'Guest', 'License plate', 'Location', 'Status', 'Arrival', ''].map((label, i) => <th key={i}>{label}</th>)}
  </tr></thead><tbody>{tickets.length ? tickets.map(t => <tr key={t.id}>
    <td><div className="vehicle-cell"><span className="car-icon"><Icon name="car" /></span><div><strong>{t.make} {t.model}</strong><small>{ticketNumber(t.id)} · {t.color}</small></div></div></td>
    <td>{t.guest}<small>{t.type}</small></td><td><span className="plate">{t.plate}</span></td>
    <td>{t.space}<small>Key {t.key_tag}</small></td><td><Badge status={t.status} /></td>
    <td>{new Date(t.created_at).toLocaleTimeString('en-US', { timeZone: business.timeZone, hour: 'numeric', minute: '2-digit' })}<small>{new Date(t.created_at).toLocaleDateString('en-US', { timeZone: business.timeZone, month: 'short', day: 'numeric' })}</small></td>
    <td><button className="icon-button" aria-label={`Open ticket ${ticketNumber(t.id)}`} onClick={() => open(t)}><Icon name="arrow" /></button></td>
  </tr>) : <tr><td colSpan={7}><div className="empty-state">No vehicles to show. Check in your first vehicle at the employee station.</div></td></tr>}</tbody></table></div>;
}
