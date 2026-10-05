import { Suspense } from 'react';
import type { Metadata } from 'next';
import ValetApp from '@/components/valet-app';
import { getBusinessConfig } from '@/lib/config';

export function generateMetadata(): Metadata { return { title: `Worker station · ${getBusinessConfig().businessName}` }; }

export default function WorkerPage() {
  return <Suspense fallback={<div className="startup-error">Loading your station…</div>}><ValetApp worker /></Suspense>;
}
