// A job: one customer order, its budget policy, its receipt lines, a step log and the deliverable.
// Saved as data/jobs/<id>/{job.json, deliverable.md}. The receipt is the public "open books"
// record: every tool the team bought, from whom, for how much, and why.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DATA_DIR, DRY } from './config.ts';
import type { ReceiptLine } from './x402.ts';
import type { Role } from './wallets.ts';

export type Policy = { budgetUsd: number; allowHosts: string[] };
export type StepLog = { at: string; agent: Role; step: string; note: string };

export class Job {
  id: string;
  service: string;
  brief: string;
  policy: Policy;
  createdAt = new Date().toISOString();
  receipt: ReceiptLine[] = [];
  steps: StepLog[] = [];
  deliverable = '';
  qa?: { verdict: 'pass' | 'revise'; notes: string; model: string };
  status: 'running' | 'delivered' | 'failed' = 'running';
  error?: string;

  constructor(service: string, brief: string, policy: Policy) {
    this.id = `job_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${randomBytes(3).toString('hex')}`;
    this.service = service;
    this.brief = brief;
    this.policy = policy;
  }

  spentUsd() {
    return this.receipt.reduce((s, r) => s + r.usd, 0);
  }
  addReceipt(r: ReceiptLine) {
    this.receipt.push(r);
    console.log(`  💸 ${r.agent.padEnd(10)} ${r.vendor.padEnd(22)} ${r.usd.toFixed(4)} USDC  ${r.dry ? '(dry)' : r.transaction.slice(0, 18)}  · ${r.reason}`);
  }
  log(agent: Role, step: string, note = '') {
    this.steps.push({ at: new Date().toISOString(), agent, step, note });
    console.log(`  ▸ ${agent.padEnd(10)} ${step}${note ? ` · ${note}` : ''}`);
  }

  dir() {
    return join(DATA_DIR, 'jobs', this.id);
  }
  save() {
    mkdirSync(this.dir(), { recursive: true });
    const { deliverable, ...rest } = this;
    writeFileSync(join(this.dir(), 'job.json'), JSON.stringify({ ...rest, dry: DRY, spentUsd: this.spentUsd() }, null, 2));
    if (deliverable) writeFileSync(join(this.dir(), 'deliverable.md'), deliverable);
  }
}
