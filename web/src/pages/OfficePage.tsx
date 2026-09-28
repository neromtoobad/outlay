import { useState } from 'react';
import { Link } from 'react-router-dom';
import Office, { type FeedItem } from '../office/Office.tsx';
import { Avatar, ROLE_NAME } from '../lib.tsx';

const SERVICE: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };

export function describe(f: FeedItem): { who: string; text: string; amount?: string; order?: string } {
  const d = f.e.data ?? {};
  if (f.e.type === 'step') return { who: d.agent, text: `${d.step}${d.note ? ` · ${d.note}` : ''}`, order: f.e.orderId };
  if (f.e.type === 'purchase') return { who: d.agent, text: `bought ${d.vendor}`, amount: `−${Number(d.usd).toFixed(4)}`, order: f.e.orderId };
  const label: Record<string, string> = { queued: 'started', delivered: 'delivered', accepted: 'accepted', rejected: 'rejected: refund + bond', failed: 'failed: refund + bond', revision: 'revision requested', running: 'running' };
  return { who: 'cfo', text: `${SERVICE[d.service] ?? d.service} ${label[d.status] ?? d.status}`, amount: d.status === 'accepted' && !d.promo ? `+${Number(d.price).toFixed(2)}` : undefined, order: f.e.orderId };
}

export function Feed({ items }: { items: FeedItem[] }) {
  return (
    <ul className="feed">
      {items.length === 0 && <li className="muted" style={{ fontSize: 13 }}>Waiting for the next job…</li>}
      {items.map((f, i) => {
        const x = describe(f);
        return (
          <li key={i} className={f.kind}>
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
  return (
    <main className="wrap" style={{ paddingBottom: 60 }}>
      <div style={{ padding: '30px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">The office</div>
          <h1 style={{ fontSize: 32, letterSpacing: '-0.03em', margin: 0 }}>Watch the company work</h1>
          <p style={{ color: 'var(--ink-2)', margin: '6px 0 0', maxWidth: 680 }}>Every movement here is a real event: an agent types because it just took a step, a coin flies because a tool was just paid for, the seal slams when a job starts.</p>
        </div>
        {mode.mode === 'live' ? <span className="pill live"><span className="dot" />Live</span>
          : mode.mode === 'replay' ? <span className="pill" title="Recorded events of a finished job, played back faster than real time">↺ Replay of {mode.orderId} · recorded events, sped up</span>
          : <span className="pill">Quiet: no jobs running</span>}
      </div>
      <div className="officegrid">
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <Office onFeed={(f) => setFeed((x) => [f, ...x].slice(0, 60))} onMode={setMode} />
        </div>
        <aside className="card pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3>What just happened</h3>
          <Feed items={feed} />
          <Link to="/hire/local-business-finder" className="btn primary" style={{ marginTop: 14 }}>Give the team a job</Link>
        </aside>
      </div>
    </main>
  );
}
