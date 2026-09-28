// node scripts/quote.ts   → shows how the CFO's quote changes with track record and bond-pool cover
import { quote } from '../src/cfo/quote.ts';

const cases = [
  { label: 'new service, new customer', history: { costs: [], accepted: 0, rejected: 0 }, first: true, pool: 3 },
  { label: 'new service, returning customer', history: { costs: [], accepted: 0, rejected: 0 }, first: false, pool: 3 },
  { label: 'strong record (18/19 accepted)', history: { costs: [0.05, 0.04, 0.06, 0.05], accepted: 18, rejected: 1 }, first: false, pool: 3 },
  { label: 'strong record, bond pool nearly used', history: { costs: [0.05, 0.04, 0.06], accepted: 18, rejected: 1 }, first: false, pool: 0.2 },
  { label: 'poor record (4/10 accepted)', history: { costs: [0.3, 0.5, 0.4], accepted: 4, rejected: 6 }, first: false, pool: 3 },
];
for (const c of cases) {
  const q = quote({ service: 'research-brief', priceUsd: 3, listedCostUsd: 0.2, history: c.history, bondPoolFreeUsd: c.pool, firstJobForCustomer: c.first, promoLeftUsd: 2, deliverHours: 1 });
  console.log(`\n■ ${c.label} → ${q.decision.toUpperCase()}${q.promo ? ' (FREE)' : ''} price ${q.priceUsd} bond ${q.bondUsd}`);
  for (const r of q.reasons) console.log(`   · ${r}`);
}
