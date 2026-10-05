import { NextRequest, NextResponse } from 'next/server';
import { stripeClient, confirmPayment } from '@/lib/payments';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  let event;
  try { event = stripeClient().webhooks.constructEvent(await request.text(), request.headers.get('stripe-signature') || '', secret); }
  catch { return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 }); }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await confirmPayment(event.data.object.id);
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: 'Payment could not be recorded. Retry delivery.' }, { status: 500 }); }
}
