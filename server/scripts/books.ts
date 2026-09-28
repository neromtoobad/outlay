// node scripts/books.ts            → P&L + beancount file built from every saved job's receipt
// (chain events from the vault/escrow join this once the contracts are deployed)
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../src/config.ts';
import { toolPurchase, toBeancount, pnl, type Entry } from '../src/ledger.ts';

const jobsDir = join(DATA_DIR, 'jobs');
const entries: Entry[] = [];
let dry = 0;
for (const id of existsSync(jobsDir) ? readdirSync(jobsDir) : []) {
  const f = join(jobsDir, id, 'job.json');
  if (!existsSync(f)) continue;
  const job = JSON.parse(readFileSync(f, 'utf8'));
  if (job.dry && !process.argv.includes('--include-dry')) { dry++; continue; }
  for (const r of job.receipt ?? []) entries.push(toolPurchase(r, job.id));
}
const out = join(DATA_DIR, 'outlay.beancount');
writeFileSync(out, toBeancount(entries));
const p = pnl(entries);
console.log(`entries ${entries.length} (skipped ${dry} dry-run jobs; pass --include-dry to see them)`);
console.log(`revenue ${p.revenue.toFixed(4)}  tools ${p.tools.toFixed(4)}  experts ${p.experts.toFixed(4)}  guarantee ${p.guarantee.toFixed(4)}  gross margin ${p.grossMargin.toFixed(4)} USDC`);
for (const [v, usd] of Object.entries(p.byVendor).sort((a, b) => b[1] - a[1])) console.log(`  ${v.padEnd(16)} ${usd.toFixed(4)}`);
console.log(`beancount → ${out}`);
