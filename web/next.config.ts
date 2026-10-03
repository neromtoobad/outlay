import type { NextConfig } from 'next';

// The Hono API (server/) owns quotes, orders, SSE and the books. Next proxies /api to it.
const API = process.env.OUTLAY_API_URL ?? 'http://localhost:8790';

const config: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compress: false, // keep Server-Sent Events from being buffered through the proxy
  images: { unoptimized: true },
  // The office art and sprites change rarely: browsers keep them a day and refresh them in the background after that.
  async headers() {
    const keep = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    return [{ source: '/sprites/:path*', headers: keep }, { source: '/scene/:path*', headers: keep }];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      // Sites the team builds for customers, served by the API from the books volume.
      { source: '/s/:slug', destination: `${API}/s/:slug/` },
      { source: '/s/:slug/:file*', destination: `${API}/s/:slug/:file*` },
    ];
  },
};
export default config;
