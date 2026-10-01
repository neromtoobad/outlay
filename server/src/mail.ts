// The Messenger emails every delivery to the customer. It pays for AgentMail with x402 from its own
// Gateway balance, so each email is a line on the job's public receipt like any other tool.
//   OUTLAY_MAIL=aisa (default): AgentMail via AIsa, 0.10 USDC to open the mailbox once, 0.10 per email
//   OUTLAY_MAIL=orthogonal:     AgentMail via Orthogonal, 2 USDC a month for the mailbox, 0.01 per email
//                               (too big for a job's budget: open it once yourself and set OUTLAY_MAIL_INBOX)
//   OUTLAY_MAIL=off:            no emails (the job page is still the delivery)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import { DATA_DIR } from './config.ts';
import { buy } from './x402.ts';
import type { Job } from './job.ts';
import type { Order } from './orders.ts';

const PRESETS = {
  aisa: { vendor: 'AgentMail (AIsa)', base: 'https://api.aisa.one/apis/v2/agentmail', inboxUsd: 0.1, sendUsd: 0.1 },
  orthogonal: { vendor: 'AgentMail (Orthogonal)', base: 'https://np.orthogonal.com/agentmail/v0', inboxUsd: 2, sendUsd: 0.01 },
} as const;
const choice = (process.env.OUTLAY_MAIL ?? 'aisa') as keyof typeof PRESETS | 'off';
export const MAIL = choice === 'off' ? null : PRESETS[choice] ?? PRESETS.aisa;
export const MAIL_HOST = MAIL ? new URL(MAIL.base).host : '';
/** Mail costs each service's budget must leave room for: the per-email price plus the one-off mailbox. */
export const MAIL_BUDGET_USD = MAIL ? MAIL.sendUsd + Math.min(MAIL.inboxUsd, 0.1) : 0;

export const PUBLIC_URL = process.env.OUTLAY_PUBLIC_URL ?? 'https://hiresyncly.site';
const SERVICE: Record<string, string> = {
  'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List',
  'content-pack': 'Content Pack', website: 'Website', 'motion-ad': 'Motion Ad', 'video-ad': 'Video Ad',
  'ai-answer-audit': 'AI Answer Audit', 'best-price': 'Best Price Finder', 'vendor-check': 'Check Before You Pay',
};
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1•••$2');

// The mailbox is opened once (paid by the first job that needs it) and remembered on the data volume.
const boxFile = () => join(DATA_DIR, 'mailbox.json');
let opening: Promise<string> | null = null;
let demoBox: string | undefined; // demo mode "opens" it once per run, in memory only
function mailbox(job: Job): Promise<string> {
  if (process.env.OUTLAY_MAIL_INBOX) return Promise.resolve(process.env.OUTLAY_MAIL_INBOX);
  if (demoBox) return Promise.resolve(demoBox);
  if (existsSync(boxFile())) return Promise.resolve(JSON.parse(readFileSync(boxFile(), 'utf8')).inbox_id);
  return (opening ??= (async () => {
    const r = await buy<{ inbox_id?: string; id?: string }>(job, {
      agent: 'messenger', vendor: MAIL!.vendor, url: `${MAIL!.base}/inboxes`, body: { username: 'syncly', display_name: 'Syncly' },
      reason: "open Syncly's mailbox (once, for every delivery after this one)", maxUsd: MAIL!.inboxUsd * 1.05, expectUsd: MAIL!.inboxUsd,
      dryData: () => ({ inbox_id: 'syncly@agentmail.to' }),
    });
    const id = r.inbox_id ?? r.id;
    if (!id) throw new Error('the mail service did not return a mailbox');
    if (job.receipt.at(-1)?.dry) demoBox = id;
    else { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(boxFile(), JSON.stringify({ inbox_id: id, vendor: MAIL!.vendor, at: new Date().toISOString() })); }
    return id;
  })().finally(() => { opening = null; }));
}

// Scraped names and addresses end up in deliverables; neutralise any HTML before rendering the email.
// Mail apps ignore stylesheets, so tables get inline styles.
const render = (md: string) => (marked.parse(md.replace(/</g, '&lt;'), { async: false }) as string)
  .replace(/<table>/g, '<table style="border-collapse:collapse;width:100%;font-size:13px">')
  .replace(/<th([ >])/g, '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd4c2"$1')
  .replace(/<td([ >])/g, '<td style="padding:6px 8px;border-bottom:1px solid #ebe5d8;vertical-align:top"$1');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function compose(job: Pick<Job, 'deliverable' | 'files'>, o: Order) {
  const link = `${PUBLIC_URL}/job/${o.id}`;
  const name = SERVICE[o.service] ?? o.service;
  const revised = o.revisionNote !== undefined;
  const brief = o.brief.length > 70 ? o.brief.slice(0, 68) + '…' : o.brief;
  const decide = o.escrow
    ? `Your ${o.quote.priceUsd.toFixed(2)} USDC is waiting in escrow on Arc. On the job page, from the wallet that paid, accept to release it, ask for your one free revision, or reject it and get it back plus a ${o.quote.bondUsd.toFixed(2)} USDC bond. Silence for 48 hours counts as acceptance.`
    : o.quote.promo
      ? 'This one was your free first job. Tell us on the job page if it was good.'
      : 'Accept, revise or reject it on the job page.';
  const subject = `${revised ? 'Revised: ' : ''}your ${name} is ready · ${brief}`;
  const text = `The Syncly team finished your job.\n\n"${o.brief}"\n\n${job.deliverable}\n\n${decide}\n${link}\n\nEvery tool we paid for this job is on its public receipt. This email was sent and paid for by our Messenger agent, in USDC on Arc.\n`;
  const html = `<div style="background:#faf7f1;padding:28px 12px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1a17">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ebe5d8;border-radius:18px;padding:28px">
<div style="font-family:Georgia,serif;letter-spacing:.18em;font-size:14px;color:#17473b;margin-bottom:18px">SYNCLY</div>
<p style="font-size:16px;margin:0 0 6px">The team finished your ${esc(name)}${revised ? ', revised with your note' : ''}.</p>
<p style="font-size:14px;color:#4b4841;margin:0 0 18px">"${esc(o.brief)}"</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#17473b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">Review &amp; decide →</a></p>
<div style="font-size:14px;line-height:1.55;border-top:1px solid #ebe5d8;padding-top:14px">${render(job.deliverable)}</div>
<p style="font-size:13.5px;color:#4b4841;background:#f3eee4;border-radius:12px;padding:12px 14px;margin:18px 0 0">${esc(decide)}</p>
<p style="font-size:12px;color:#847d70;margin:18px 0 0">Every tool we paid for this job is on its <a href="${link}" style="color:#17473b">public receipt</a>. This email was sent, and paid for, by our Messenger agent in USDC on Arc.</p>
</div></div>`;
  // Text files ride along; images, video and sites are linked from the order page instead (mail size).
  const attachments = job.files.filter((f) => typeof f.content === 'string' && f.content.length < 2_000_000)
    .map((f) => ({ filename: f.name, content_type: f.name.endsWith('.csv') ? 'text/csv' : 'text/plain', content: Buffer.from(f.content).toString('base64') }));
  return { subject, text, html, attachments };
}

/** Email the delivery. Never fails the job: a problem is logged on the job and the page still has everything. */
export async function emailDelivery(job: Job, o: Order) {
  if (!MAIL || job.status !== 'delivered') return;
  const to = maskEmail(o.email);
  try {
    job.log('messenger', 'email', `sending the delivery to ${to}`);
    const inbox = await mailbox(job);
    const { subject, text, html, attachments } = compose(job, o);
    await buy(job, {
      agent: 'messenger', vendor: MAIL.vendor, url: `${MAIL.base}/inboxes/${encodeURIComponent(inbox)}/messages/send`,
      body: { to: [o.email], subject, text, html, attachments },
      reason: `email the delivery to ${to}`, maxUsd: MAIL.sendUsd * 1.05, expectUsd: MAIL.sendUsd,
      dryData: () => ({ message_id: 'dry-run' }),
    });
    job.log('messenger', 'emailed', `delivered to ${to}`);
  } catch (e: any) {
    job.log('messenger', 'email failed', `${String(e?.message ?? e).slice(0, 90)}. The job page has everything.`);
  }
  job.save();
}
