import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/db';
import { getBusinessConfig } from '@/lib/config';
import { staffInput, loginStaff, logoutStaff, requireSameOrigin, requestToken, staffSession, SESSION_COOKIE, SESSION_SECONDS } from '@/lib/staff-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request: Request) { return json({ user:staffSession(requestToken(request)) }); }
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = await staffInput(request);
    const secure = new URL(request.url).protocol === 'https:' || getBusinessConfig().publicUrl.startsWith('https:');
    if (input.action === 'logout') {
      logoutStaff(requestToken(request));
      const response=json({success:true}); response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:0}); return response;
    }
    if (input.action !== 'login') throw new ApiError('Unknown sign-in action.',422);
    const { user,token }=loginStaff(input.username,input.pin);
    const response=json({user}); response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:SESSION_SECONDS}); return response;
  } catch(error) { if (!(error instanceof ApiError)) console.error(error); return json({error:error instanceof ApiError ? error.message : 'Unable to sign in.'},error instanceof ApiError ? error.status : 400); }
}
