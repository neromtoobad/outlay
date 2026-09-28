import type { NextConfig } from 'next';

// The Hono API (server/) owns quotes, orders, SSE and the books. Next proxies /api to it.
const API = process.env.OUTLAY_API_URL ?? 'http://localhost:8790';

const config: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compress: false, // keep Server-Sent Events from being buffered through the proxy
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};
export default config;
