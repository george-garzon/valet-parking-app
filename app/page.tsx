import { Suspense } from 'react';
import ValetApp from '@/components/valet-app';

export default function Page() {
  return <Suspense fallback={<div className="startup-error">Loading valet operations…</div>}><ValetApp /></Suspense>;
}
