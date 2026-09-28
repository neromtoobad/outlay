import { useState } from 'react';
import { Link } from 'react-router-dom';
import Office, { type FeedItem } from '../office/Office.tsx';
import { Avatar, ROLE_NAME, SERVICE_NAME } from '../lib.tsx';

const ROSTER = ['cfo', 'scout', 'researcher', 'writer', 'reader', 'verifier', 'analyst', 'auditor', 'illustrator', 'mailer', 'messenger'];

export function describe(f: FeedItem): { who: string; text: string; amount?: string; order?: string } {
  const d = f.e.data ?? {};
  if (f.e.type === 'step') return { who: d.agent, text: `${d.step}${d.note ? ` · ${d.note}` : ''}`, order: f.e.orderId };
  if (f.e.type === 'purchase') return { who: d.agent, text: `bought ${d.vendor}`, amount: `−${Number(d.usd).toFixed(4)}`, order: f.e.orderId };
  const label: Record<string, string> = { queued: 'started', delivered: 'delivered', accepted: 'accepted', rejected: 'rejected: refund + bond', failed: 'failed: refund + bond', revision: 'revision requested', running: 'running' };
  return { who: 'cfo', text: `${SERVICE_NAME[d.service] ?? d.service} ${label[d.status] ?? d.status}`, amount: d.status === 'accepted' && !d.promo ? `+${Number(d.price).toFixed(2)}` : undefined, order: f.e.orderId };
}

export function Feed({ items }: { items: FeedItem[] }) {
  return (
    <ul className="feed">
      {items.length === 0 && <li className="muted" style={{ display: 'block', fontSize: 14 }}>Waiting for the next job…</li>}
      {items.map((f, i) => {
        const x = describe(f);
        return (
          <li key={items.length - i} className={f.kind}>
            <Avatar role={x.who} />
            <div><b>{ROLE_NAME[x.who] ?? x.who}</b> <span>{x.text}</span>{x.order && <div className="ref"><Link to={`/job/${x.order}`}>{x.order}</Link>{f.kind === 'replay' ? ' · replay' : ''}</div>}</div>
            {x.amount && <span className={`amt ${x.amount.startsWith('+') ? 'in' : ''}`}>{x.amount}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export default function OfficePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [mode, setMode] = useState<{ mode: 'live' | 'replay' | 'idle'; orderId?: string }>({ mode: 'idle' });
  const [busy, setBusy] = useState<Record<string, number>>({});
  const onFeed = (f: FeedItem) => {
    setFeed((x) => [f, ...x].slice(0, 80));
    const who = describe(f).who;
    if (who) setBusy((b) => ({ ...b, [who]: Date.now() }));
  };
  const now = Date.now();
  return (
    <main className="wrap">
      <div className="pagehead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">The office</div>
          <h1 className="h1">Watch the company <em>work.</em></h1>
          <p className="sub">Every movement is a real event: an agent types because it just took a step, a coin flies because a tool was just paid for, the seal slams when a job starts.</p>
        </div>
        {mode.mode === 'live' ? <span className="chip live"><span className="dot" />Live: a job is running</span>
          : mode.mode === 'replay' ? <span className="chip" title="Recorded events of a finished job, played back faster than real time">↺ Replaying {mode.orderId} · sped up</span>
          : <span className="chip">Quiet: no jobs running</span>}
      </div>
      <div className="officegrid">
        <div className="stagebox"><Office onFeed={onFeed} onMode={setMode} /></div>
        <aside className="card pad">
          <h3 className="t">What just happened</h3>
          <Feed items={feed} />
          <Link to="/hire/local-business-finder" className="btn primary block" style={{ marginTop: 14 }}>Give the team a job</Link>
        </aside>
      </div>
      <div className="roster">
        {ROSTER.map((r) => <div key={r} className={now - (busy[r] ?? 0) < 12000 ? 'busy' : ''}><Avatar role={r} />{ROLE_NAME[r]}</div>)}
      </div>
    </main>
  );
}
