import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
