// Open books: every money movement becomes a balanced double-entry transaction, each one linked to
// its document (job id / receipt line) and its on-chain reference. Output is beancount text, so
// anyone can load it into bean-query or Fava, plus a P&L computed from the same entries.
//
// Accounts (USDC):
//   Assets:Vault:{Operating,Tools,Bond,Reserve,Promo}   buckets in SynclyVault
//   Assets:Gateway:<Role>                              an agent's Circle Gateway balance
//   Assets:Escrow:Held                                 customer money held by JobEscrow
//   Liabilities:Customers:Prepaid                      what we owe customers until they accept
//   Income:Services:<Service>                          accepted jobs only
//   Expenses:Tools:<Vendor>                            x402 purchases
//   Expenses:{Experts,Guarantee,Promo,Gas}
//   Equity:Owner:Contributions

export type Posting = { account: string; amount: number }; // + debit, − credit (beancount sign convention)
export type Entry = {
  date: string; // YYYY-MM-DD
  narration: string;
  postings: Posting[];
  meta: { doc?: string; tx?: string; agent?: string; reason?: string; kind: string; settled?: boolean };
};

const acct = (s: string) => s.replace(/[^A-Za-z0-9:-]/g, '').replace(/:([a-z])/g, (_, c) => ':' + c.toUpperCase());
const vendorAcct = (v: string) => 'Expenses:Tools:' + acct(v.split(/[\s(]/)[0].replace(/^./, (c) => c.toUpperCase()));
const roleAcct = (r: string) => 'Assets:Gateway:' + r.replace(/^./, (c) => c.toUpperCase());
const serviceAcct = (s: string) => 'Income:Services:' + s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const day = (iso: string) => iso.slice(0, 10);

export function toolPurchase(r: { at: string; agent: string; vendor: string; usd: number; transaction: string; reason: string; settledTx?: string }, jobId: string): Entry {
  return {
    date: day(r.at), narration: `${r.agent} bought ${r.vendor}`,
    postings: [{ account: vendorAcct(r.vendor), amount: r.usd }, { account: roleAcct(r.agent), amount: -r.usd }],
    meta: { doc: jobId, tx: r.settledTx ?? r.transaction, agent: r.agent, reason: r.reason, kind: 'tool', settled: !!r.settledTx },
  };
}

export function ownerFunding(at: string, usd: number, tx: string): Entry {
  return { date: day(at), narration: 'Owner funds the company', postings: [{ account: 'Assets:Vault:Operating', amount: usd }, { account: 'Equity:Owner:Contributions', amount: -usd }], meta: { tx, kind: 'funding' } };
}

export function bucketMove(at: string, from: string, to: string, usd: number, tx: string, reason: string): Entry {
  return { date: day(at), narration: `CFO moves ${from} → ${to}`, postings: [{ account: `Assets:Vault:${to}`, amount: usd }, { account: `Assets:Vault:${from}`, amount: -usd }], meta: { tx, reason, kind: 'move' } };
}

export function topUp(at: string, agent: string, usd: number, tx: string, reason: string): Entry {
  return { date: day(at), narration: `Tool budget to ${agent}`, postings: [{ account: roleAcct(agent), amount: usd }, { account: 'Assets:Vault:Tools', amount: -usd }], meta: { tx, agent, reason, kind: 'topup' } };
}

export function jobFunded(at: string, jobId: string, usd: number, tx: string): Entry {
  return { date: day(at), narration: `Customer funds ${jobId} into escrow`, postings: [{ account: 'Assets:Escrow:Held', amount: usd }, { account: 'Liabilities:Customers:Prepaid', amount: -usd }], meta: { doc: jobId, tx, kind: 'escrow' } };
}

export function jobAccepted(at: string, jobId: string, service: string, usd: number, tx: string, auto = false): Entry {
  return {
    date: day(at), narration: `${auto ? 'Auto-released' : 'Customer accepted'} ${jobId}`,
    postings: [
      { account: 'Liabilities:Customers:Prepaid', amount: usd }, { account: serviceAcct(service), amount: -usd },
      { account: 'Assets:Vault:Operating', amount: usd }, { account: 'Assets:Escrow:Held', amount: -usd },
    ],
    meta: { doc: jobId, tx, kind: 'revenue' },
  };
}

export function jobRejected(at: string, jobId: string, usd: number, bond: number, tx: string): Entry {
  return {
    date: day(at), narration: `Customer rejected ${jobId}: refund + bond`,
    postings: [
      { account: 'Liabilities:Customers:Prepaid', amount: usd }, { account: 'Assets:Escrow:Held', amount: -usd },
      ...(bond ? [{ account: 'Expenses:Guarantee', amount: bond }, { account: 'Assets:Vault:Bond', amount: -bond }] : []),
    ],
    meta: { doc: jobId, tx, kind: 'refund' },
  };
}

export function expertPaid(at: string, jobId: string, usd: number, tx: string): Entry {
  return { date: day(at), narration: `Expert review paid for ${jobId}`, postings: [{ account: 'Expenses:Experts', amount: usd }, { account: 'Assets:Vault:Operating', amount: -usd }], meta: { doc: jobId, tx, kind: 'expert' } };
}

// ---------------------------------------------------------------------------- checks & output

export function assertBalanced(e: Entry) {
  const sum = e.postings.reduce((s, p) => s + Math.round(p.amount * 1e6), 0);
  if (sum !== 0) throw new Error(`unbalanced entry "${e.narration}" (${sum} micro-USDC)`);
}

const esc = (s: string) => s.replace(/"/g, "'");
export function toBeancount(entries: Entry[]): string {
  const accounts = [...new Set(entries.flatMap((e) => e.postings.map((p) => p.account)))].sort();
  const first = entries.map((e) => e.date).sort()[0] ?? new Date().toISOString().slice(0, 10);
  const head = [`option "title" "Syncly: open books"`, `option "operating_currency" "USDC"`, `commodity USDC`, '', ...accounts.map((a) => `${first} open ${a} USDC`), ''];
  const body = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    assertBalanced(e);
    const meta = Object.entries(e.meta).filter(([, v]) => v).map(([k, v]) => `  ${k}: "${esc(String(v))}"`);
    const posts = e.postings.map((p) => `  ${p.account.padEnd(40)} ${p.amount.toFixed(6).padStart(14)} USDC`);
    return [`${e.date} * "${esc(e.narration)}"`, ...meta, ...posts].join('\n');
  });
  return [...head, ...body].join('\n') + '\n';
}

export type PnL = { revenue: number; tools: number; experts: number; guarantee: number; promo: number; gas: number; grossMargin: number; byService: Record<string, number>; byVendor: Record<string, number> };

export function pnl(entries: Entry[]): PnL {
  const r: PnL = { revenue: 0, tools: 0, experts: 0, guarantee: 0, promo: 0, gas: 0, grossMargin: 0, byService: {}, byVendor: {} };
  for (const e of entries) for (const p of e.postings) {
    if (p.account.startsWith('Income:Services:')) { r.revenue += -p.amount; r.byService[p.account.slice(16)] = (r.byService[p.account.slice(16)] ?? 0) - p.amount; }
    else if (p.account.startsWith('Expenses:Tools:')) { r.tools += p.amount; r.byVendor[p.account.slice(15)] = (r.byVendor[p.account.slice(15)] ?? 0) + p.amount; }
    else if (p.account === 'Expenses:Experts') r.experts += p.amount;
    else if (p.account === 'Expenses:Guarantee') r.guarantee += p.amount;
    else if (p.account === 'Expenses:Promo') r.promo += p.amount;
    else if (p.account === 'Expenses:Gas') r.gas += p.amount;
  }
  r.grossMargin = r.revenue - r.tools - r.experts - r.guarantee;
  return r;
}
