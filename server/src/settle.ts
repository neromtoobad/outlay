// Circle Gateway batches x402 payments and settles them on Arc a few minutes later. pay() returns a
// Gateway transfer id; this looks each live receipt up (read-only) and records the on-chain
// settlement transaction so every receipt can link to the Arc explorer.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, DRY } from './config.ts';
import { gateway } from './x402.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSettlements(maxLookups = 40): Promise<number> {
  if (DRY) return 0;
  const dir = join(DATA_DIR, 'jobs');
  if (!existsSync(dir)) return 0;
  const g = gateway('treasury');
  let looked = 0, found = 0;
  for (const id of readdirSync(dir)) {
    const f = join(dir, id, 'job.json');
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (j.status === 'running') continue; // the job still owns this file
    let changed = false;
    for (const r of j.receipt ?? []) {
      if (r.dry || r.settledTx || !UUID.test(String(r.transaction)) || looked >= maxLookups) continue;
      looked++;
      try {
        const t: any = await g.getTransferById(r.transaction);
        if (t?.txHash) { r.settledTx = t.txHash; r.settledAt = t.updatedAt; changed = true; found++; }
        else r.settleStatus = t?.status;
      } catch { /* try again next round */ }
    }
    if (changed) writeFileSync(f, JSON.stringify(j, null, 2));
  }
  return found;
}
