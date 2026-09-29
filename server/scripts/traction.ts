// node scripts/traction.ts   → writes ../TRACTION.md from the live site's books (never demo data)
//   OUTLAY_PUBLIC_URL=… to read another deployment
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.OUTLAY_PUBLIC_URL ?? 'https://synclyhq.up.railway.app';
const r = await fetch(`${base}/api/traction.md`);
if (!r.ok) { console.error(`could not read ${base}/api/traction.md: HTTP ${r.status}`); process.exit(1); }
const md = await r.text();
writeFileSync(join(import.meta.dirname, '..', '..', 'TRACTION.md'), md);
console.log(`TRACTION.md written from ${base} (${md.split('\n').length} lines)`);
