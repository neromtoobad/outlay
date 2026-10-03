'use client';
// A business's Syncly Pay desk (a private link): money in and out, bills to approve, suppliers it has pinned, its books.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Address, Hex } from 'viem';
import { api, Avatar, ngn, useApi } from '@/lib.tsx';
import { approveUsdc, connect, short, vaultWrite, walletError, type EscrowCfg } from '@/wallet.ts';
import { DESK_KEY } from './Pay.tsx';
import { STATUS_LABEL, type PayDocView } from './PayInvoice.tsx';

type DeskDoc = PayDocView & { upload?: string; autopay?: { state: 'scheduled' | 'paid' | 'proposed' | 'waiting-funds'; reason?: string; at?: string; tx?: string } };
type VaultAccount = { owner: Address; balanceUsd: number; perPayCapUsd: number; weekCapUsd: number; spentUsd: number; weekEnds: string };
type Desk = {
  business: { name: string; email: string; payee: string; verified: boolean };
  totals: { paidIn: number; owedToYou: number; paidOut: number; toPay: number; fees: number };
  suppliers: { name: string; payee: string; paid: number; totalUsd: number; lastPaidAt?: string }[];
  docs: DeskDoc[];
  mode: 'live' | 'demo' | 'off';
  biz: Hex;
  autopay: null | { vault: Address; account: VaultAccount | null; allowed: Record<string, boolean> };
};
const f2 = (n: number) => n.toFixed(2);
const ICON: Record<string, string> = { ok: '✓', warn: '!', stop: '✕' };

function BillReview({ d, token, onDone }: { d: DeskDoc; token: string; onDone: () => void }) {
  const needPayee = d.checks?.some((c) => c.level === 'stop' && c.override === 'payee');
  const needDup = d.checks?.some((c) => c.level === 'stop' && c.override === 'duplicate');
  const hard = d.checks?.some((c) => c.level === 'stop' && !c.override);
  const [confirmPayee, setConfirmPayee] = useState(false);
  const [notDuplicate, setNotDuplicate] = useState(false);
  const [payee, setPayee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function approve() {
    setErr(null); setBusy(true);
    try { await api(`/api/pay/bills/${d.id}/approve`, { method: 'POST', body: JSON.stringify({ token, confirmPayee, notDuplicate, payee: payee || undefined }) }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  async function cancel() { setBusy(true); try { await api(`/api/pay/docs/${d.id}/cancel`, { method: 'POST', body: JSON.stringify({ token }) }); onDone(); } finally { setBusy(false); } }
  return (
    <div className="card pad billreview">
      <div className="billhead">
        <div><b>{d.seller.name}</b><span className="muted">{d.ref ? `invoice ${d.ref} · ` : ''}{d.due ? `due ${d.due}` : 'no due date'}</span></div>
        <div className="amt">{f2(d.amountUsd)} <small>USDC</small><span className="muted">{ngn(d.amountUsd)}</span></div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>To <span className="mono">{d.payee}</span></p>
      <div className="who"><Avatar role="investigator" /><b>The Investigator’s checks</b></div>
      <ul className="checks">{(d.checks ?? []).map((c, i) => <li key={i} className={c.level}><i>{ICON[c.level]}</i><span>{c.text}</span></li>)}</ul>
      {!hard && (
        <div className="form" style={{ gap: 10 }}>
          {needPayee && <label className="check"><input type="checkbox" checked={confirmPayee} onChange={(e) => setConfirmPayee(e.target.checked)} /> I called {d.seller.name} on a number I already had, and they confirmed this address.</label>}
          {needDup && <label className="check"><input type="checkbox" checked={notDuplicate} onChange={(e) => setNotDuplicate(e.target.checked)} /> This is a new order, not the same invoice again.</label>}
          <label className="field">Different address? <span className="hint">Paste the supplier’s correct Arc address and the Investigator checks it again.</span><input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" className="mono" /></label>
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!hard && <button className="btn primary" disabled={busy || (needPayee && !confirmPayee && !payee) || (needDup && !notDuplicate)} onClick={approve}>{payee ? 'Check this address' : 'Approve and book on Arc'}</button>}
        <button className="btn danger" disabled={busy} onClick={cancel}>Don’t pay it</button>
      </div>
    </div>
  );
}

function Upload({ token, onAdded }: { token: string; onAdded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payee, setPayee] = useState('');
  async function go(file?: File) {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/uploads', { method: 'POST', body: fd }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      await api('/api/pay/bills', { method: 'POST', body: JSON.stringify({ token, upload: r.uploads[0].id, payee: payee || undefined }) });
      setPayee(''); onAdded();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="card pad form" style={{ gap: 12 }}>
      <h3 className="t">Pay a bill <small>money out</small></h3>
      <label className="field">Supplier’s Arc address <span className="hint">optional if it’s printed on the bill, or you’ve paid them before</span><input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" className="mono" /></label>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => go(e.target.files?.[0])} />
      <button className="btn primary block" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Upload a photo of the bill'}</button>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

/** The business's PayVault account: its rules, its money, and what the CFO is waiting on it for. Every action is the owner's wallet. */
function Autopay({ desk, onChange }: { desk: Desk; onChange: () => void }) {
  const { data: esc } = useApi<EscrowCfg | { enabled: false }>('/api/escrow');
  const cfg = esc && esc.enabled ? esc : null;
  const ap = desk.autopay!, acct = ap.account;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ perPay: String(acct?.perPayCapUsd ?? 50), week: String(acct?.weekCapUsd ?? 200), add: '50' });
  const [pick, setPick] = useState<Record<string, boolean>>(() => Object.fromEntries(desk.suppliers.map((s) => [s.payee, true])));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const u = (x: string) => BigInt(Math.round(Number(x) * 1e6));
  async function run(label: string, fn: (who: Address) => Promise<unknown>) {
    setErr(null); setBusy(label);
    try {
      if (!cfg) throw new Error('Open this page in your wallet app (OKX, MetaMask, Rabby) to use autopay.');
      const who = await connect(cfg);
      if (acct && who.toLowerCase() !== acct.owner.toLowerCase() && label !== 'add') throw new Error(`This is ${short(who)}. Switch to the wallet that owns this account (${short(acct.owner)}).`);
      await fn(who); onChange();
    } catch (x: any) { setErr(walletError(x)); } finally { setBusy(null); }
  }
  const setup = () => run('setup', async (who) => {
    const payees = Object.entries(pick).filter(([, v]) => v).map(([k]) => k as Address);
    await vaultWrite(cfg!, who, ap.vault, 'open', [desk.biz, u(form.perPay), u(form.week), payees]);
    if (Number(form.add) > 0) { await approveUsdc(cfg!, who, ap.vault, Number(form.add)); await vaultWrite(cfg!, who, ap.vault, 'deposit', [desk.biz, u(form.add)]); }
  });
  const add = () => run('add', async (who) => { await approveUsdc(cfg!, who, ap.vault, Number(form.add)); await vaultWrite(cfg!, who, ap.vault, 'deposit', [desk.biz, u(form.add)]); });
  const withdraw = () => run('withdraw', (who) => vaultWrite(cfg!, who, ap.vault, 'withdraw', [desk.biz, u(String(acct!.balanceUsd)), who]));
  const limits = () => run('limits', (who) => vaultWrite(cfg!, who, ap.vault, 'setLimits', [desk.biz, u(form.perPay), u(form.week)]));
  const toggle = (payee: string, ok: boolean) => run(`payee:${payee}`, (who) => vaultWrite(cfg!, who, ap.vault, 'setPayee', [desk.biz, payee, ok]));

  if (!acct) return (
    <div className="card pad form" style={{ gap: 12 }}>
      <h3 className="t">Autopay <small>within limits you set, enforced on Arc</small></h3>
      <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>Put USDC aside for bills. On each due date the CFO pays your approved suppliers by itself, but never more than your caps, and never anyone else. Anything outside your rules waits for you. Only your wallet can take the money out.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        <label className="field">Most per bill<input type="text" inputMode="decimal" value={form.perPay} onChange={set('perPay')} /></label>
        <label className="field">Most per week<input type="text" inputMode="decimal" value={form.week} onChange={set('week')} /></label>
        <label className="field">Add now<input type="text" inputMode="decimal" value={form.add} onChange={set('add')} /></label>
      </div>
      {desk.suppliers.length > 0 ? (
        <div className="field" style={{ display: 'grid', gap: 6 }}>Suppliers it may pay
          {desk.suppliers.map((sp) => <label key={sp.payee} className="check"><input type="checkbox" checked={!!pick[sp.payee]} onChange={(e) => setPick((x) => ({ ...x, [sp.payee]: e.target.checked }))} /> {sp.name} <span className="mono muted">{short(sp.payee)}</span></label>)}
        </div>
      ) : <p className="muted" style={{ fontSize: 13 }}>Suppliers you pay once are pinned and can then be added here.</p>}
      {err && <div className="error">{err}</div>}
      <button className="btn primary block" disabled={!!busy} onClick={setup}>{busy ? 'Confirm in your wallet…' : 'Set up autopay from your wallet'}</button>
    </div>
  );
  const proposals = desk.docs.filter((d) => d.kind === 'bill' && d.status === 'open' && d.autopay?.state === 'proposed');
  return (
    <div className="card pad form" style={{ gap: 12 }}>
      <h3 className="t">Autopay <small>owned by <span className="mono">{short(acct.owner)}</span> · <a href={`https://explorer.arc.io/address/${ap.vault}`} target="_blank" rel="noreferrer">PayVault ↗</a></small></h3>
      <div className="apstats">
        <div><span className="muted">Balance</span><b>{f2(acct.balanceUsd)}</b></div>
        <div><span className="muted">Per bill</span><b>{f2(acct.perPayCapUsd)}</b></div>
        <div><span className="muted">This week</span><b>{f2(acct.spentUsd)} / {f2(acct.weekCapUsd)}</b></div>
      </div>
      {proposals.map((d) => (
        <div key={d.id} className="note"><b>Waiting for you:</b> {d.seller.name}, {f2(d.amountUsd)} USDC to <span className="mono">{short(d.payee)}</span>. The CFO didn’t pay it because {d.autopay?.reason}.
          {d.amountUsd > acct.balanceUsd && <div style={{ marginTop: 6 }}>Add at least {f2(d.amountUsd - acct.balanceUsd)} USDC first, or pay it from the bill’s own page.</div>}
          <div style={{ marginTop: 8 }}><button className="btn primary" disabled={!!busy || d.amountUsd > acct.balanceUsd} onClick={() => run(`approve:${d.id}`, async (who) => { const tx = await vaultWrite(cfg!, who, ap.vault, 'approve', [desk.biz, d.key]); await api(`/api/pay/invoices/${d.id}/sync`, { method: 'POST', body: JSON.stringify({ tx }) }); })}>Approve and pay from autopay</button></div>
        </div>
      ))}
      {desk.suppliers.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <b style={{ fontSize: 14 }}>Suppliers it may pay</b>
          {desk.suppliers.map((sp) => { const on = !!ap.allowed[sp.payee]; return (
            <div key={sp.payee} className="aprow"><span>{sp.name} <span className="mono muted">{short(sp.payee)}</span></span><button className={`btn ${on ? 'secondary' : 'ghost'} sm`} disabled={!!busy} onClick={() => toggle(sp.payee, !on)}>{on ? 'Approved ✓' : 'Approve'}</button></div>
          ); })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        <label className="field">Add USDC<input type="text" inputMode="decimal" value={form.add} onChange={set('add')} /></label>
        <label className="field">Per bill<input type="text" inputMode="decimal" value={form.perPay} onChange={set('perPay')} /></label>
        <label className="field">Per week<input type="text" inputMode="decimal" value={form.week} onChange={set('week')} /></label>
      </div>
      {err && <div className="error">{err}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={!!busy} onClick={add}>{busy === 'add' ? 'Confirm…' : 'Add money'}</button>
        <button className="btn secondary" disabled={!!busy} onClick={limits}>{busy === 'limits' ? 'Confirm…' : 'Save limits'}</button>
        <button className="btn ghost" disabled={!!busy || acct.balanceUsd <= 0} onClick={withdraw}>{busy === 'withdraw' ? 'Confirm…' : 'Withdraw it all'}</button>
      </div>
    </div>
  );
}

export default function PayDesk({ token }: { token: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Desk>(`/api/pay/desk/${token}`).then((d) => {
    setDesk(d);
    try { localStorage.setItem(DESK_KEY, JSON.stringify({ token, name: d.business.name, email: d.business.email, payee: d.business.payee })); } catch {}
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [token]);

  if (err && !desk) return <main className="wrap section center"><h1 className="h1">This desk link isn’t valid.</h1><p className="muted" style={{ margin: '12px 0 24px' }}>{err}</p><Link href="/pay" className="btn secondary">Syncly Pay</Link></main>;
  if (!desk) return <main className="wrap section"><div className="skel" style={{ height: 420 }} /></main>;
  const t = desk.totals;
  const review = desk.docs.filter((d) => d.kind === 'bill' && (d.status === 'review' || d.status === 'checking'));
  return (
    <main className="wrap">
      <div className="pagehead" style={{ paddingBottom: 20 }}>
        <span className="label"><span className="n">$</span>Syncly Pay desk</span>
        <h1 className="h1" style={{ marginTop: 12 }}>{desk.business.name}</h1>
        <p className="sub">Paid at <span className="mono">{desk.business.payee}</span>. This link is private: anyone with it can send invoices and approve bills for {desk.business.name}.</p>
      </div>
      <div className="kpirow paykpi">
        <div><div className="k">Paid to you</div><div className="v">{f2(t.paidIn)}<small>USDC</small></div><div className="d">{f2(t.owedToYou)} still owed</div></div>
        <div><div className="k">You paid out</div><div className="v">{f2(t.paidOut)}<small>USDC</small></div><div className="d">{f2(t.toPay)} waiting</div></div>
        <div><div className="k">Syncly fees</div><div className="v">{f2(t.fees)}<small>USDC</small></div><div className="d">0.5% of what you were paid</div></div>
        <div><div className="k">Your books</div><div className="v" style={{ fontSize: 22, marginTop: 14 }}><a href={`/api/pay/desk/${token}/books.csv`}>Download CSV ↓</a></div><div className="d">every payment, with its Arc transaction</div></div>
      </div>
      <div className="paygrid" style={{ marginTop: 22 }}>
        <div className="card pad paybox">
          <b>Send an invoice</b>
          <p>Describe the sale and the Writer drafts it; it’s booked on Arc straight away from your desk, and your customer gets a pay link.</p>
          <Link className="btn primary block" href="/pay">New invoice →</Link>
        </div>
        <Upload token={token} onAdded={load} />
      </div>
      {desk.autopay && <div style={{ marginTop: 20 }}><Autopay desk={desk} onChange={load} /></div>}
      {review.length > 0 && (
        <section style={{ marginTop: 26, display: 'grid', gap: 14 }}>
          <h2 className="paysect">Bills to approve</h2>
          {review.map((d) => d.status === 'checking'
            ? <div key={d.id} className="card pad"><div className="who"><Avatar role="analyst" /><b>Reading the bill and checking the payee…</b></div></div>
            : <BillReview key={d.id} d={d} token={token} onDone={load} />)}
        </section>
      )}
      <section style={{ marginTop: 26 }}>
        <h2 className="paysect">Invoices and bills</h2>
        {desk.docs.length === 0 ? <p className="muted">Nothing yet. Send your first invoice or upload a bill.</p> : (
          <div className="card paylist">
            {desk.docs.map((d) => (
              <Link key={d.id} href={`/pay/${d.id}`} className="payrow">
                <span className={`dir ${d.kind}`}>{d.kind === 'invoice' ? 'In' : 'Out'}</span>
                <span className="who2"><b>{d.kind === 'invoice' ? d.buyer.name : d.seller.name}</b><small className="muted">{d.ref ?? d.lines[0]?.what ?? ''}</small></span>
                <span className="amt2">{d.kind === 'invoice' ? '+' : '−'}{f2(d.amountUsd)}</span>
                <span className={`badge ${d.status === 'paid' ? 'accepted' : d.status === 'open' ? 'delivered' : d.status === 'failed' || d.status === 'cancelled' ? 'failed' : 'running'}`}>{d.status === 'paid' && d.autopay?.state === 'paid' ? 'Autopaid' : d.status === 'open' && d.autopay?.state === 'scheduled' ? `Autopays ${d.autopay.at ?? ''}` : d.status === 'open' && d.autopay?.state === 'proposed' ? 'Waiting for you' : d.status === 'open' && d.autopay?.state === 'waiting-funds' ? 'Needs a top-up' : STATUS_LABEL[d.status]}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      {desk.suppliers.length > 0 && (
        <section style={{ marginTop: 26, marginBottom: 80 }}>
          <h2 className="paysect">Suppliers you’ve paid <small className="muted">their addresses are pinned: a bill with a different one is stopped</small></h2>
          <div className="card paylist">
            {desk.suppliers.map((s) => <div key={s.name} className="payrow"><span className="dir bill">✓</span><span className="who2"><b>{s.name}</b><small className="muted mono">{short(s.payee)}</small></span><span className="amt2">{f2(s.totalUsd)}</span><span className="muted" style={{ fontSize: 13 }}>{s.paid} payment{s.paid === 1 ? '' : 's'}</span></div>)}
          </div>
        </section>
      )}
    </main>
  );
}
