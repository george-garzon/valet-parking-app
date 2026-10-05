import { requireStaff } from '@/lib/staff-auth';
import { ApiError, getTicket, photoMetadata, readPhoto, savePhoto, type PhotoKind } from '@/lib/db';
import { getBusinessConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function failure(error: unknown) {
  if (!(error instanceof ApiError)) console.error(error);
  return Response.json({ error: error instanceof ApiError ? error.message : 'Unable to load or save photos.' }, { status: error instanceof ApiError ? error.status : 500, headers });
}
function ticketId(url: URL) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('Invalid ticket ID.', 422);
  if (!getBusinessConfig().vehiclePhotosEnabled) throw new ApiError('Vehicle photos are disabled.', 403);
  if (!getTicket(id)) throw new ApiError('Ticket not found.', 404);
  return id;
}
export async function GET(request: Request) {
  try {
    requireStaff(request);
    const url = new URL(request.url), id = ticketId(url), kind = url.searchParams.get('kind');
    if (!kind) return Response.json(photoMetadata(id), { headers });
    if (!['vehicle', 'plate'].includes(kind)) throw new ApiError('Invalid photo kind.', 422);
    const photo = readPhoto(id, kind as PhotoKind);
    if (!photo) throw new ApiError('Photo not found.', 404);
    return new Response(new Uint8Array(photo.data), { headers: { ...headers, 'Content-Type': photo.mime } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireStaff(request);
    const url = new URL(request.url), id = ticketId(url);
    // Bound the whole multipart request before parsing it, including chunked bodies.
    const limit = 6 * 1024 * 1024;
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError('Choose a photo.', 422);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ApiError('Photo upload is too large.', 413); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Request(request.url, { method: 'POST', headers: request.headers, body }).formData();
    const file = form.get('photo'), kind = form.get('kind');
    if (!(file instanceof File) || (kind !== 'vehicle' && kind !== 'plate')) throw new ApiError('Choose a vehicle or plate photo.', 422);
    const data = Buffer.from(await file.arrayBuffer());
    requireStaff(request);
    savePhoto(id, kind, data, file.type);
    return Response.json(photoMetadata(id), { headers });
  } catch (error) { return failure(error); }
}
