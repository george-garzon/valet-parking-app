import { requireStaff } from '@/lib/staff-auth';
import { ApiError, getTicket } from '@/lib/db';
import { getBusinessConfig } from '@/lib/config';
import { printedTicketDocument } from '@/lib/printed-ticket';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    requireStaff(request);
    const url = new URL(request.url), rawId = url.searchParams.get('id');
    let ticket = null;
    let count = 1;
    if (rawId !== null) {
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('Invalid ticket ID.', 422);
      ticket = getTicket(id) ?? null;
      if (!ticket) throw new ApiError('Ticket not found.', 404);
    } else {
      if (url.searchParams.get('blank') !== 'true') throw new ApiError('Choose a ticket or blank fallback batch.', 422);
      count = Number(url.searchParams.get('count') ?? 5);
      if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new ApiError('Choose 1–20 fallback tickets.', 422);
    }
    const html = await printedTicketDocument(getBusinessConfig(), ticket, url.origin, count);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    return Response.json({ error: error instanceof ApiError ? error.message : 'Unable to prepare printable tickets.' }, { status: error instanceof ApiError ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
