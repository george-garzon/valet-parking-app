import StaffGate from '@/components/staff-gate';
import { Suspense } from 'react';
import ValetApp from '@/components/valet-app';

export default function Page() {
  return <Suspense fallback={<div className="startup-error">Loading valet operations…</div>}><StaffGate><ValetApp /></StaffGate></Suspense>;
}
