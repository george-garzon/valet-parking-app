'use client';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { StaffUser } from '@/lib/types';
import { useBusiness } from './business-provider';

const StaffContext=createContext<StaffUser | null>(null);
export const useStaff=()=>useContext(StaffContext);
export default function StaffGate({ children }: { children:ReactNode }) {
  const params=useSearchParams();
  const path=usePathname();
  const guest=Boolean(params.get('ticket')) && path==='/';
  const business=useBusiness();
  const authRevision=useRef(0);
  const [user,setUser]=useState<StaffUser | null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if (guest) return;
    let cancelled=false;
    async function check() {
      const revision=authRevision.current;
      try { const response=await fetch('/api/auth',{cache:'no-store'}); if (!response.ok) throw new Error('Unable to check sign-in.'); const data=await response.json(); if (!cancelled && revision===authRevision.current) { setUser(data.user);setError(''); } }
      catch { if (!cancelled && revision===authRevision.current) {setUser(null);setError('Unable to reach the server. Reconnect to sign in.');} }
      finally { if (!cancelled && revision===authRevision.current) setLoading(false); }
    }
    void check(); const interval=setInterval(()=>{if (!document.hidden) void check();},30000);
    window.addEventListener('focus',check);
    return ()=>{cancelled=true;clearInterval(interval);window.removeEventListener('focus',check);};
  },[guest]);
  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();authRevision.current++;setBusy(true);setError('');
    const form=event.currentTarget, data=new FormData(form);
    try {const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',username:data.get('username'),pin:data.get('pin')})});const result=await response.json();if(!response.ok)throw new Error(result.error);form.reset();setUser(result.user);}
    catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');}
    finally{setBusy(false);}
  }
  async function signOut() {
    setBusy(true);setError('');
    try { const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(!response.ok)throw new Error('Unable to sign out. Reconnect and try again.');authRevision.current++;setUser(null); }
    catch(e){setError(e instanceof Error?e.message:'Unable to sign out.');}
    finally{setBusy(false);}
  }
  if(guest)return <StaffContext.Provider value={null}>{children}</StaffContext.Provider>;
  if(loading)return <div className="startup-error">Checking staff sign-in…</div>;
  if(!user)return <main className="staff-login"><section className="panel"><div className="eyebrow">{business.businessName}</div><h1>Staff sign-in</h1><p>Use your employee ID and private PIN.</p><form onSubmit={signIn}><label className="field">Employee ID<input name="username" required autoComplete="username" maxLength={40} autoCapitalize="none" /></label><label className="field">PIN<input name="pin" required type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" /></label><button className="button primary full" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<p className="form-error" role="alert">{error}</p>}</form><p className="staff-login-help">Need access or a PIN reset? Ask your manager. First-time setup requires the local administrator command described in README.</p></section></main>;
  return <StaffContext.Provider value={user}><div className="staff-session-bar"><span>{user.name} · {user.role}</span>{user.role!=='attendant'&&<Link href="/employees">Employees</Link>}<button type="button" disabled={busy} onClick={signOut}>Lock / sign out</button>{error&&<span role="alert">{error}</span>}</div>{children}</StaffContext.Provider>;
}
