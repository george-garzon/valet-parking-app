import type { Metadata } from 'next';
import './globals.css';
import { getBusinessConfig } from '@/lib/config';
import { BusinessProvider } from '@/components/business-provider';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';
export function generateMetadata(): Metadata {
  const config = getBusinessConfig();
  return { title: `${config.brandName} · ${config.businessName}`, description: `Valet check-in and guest tickets for ${config.businessName}.` };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = getBusinessConfig();
  return <html lang="en"><body style={{ '--green': config.primaryColor } as CSSProperties}><BusinessProvider config={config}>{children}</BusinessProvider></body></html>;
}
