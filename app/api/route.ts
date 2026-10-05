import { NextRequest, NextResponse } from 'next/server';
import { ApiError, listTickets, guestTicket, createTicket, requestVehicle, changeStatus, getWelcomeMessage } from '@/lib/db';
import { checkout, confirmPayment } from '@/lib/payments';
import { sendWelcomeMessage } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: 'Unable to save or load tickets. Please try again.' }, 500);
}
export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action') || 'list';
    if (action === 'list') return json(listTickets());
    if (action === 'guest') return json(guestTicket(request.nextUrl.searchParams.get('token') || ''));
    if (action === 'message') {
      const id = Number(request.nextUrl.searchParams.get('id'));
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: 'Invalid ticket ID' }, 422);
      return json(getWelcomeMessage(id) || null);
    }
    return json({ error: 'Unknown action' }, 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      input = parsed as Record<string, unknown>;
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    const action = request.nextUrl.searchParams.get('action');
    if (action === 'create') {
      const ticket = createTicket(input, request.nextUrl.origin);
      // Saving the car and its outbox entry is atomic. Provider failures never erase the car.
      const notification = await sendWelcomeMessage(ticket.id);
      return json({ ...ticket, notification }, 201);
    }
    if (action === 'retry-message') {
      if (typeof input.id !== 'number' || !Number.isSafeInteger(input.id) || input.id < 1) return json({ error: 'Invalid ticket ID' }, 422);
      return json(await sendWelcomeMessage(input.id, true));
    }
    if (action === 'checkout') return json(await checkout(input.token, input.tip));
    if (action === 'confirm-payment') return json(await confirmPayment(input.session, input.token));
    if (action === 'request') return json(requestVehicle(input.token));
    if (action === 'status') return json(changeStatus(input.id, input.status));
    return json({ error: 'Unknown action' }, 404);
  } catch (error) { return failure(error); }
}
