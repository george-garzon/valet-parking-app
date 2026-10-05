import 'server-only';
import Stripe from 'stripe';
import { getBusinessConfig } from './config';
import { ApiError, guestTicket, paymentRecord, reservePayment, attachPaymentSession, expirePaymentSession, settlePayment } from './db';
import { ticketNumber } from './types';

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new ApiError('Online payment is unavailable. Please contact the valet.', 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
}
export function validateTip(value: unknown, enabled: boolean) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000 || (!enabled && value !== 0)) throw new ApiError('Enter a valid tip between $0 and $1,000.', 422);
  return value;
}
export async function checkout(token: unknown, tipInput: unknown, client?: Stripe) {
  const config = getBusinessConfig();
  if (!config.paymentsEnabled) throw new ApiError('Online payments are disabled.', 403);
  if (typeof token !== 'string') throw new ApiError('Invalid ticket.', 422);
  const ticket = guestTicket(token);
  if (ticket.status !== 'parked') throw new ApiError('This vehicle has already been requested.', 409);
  const tip = validateTip(tipInput, config.tipsEnabled);
  if (ticket.rate + tip < 50) throw new ApiError('Online payment requires a total of at least $0.50.', 422);
  if (!config.publicUrl || !config.publicUrl.startsWith('https://')) throw new ApiError('Online payment needs a public HTTPS app URL.', 503);
  const stripe = client ?? stripeClient();
  if (!client && !process.env.STRIPE_WEBHOOK_SECRET) throw new ApiError('Online payment is unavailable. Please contact the valet.', 503);
  let existing = paymentRecord(ticket.id);
  if (existing?.paid) throw new ApiError('This ticket is already paid.', 409);
  if (existing?.session_id) {
    const session = await stripe.checkout.sessions.retrieve(existing.session_id);
    if (session.status === 'expired') { expirePaymentSession(ticket.id, session.id); existing = undefined; }
    else if (session.payment_status === 'paid') { settlePayment(session.id, session.amount_total!); return { paid: true }; }
    else if (session.url) return { url: session.url };
    else throw new ApiError('Payment is processing. Please refresh shortly.', 409);
  }
  const record = reservePayment(ticket, tip);
  const link = `${config.publicUrl}/?ticket=${token}`;
  const item = (name: string, amount: number) => ({ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, product_data: { name } } });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', allowed_payment_method_types: ['card'],
    line_items: [...(ticket.rate > 0 ? [item(`${config.businessName} · ${ticketNumber(ticket.id)} parking`, ticket.rate)] : []), ...(record.tip > 0 ? [item('Valet gratuity', record.tip)] : [])],
    success_url: `${link}&payment_session={CHECKOUT_SESSION_ID}`, cancel_url: `${link}&payment_cancelled=1`,
    metadata: { business_id: config.id, ticket_id: String(ticket.id), attempt: record.attempt },
    expires_at: record.created + 86400,
  }, { idempotencyKey: `valet-${config.id}-${record.attempt}` });
  attachPaymentSession(ticket.id, record.attempt, session.id);
  return { url: session.url };
}
export async function confirmPayment(sessionId: unknown, token?: unknown, client?: Stripe) {
  if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) throw new ApiError('Invalid payment session.', 422);
  const session = await (client ?? stripeClient()).checkout.sessions.retrieve(sessionId);
  const config = getBusinessConfig();
  if (session.metadata?.business_id !== config.id) throw new ApiError('Payment not found.', 404);
  const id = Number(session.metadata.ticket_id);
  if (token !== undefined && (typeof token !== 'string' || guestTicket(token).id !== id)) throw new ApiError('Payment not found.', 404);
  const record = paymentRecord(id);
  if (!record || record.attempt !== session.metadata.attempt) throw new ApiError('Payment not found.', 404);
  // A webhook can arrive before the create-session response is saved.
  attachPaymentSession(id, record.attempt, session.id);
  if (session.payment_status !== 'paid') return { paid: false };
  if (session.currency !== 'usd' || session.amount_total !== record.total) throw new ApiError('Payment amount does not match.', 409);
  settlePayment(session.id, session.amount_total);
  return { paid: true };
}
