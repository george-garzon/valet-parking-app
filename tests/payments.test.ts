import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { getBusinessConfig } from '../lib/config';
import { validateTip, checkout, confirmPayment } from '../lib/payments';
import { createTicket, guestTicket, requestVehicle, reservePayment, attachPaymentSession, settlePayment, paymentRecord } from '../lib/db';

let storage: string;
const original = { ...process.env };
beforeEach(() => {
  storage = mkdtempSync(join(tmpdir(), 'porter-payments-'));
  Object.assign(process.env, { VALET_STORAGE: storage, BUSINESS_ID: 'payment-test', GUEST_PAYMENTS_ENABLED: 'true', GUEST_PAYMENT_REQUIRED: 'true', GUEST_TIPS_ENABLED: 'true', RATE_TRANSIENT_CENTS: '2500', SMS_PROVIDER: 'disabled' });
});
afterEach(() => { process.env = { ...original }; rmSync(storage, { recursive: true, force: true }); });
const input = { guest: 'Test Guest', phone: '2025550123', make: 'Honda', model: 'Civic', color: 'Black', plate: 'PAYTEST', space: '1', key_tag: '1', type: 'Transient', notes: '', attendant: 'Jamie' };
test('hosted checkout uses saved cents and confirms only paid, matching, ticket-bound sessions', async () => {
  process.env.PUBLIC_APP_URL = 'https://valet.example.com';
  const t = createTicket(input, 'http://localhost');
  let session: Record<string, unknown> = {};
  let creates = 0;
  const client = { checkout: { sessions: {
    create: async (params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }) => {
      creates++;
      assert.equal(params.line_items?.[0].price_data?.unit_amount, 2500);
      assert.equal(params.line_items?.[1].price_data?.unit_amount, 500);
      assert.ok(params.success_url?.includes('{CHECKOUT_SESSION_ID}'));
      assert.ok(options.idempotencyKey.startsWith('valet-payment-test-'));
      session = { id: 'cs_test_checkout', metadata: params.metadata, currency: 'usd', amount_total: 3000, status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/test' };
      return session;
    }, retrieve: async () => session,
  } } } as unknown as Stripe;
  assert.deepEqual(await checkout(t.token, 500, client), { url: 'https://checkout.stripe.com/test' });
  await checkout(t.token, 900, client);
  assert.equal(creates, 1);
  assert.deepEqual(await confirmPayment('cs_test_checkout', t.token, client), { paid: false });
  assert.equal(guestTicket(t.token).status, 'parked');
  const other = createTicket({ ...input, plate: 'OTHER' }, 'http://localhost');
  await assert.rejects(confirmPayment('cs_test_checkout', other.token, client), /not found/);
  session.payment_status = 'paid'; session.amount_total = 1;
  await assert.rejects(confirmPayment('cs_test_checkout', t.token, client), /does not match/);
  session.amount_total = 3000;
  assert.deepEqual(await confirmPayment('cs_test_checkout', t.token, client), { paid: true });
  assert.equal(guestTicket(t.token).status, 'requested');
});
test('payment requirements cannot be bypassed; verified settlement requests once and retains the tip', () => {
  const t = createTicket(input, 'http://localhost');
  assert.throws(() => requestVehicle(t.token), /pay the parking fee/);
  const record = reservePayment(guestTicket(t.token), 500);
  assert.equal(reservePayment(guestTicket(t.token), 900).attempt, record.attempt);
  assert.equal(paymentRecord(t.id)?.tip, 500);
  attachPaymentSession(t.id, record.attempt, 'cs_test_verified');
  assert.throws(() => settlePayment('cs_test_verified', 1), /does not match/);
  assert.equal(guestTicket(t.token).status, 'parked');
  settlePayment('cs_test_verified', 3000);
  const requested = guestTicket(t.token);
  assert.equal(requested.status, 'requested');
  assert.deepEqual(requested.payment, { paid: true, total: 3000, tip: 500 });
  settlePayment('cs_test_verified', 3000);
  assert.equal(guestTicket(t.token).requested_at, requested.requested_at);
});
test('tip validation, feature flags, and disabled checkout are enforced on the server', async () => {
  for (const tip of [-1, 0.1, 100001, '500', NaN]) assert.throws(() => validateTip(tip, true));
  assert.throws(() => validateTip(500, false));
  assert.equal(validateTip(0, false), 0);
  process.env.GUEST_PAYMENTS_ENABLED = 'false';
  process.env.GUEST_PAYMENT_REQUIRED = 'false';
  await assert.rejects(checkout('test', 0), /disabled/);
  process.env.GUEST_PAYMENT_REQUIRED = 'true';
  assert.throws(getBusinessConfig, /Required payment/);
});
test('Stripe signed webhook verification rejects tampering', () => {
  const stripe = new Stripe('sk_test_placeholder');
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: { id: 'cs_test_verified' } } });
  const secret = 'whsec_test_secret';
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).type, 'checkout.session.completed');
  assert.throws(() => stripe.webhooks.constructEvent(payload.replace('verified', 'tampered'), header, secret));
});
