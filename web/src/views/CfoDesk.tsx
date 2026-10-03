'use client';
// The CFO's desk on /books: what it sees, this week's plan, what is waiting on the Boss, and every
// decision it made, each signed by the CFO's key and chained to the one before.
import { useState } from 'react';
import { api, useApi, usd, timeAgo, Avatar, ROLE_NAME } from '@/lib.tsx';
import { connect, coSignOnChain, hasWallet, short, txUrl, walletError, type EscrowCfg } from '@/wallet.ts';

type Decision = { n: number; at: string; kind: string; summary: string; rule: string; inputs: Record<string, unknown>; amount?: number; agent?: string; tx?: string; proposal?: number; status: string; hash: string; sig?: string };
type Agent = { role: string; balance: number; perJob: number; perJobFrom: string; allowance: number; toppedUp: number };
type Cfo = {
  enabled: boolean; mode: 'live' | 'observe';
  verify: { ok: boolean; entries: number; signer?: string | null; why?: string };
  metrics: { done: number; escalated: number; refused: number; wouldDo: number; proposed: number; cosigned: number };
  snapshot: null | { at: string; epoch: number; owner: string; cfoGas: number; jobsPerWeek: number; agents: Agent[]; pending: { id: number; from: string; to: string; amount: number }[]; buckets: Record<string, number> };
  plan: null | { vaultEpoch: number; openedAt: string; jobsPerWeek: number; allowances: Record<string, number>; commit: string };
  decisions: Decision[];
};

const KIND: Record<string, string> = {
  epoch: 'Weekly plan', allowance: 'Allowance', 'top-up': 'Top-up', move: 'Move', propose: 'Asked the Boss', escalate: 'Escalated',
  hold: 'Held', 'payee-pinned': 'Payee pinned', 'payee-refused': 'Payment refused', 'screen-refused': 'Screened out',
  autopay: 'Autopaid a bill', 'pay-propose': 'Asked a business', screen: 'Screening',
};
const STATUS: Record<string, string> = { done: 'done', 'would-do': 'would do', escalated: 'to the Boss', refused: 'refused', failed: 'failed' };

export default function CfoDesk() {
  const { data: c, setData } = useApi<Cfo>('/api/cfo', 15000);
  const { data: esc } = useApi<EscrowCfg | { enabled: false }>('/api/escrow');
  const cfg = esc?.enabled ? esc : null;
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!c?.enabled) return null;
  const s = c.snapshot;

  async function coSign(id: number) {
    if (!cfg || !s) return;
    setErr(null); setBusy(id);
    try {
      const who = await connect(cfg);
      if (who.toLowerCase() !== s.owner.toLowerCase()) throw new Error(`Only the Boss wallet (${short(s.owner)}) can co-sign. This is ${short(who)}.`);
      await coSignOnChain(cfg, who, id);
      setData(await api<Cfo>('/api/cfo'));
    } catch (e: any) { setErr(walletError(e)); } finally { setBusy(null); }
  }

  const shown = all ? c.decisions : c.decisions.slice(0, 12);
  return (
    <section className="card pad cfodesk" style={{ marginTop: 20 }}>
      <div className="cfohead">
        <h3 className="t">The CFO's desk <small>every decision about the company's money, signed</small></h3>
        <span className={`chip${c.mode === 'live' ? ' live' : ''}`}>{c.mode === 'live' ? <><span className="dot" />Acting on its own, inside the vault's limits</> : 'Observing: decides and logs, moves nothing yet'}</span>
      </div>
      <p className="muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>
        Every few minutes the CFO reads the vault and each agent's balance, plans the week's allowances from measured spend, puts revenue to work (tools first, then bond cover, then the reserve) and tops up agents that are running low.
        It moves at most {s ? usd(2) : '2'} USDC a week between two buckets on its own; anything bigger goes to the Boss to co-sign. No language model touches the money: every number and reason below is computed.
      </p>
      <div className="minis">
        <div><b>{c.metrics.done}</b>decisions carried out</div>
        <div><b>{c.metrics.escalated}</b>escalated to the Boss</div>
        <div><b>{c.metrics.cosigned}/{c.metrics.proposed}</b>proposals co-signed</div>
        <div title={c.verify.why}><b>{c.verify.ok ? '✓' : '✗'}</b>log {c.verify.ok ? `verified: ${c.verify.entries} entries, hash-chained and signed by the CFO` : `broken: ${c.verify.why}`}</div>
      </div>

      {s && s.pending.length > 0 && (
        <div className="bossbox">
          <b>Waiting on the Boss</b>
          {s.pending.map((p) => (
            <div key={p.id} className="bossrow">
              <span>Proposal #{p.id}: move <b>{usd(p.amount)} USDC</b> from {p.from.toUpperCase()} to {p.to.toUpperCase()}</span>
              <button className="btn primary sm" disabled={busy !== null || !cfg || !hasWallet()} onClick={() => coSign(p.id)}>{busy === p.id ? 'Confirm in your wallet…' : 'Co-sign as the Boss'}</button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Only the vault owner's wallet ({short(s.owner)}) can co-sign; the contract refuses anyone else.</p>
          {err && <div className="error">{err}</div>}
        </div>
      )}

      {s && (
        <div className="row2" style={{ marginTop: 16 }}>
          <div>
            <h4 className="subh">Each agent's float <small>its Circle Gateway balance for buying tools</small></h4>
            <table className="tbl compact">
              <thead><tr><th>Agent</th><th className="num">Balance</th><th className="num">Per job</th><th className="num">This week</th></tr></thead>
              <tbody>
                {s.agents.map((a) => (
                  <tr key={a.role}>
                    <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Avatar role={a.role} />{ROLE_NAME[a.role] ?? a.role}</span></td>
                    <td className={`num${a.balance < a.perJob * 2 ? ' warn' : ''}`}>{Number.isFinite(a.balance) ? usd(a.balance, 3) : '—'}</td>
                    <td className="num" title={a.perJobFrom}>{usd(a.perJob, 3)}</td>
                    <td className="num">{usd(a.toppedUp, 2)} / {usd(a.allowance, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>“This week” is topped up / allowed. An agent is topped up when it can afford fewer than two of its jobs. CFO gas: {usd(s.cfoGas, 4)} USDC.</p>
          </div>
          <div>
            <h4 className="subh">This week's plan <small>week {c.plan?.vaultEpoch ?? s.epoch}</small></h4>
            {c.plan ? (
              <>
                <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '4px 0 8px' }}>Planned for {c.plan.jobsPerWeek} jobs, {timeAgo(c.plan.openedAt)}.</p>
                <ul className="rules" style={{ fontSize: 14 }}>{Object.entries(c.plan.allowances).map(([r, x]) => <li key={r}><b>{ROLE_NAME[r] ?? r}</b>: {usd(x, 3)} USDC</li>)}</ul>
                <p className="muted" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>The plan's hash was sealed on-chain (openEpoch) before any money moved: <span className="mono">{c.plan.commit}</span></p>
              </>
            ) : <p className="muted" style={{ fontSize: 14 }}>No week planned yet{c.mode === 'observe' ? ': the CFO is observing' : ''}.</p>}
          </div>
        </div>
      )}

      <h4 className="subh" style={{ marginTop: 18 }}>Decision log</h4>
      <ol className="declog">
        {shown.map((d) => (
          <li key={d.n} className={d.status}>
            <div className="dl-top">
              <span className="kind">{KIND[d.kind] ?? d.kind}</span>
              <span className={`st ${d.status}`}>{d.kind === 'pay-propose' || (d.kind === 'escalate' && (d as { key?: string }).key?.startsWith('autopay')) ? 'to the owner' : STATUS[d.status] ?? d.status}</span>
              <span className="when">#{d.n} · {timeAgo(d.at)}</span>
            </div>
            <div className="sum">{d.summary}</div>
            <details>
              <summary>What it saw, and the proof</summary>
              <div className="ref">Rule: {d.rule}</div>
              {d.tx && (txUrl(cfg, d.tx) ? <div className="ref"><a href={txUrl(cfg, d.tx)} target="_blank" rel="noreferrer">Transaction ↗</a></div> : <div className="ref mono">tx {d.tx.slice(0, 18)}…</div>)}
              <pre className="spec">{JSON.stringify(d.inputs, null, 1)}</pre>
              <div className="ref mono" style={{ wordBreak: 'break-all' }}>hash {d.hash}{d.sig ? ` · signed ${d.sig.slice(0, 18)}…` : ''}</div>
            </details>
          </li>
        ))}
        {!c.decisions.length && <li className="muted">No decisions yet.</li>}
      </ol>
      {c.decisions.length > 12 && <button className="btn ghost sm" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${c.decisions.length}`}</button>}
    </section>
  );
}
