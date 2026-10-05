import { ApiError } from '@/lib/db';
import { staffInput, requireStaff, listStaff, createStaff, updateStaff } from '@/lib/staff-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown) { if (!(error instanceof ApiError)) console.error(error); return json({error:error instanceof ApiError ? error.message : 'Unable to manage employees.'},error instanceof ApiError ? error.status : 400); }
export async function GET(request:Request) { try { return json(listStaff(requireStaff(request,['admin','manager']))); } catch(error) { return failure(error); } }
export async function POST(request:Request) {
  try {
    requireStaff(request,['admin','manager']); const input=await staffInput(request);
    const actor=requireStaff(request,['admin','manager']);
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new ApiError('Invalid employee details.',422);
    return input.action==='create' ? json(createStaff(actor,input),201) : json(updateStaff(actor,input));
  } catch(error) { return failure(error); }
}
