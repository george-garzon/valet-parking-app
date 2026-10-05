export type StaffRole = 'admin' | 'manager' | 'attendant';
export type StaffUser = { id: number; username: string; name: string; role: StaffRole; active: boolean };
export type Status = 'parked' | 'requested' | 'retrieving' | 'ready' | 'completed';
export type SpotType = 'compact' | 'large' | 'handicap';
export type ParkingLot = { id: string; name: string; compact: number; large: number; handicap: number };
export const spotTypes: SpotType[] = ['compact', 'large', 'handicap'];
export const spotLabels: Record<SpotType, string> = { compact: 'Compact', large: 'Large', handicap: 'Handicap' };
export const occupiesParking = (ticket: { status: Status }) => ['parked', 'requested', 'retrieving'].includes(ticket.status);
export function availableSpots(lot: ParkingLot, type: SpotType, tickets: Ticket[]) { return Math.max(0, lot[type] - tickets.filter(t => occupiesParking(t) && t.lot_id === lot.id && t.spot_type === type).length); }

export type ParkingType = 'Transient' | 'Overnight' | 'Monthly';
export type BusinessConfig = {
  id: string; businessName: string; businessType: 'hotel' | 'business'; brandName: string; logoUrl: string;
  primaryColor: string; timeZone: string; publicUrl: string; pickupLocation: string;
  vehiclePhotosEnabled: boolean; parkingLotsEnabled: boolean; parkingLots: ParkingLot[];
  paymentsEnabled: boolean; paymentRequired: boolean; tipsEnabled: boolean; tipPresets: number[];
  rates: Record<ParkingType, number>; smsProvider: 'preview' | 'disabled' | 'twilio'; phoneCountry: string;
};
export type GuestMessage = {
  ticket_id: number; body: string; media_url: string; to_phone: string;
  status: 'preview' | 'skipped' | 'pending' | 'sending' | 'queued' | 'failed' | 'unknown';
  provider_sid: string | null; error: string | null; consent_at: string | null;
};
export type VehicleInput = {
  guest: string; phone: string; make: string; model: string; color: string;
  plate: string; space: string; key_tag: string; type: ParkingType;
  notes: string; attendant: string;
  room_number?: string; lot_id?: string; spot_type?: SpotType | '';
};
export type Ticket = VehicleInput & {
  id: number; token: string; status: Status; rate: number;
  created_at: string; requested_at: string | null; completed_at: string | null;
  payment?: { paid: boolean; tip: number; total: number };
  notification?: GuestMessage;
};
export type GuestTicket = Pick<Ticket, 'id' | 'token' | 'guest' | 'make' | 'model' | 'color' | 'plate' | 'type' | 'status' | 'rate' | 'created_at' | 'requested_at' | 'room_number' | 'payment'>;

export const labels: Record<Status, string> = {
  parked: 'Parked', requested: 'Requested', retrieving: 'Retrieving',
  ready: 'Ready for pickup', completed: 'Completed',
};
export const nextStatus: Partial<Record<Status, Status>> = {
  parked: 'requested', requested: 'retrieving', retrieving: 'ready', ready: 'completed',
};
export const actionLabels: Partial<Record<Status, string>> = {
  parked: 'Request vehicle', requested: 'Start retrieval', retrieving: 'Mark ready for pickup', ready: 'Complete handoff',
};
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
export const ticketNumber = (id: number) => `VP-${String(id).padStart(4, '0')}`;
export const businessDay = (date: string | Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
