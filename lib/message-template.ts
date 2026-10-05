import type { BusinessConfig, Ticket } from './types';
import { ticketNumber } from './types';

export const DEFAULT_SMS_TEMPLATE = '{brand} - {business}\n\nWelcome to {business}! Your ticket # is {ticket_number}.\n\nTo request your vehicle:\n{ticket_url}\n\nThank you for visiting {business}. If you are unable to request your vehicle, please proceed to {pickup_location}.';
export function renderGuestMessage(ticket: Ticket, config: BusinessConfig, origin: string, template = DEFAULT_SMS_TEMPLATE) {
  const values: Record<string, string> = {
    brand: config.brandName, business: config.businessName, guest: ticket.guest,
    ticket_number: ticketNumber(ticket.id), ticket_url: `${config.publicUrl || origin}/?ticket=${ticket.token}`,
    pickup_location: config.pickupLocation,
  };
  const body = template.replace(/\\n/g, '\n').replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown SMS template placeholder: ${key}`);
    return values[key];
  });
  if (!template.includes('{ticket_url}')) throw new Error('SMS_TEMPLATE must include {ticket_url}.');
  if (body.length > 1600) throw new Error('Guest message exceeds 1600 characters. Shorten SMS_TEMPLATE.');
  return body;
}
