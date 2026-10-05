'use client';

import { createContext, useContext } from 'react';
import type { BusinessConfig } from '@/lib/types';

const BusinessContext = createContext<BusinessConfig | null>(null);
export function BusinessProvider({ config, children }: { config: BusinessConfig; children: React.ReactNode }) {
  return <BusinessContext.Provider value={config}>{children}</BusinessContext.Provider>;
}
export function useBusiness() {
  const config = useContext(BusinessContext);
  if (!config) throw new Error('Business configuration is missing.');
  return config;
}
