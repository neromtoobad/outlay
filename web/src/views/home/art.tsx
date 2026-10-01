// Line illustrations for the home page, drawn in code (no image files). Every piece carries --i so CSS can
// build it up in order once its section is in view (the parent gets `.in`).
import type { CSSProperties } from 'react';

const v = (i: number) => ({ ['--i' as any]: i }) as CSSProperties;

/** A stack of coins seen from slightly above: n ellipses, each drawn over the one below it. */
export function Coins({ x, y, n, rx = 34, ry = 11, gap = 5.2, stroke, fill, start = 0, top }: { x: number; y: number; n: number; rx?: number; ry?: number; gap?: number; stroke: string; fill: string; start?: number; top?: string }) {
  const items = [];
  for (let k = 0; k < n; k++) {
    const cy = y - k * gap;
    items.push(
      <g key={k} className="pc" style={v(start + k)}>
        <path d={`M${x - rx} ${cy} v${gap} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-gap}`} fill={fill} stroke={stroke} strokeWidth="1.2" />
        <ellipse cx={x} cy={cy} rx={rx} ry={ry} fill={k === n - 1 && top ? top : fill} stroke={stroke} strokeWidth="1.2" />
      </g>,
    );
  }
  return <g>{items}</g>;
}

/** The vault: five buckets as coin stacks, heights from the live balances. */
export function VaultArt({ buckets }: { buckets: { key: string; label: string; value: number; color: string }[] }) {
  const max = Math.max(1.5, ...buckets.map((b) => b.value));
  const W = 560, base = 250;
  return (
    <svg className="art vault" viewBox={`0 0 ${W} 310`} role="img" aria-label="The vault's five buckets, as stacks of coins">
      <defs>
        <pattern id="vgrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="rgba(255,255,255,0.05)" /></pattern>
      </defs>
      <line className="pc" style={v(0)} x1="24" y1={base + 26} x2={W - 24} y2={base + 26} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 5" />
      {buckets.map((b, i) => {
        const n = b.value > 0 ? Math.max(2, Math.round((b.value / max) * 30)) : 1;
        const x = 64 + i * ((W - 128) / (buckets.length - 1));
        return (
          <g key={b.key}>
            <Coins x={x} y={base} n={n} rx={34} ry={11} gap={6.2} stroke={b.color} fill="#0F2A1E" start={i * 3} />
            <text className="pc" style={v(i * 3 + 2)} x={x} y={base + 50} textAnchor="middle" fill="#7E9486" fontSize="10.5" fontFamily="var(--mono)" letterSpacing="1.4">{b.label}</text>
            <text className="pc" style={v(i * 3 + 3)} x={x} y={base + 66} textAnchor="middle" fill="#fff" fontSize="12.5" fontFamily="var(--mono)">{b.value.toFixed(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}

const INK = '#13271C', MINT = '#2E7A38', LEAF = '#A3E36A', SOFT = '#ECF6E2', PAPER = '#FFFFFF', BRASS = '#C8902F';

/** 1 · The quote: a signed sheet with the price and the CFO's stamp. */
export function QuoteArt() {
  return (
    <svg className="art" viewBox="0 0 400 300" role="img" aria-label="A signed quote">
      <g className="pc" style={v(0)}><rect x="112" y="40" width="176" height="224" rx="12" fill={PAPER} stroke={INK} strokeWidth="1.4" /></g>
      <g className="pc" style={v(1)}><rect x="132" y="62" width="70" height="8" rx="4" fill={INK} /><rect x="132" y="78" width="110" height="6" rx="3" fill="#D8D1C0" /></g>
      <g className="pc" style={v(2)}><text x="132" y="132" fontFamily="var(--sans)" fontWeight="650" fontSize="38" letterSpacing="-1.5" fill={INK}>3.00</text><text x="218" y="132" fontFamily="var(--mono)" fontSize="11" fill="#66726A">USDC</text></g>
      {[0, 1, 2].map((k) => <g key={k} className="pc" style={v(3 + k)}><rect x="132" y={158 + k * 22} width="136" height="1" fill="#E7E2D6" /><rect x="132" y={146 + k * 22} width={[62, 88, 50][k]} height="6" rx="3" fill="#D8D1C0" /><rect x={236} y={146 + k * 22} width="32" height="6" rx="3" fill={k === 1 ? MINT : '#D8D1C0'} /></g>)}
      <g className="pc stamp-in" style={v(6)}>
        <circle cx="262" cy="232" r="30" fill={SOFT} stroke={MINT} strokeWidth="1.6" />
        <circle cx="262" cy="232" r="23" fill="none" stroke={MINT} strokeWidth="1" strokeDasharray="2 3" />
        <path d="M250 232l8 8 15-16" fill="none" stroke={MINT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 2 · Escrow: coins drop into a locked box that only the customer can open. */
export function EscrowArt() {
  return (
    <svg className="art" viewBox="0 0 400 300" role="img" aria-label="Money waiting in escrow">
      <g className="pc" style={v(0)}>
        <path d="M200 120l92 44-92 44-92-44z" fill={SOFT} stroke={INK} strokeWidth="1.4" />
        <path d="M108 164v62l92 44v-62z" fill={PAPER} stroke={INK} strokeWidth="1.4" />
        <path d="M292 164v62l-92 44v-62z" fill="#F4F6F8" stroke={INK} strokeWidth="1.4" />
      </g>
      <g className="pc" style={v(1)}>
        <path d="M241 222l-0.2-9.4a6.4 6.4 0 0112.8-6.1l0.2 9.4" fill="none" stroke={INK} strokeWidth="2.4" />
        <path d="M234 222.6l26-12.4v20l-26 12.4z" fill={INK} />
        <circle cx="247" cy="224.5" r="2.4" fill={LEAF} />
      </g>
      <g className="pc drop" style={v(2)}><Coins x={200} y={92} n={4} rx={24} ry={8} gap={4.4} stroke={INK} fill={PAPER} top={SOFT} /></g>
      <g className="pc" style={v(3)}><text x="200" y="292" textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5" letterSpacing="1.4" fill="#66726A">JOBESCROW · ARC MAINNET</text></g>
    </svg>
  );
}

/** 3 · You watch them work: every tool the team buys is a line on your job page. */
export function ReceiptArt() {
  const rows = [['Scout', 'Exa search', '0.0070'], ['Researcher', 'BlockRun', '0.0030'], ['Reader', 'Exa contents', '0.0010'], ['Auditor', 'BlockRun', '0.0030']];
  return (
    <svg className="art" viewBox="0 0 400 300" role="img" aria-label="A receipt of the tools the team paid for">
      <g className="pc" style={v(0)}><path d="M116 30h168v222l-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10z" fill={PAPER} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" /></g>
      <g className="pc" style={v(1)}><text x="200" y="58" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" letterSpacing="2.4" fill={INK}>SYNCLY · RECEIPT</text><rect x="136" y="70" width="128" height="1" fill="#E7E2D6" /></g>
      {rows.map((r, k) => (
        <g key={k} className="pc" style={v(2 + k)}>
          <circle cx="144" cy={96 + k * 34} r="8" fill={SOFT} stroke={MINT} />
          <text x="158" y={94 + k * 34} fontFamily="var(--sans)" fontSize="11.5" fontWeight="600" fill={INK}>{r[0]}</text>
          <text x="158" y={108 + k * 34} fontFamily="var(--mono)" fontSize="9.5" fill="#66726A">{r[1]}</text>
          <text x="264" y={99 + k * 34} textAnchor="end" fontFamily="var(--mono)" fontSize="11" fill={INK}>{r[2]}</text>
        </g>
      ))}
      <g className="pc" style={v(7)}><rect x="136" y="232" width="128" height="1" fill={INK} /><text x="136" y="250" fontFamily="var(--mono)" fontSize="10" fill={MINT}>✓ SETTLED ON ARC</text></g>
    </svg>
  );
}

/** 4 · You decide, from the wallet that paid. */
export function DecideArt() {
  const btn = (y: number, label: string, on: boolean, k: number, color = INK) => (
    <g className="pc" style={v(k)}>
      <rect x="96" y={y} width="208" height="46" rx="23" fill={on ? LEAF : PAPER} stroke={on ? LEAF : '#D8D1C0'} strokeWidth="1.4" />
      <text x="200" y={y + 29} textAnchor="middle" fontFamily="var(--sans)" fontSize="15" fontWeight="600" fill={on ? INK : color}>{label}</text>
    </g>
  );
  return (
    <svg className="art" viewBox="0 0 400 300" role="img" aria-label="Accept, revise or reject">
      {btn(52, 'Accept & release ✓', true, 0)}
      {btn(114, 'Ask for a revision', false, 1)}
      {btn(176, 'Reject: refund + bond', false, 2, '#C2412D')}
      <g className="pc cursor" style={v(3)}><path d="M268 82l0 30 8-7 6 13 6-3-6-12 11-1z" fill={INK} stroke={PAPER} strokeWidth="1.5" strokeLinejoin="round" /></g>
      <g className="pc" style={v(4)}><text x="200" y="258" textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5" letterSpacing="1.2" fill="#66726A">ONLY THE WALLET THAT PAID CAN DECIDE</text></g>
    </svg>
  );
}

/** What a job costs us in tools, next to what it costs you: two stacks on one floor. */
export function CostArt({ price, cost }: { price: number; cost: number }) {
  const n = 26, m = Math.max(1, Math.round((cost / Math.max(price, 0.01)) * n));
  return (
    <svg className="art" viewBox="0 0 460 320" role="img" aria-label={`Price ${price} USDC against tool cost ${cost.toFixed(3)} USDC`}>
      <line className="pc" style={v(0)} x1="30" y1="278" x2="430" y2="278" stroke="#D8D1C0" />
      <circle className="pc" style={v(0)} cx="30" cy="278" r="3" fill="#D8D1C0" /><circle className="pc" style={v(0)} cx="430" cy="278" r="3" fill="#D8D1C0" />
      <Coins x={140} y={262} n={n} rx={46} ry={15} gap={7} stroke={BRASS} fill={PAPER} start={1} />
      <Coins x={320} y={262} n={m} rx={46} ry={15} gap={7} stroke={MINT} fill={SOFT} start={1} />
      <text className="pc" style={v(n + 1)} x="140" y="304" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" letterSpacing="1.2" fill="#66726A">YOU PAY {price.toFixed(2)}</text>
      <text className="pc" style={v(n + 1)} x="320" y="304" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" letterSpacing="1.2" fill="#66726A">TOOLS COST {cost.toFixed(3)}</text>
    </svg>
  );
}

/** The mark, extruded: its three ledger rows stacked into a block, as a closing emblem (the 48-grid, ×4). */
export function MarkBlock() {
  const layers = 16;
  const bars: [number, string][] = [[24, '#FFFFFF'], [78, '#A3E36A'], [132, '#FFFFFF']];
  return (
    <svg className="art markblock" viewBox="0 0 200 236" role="img" aria-label="The Syncly mark">
      {Array.from({ length: layers }, (_, k) => {
        const top = k === layers - 1, dy = (layers - 1 - k) * 4;
        return (
          <g key={k} className="pc" style={v(k)} transform={`translate(4 ${dy + 12})`} opacity={top ? 1 : 0.3 + (0.6 * k) / layers}>
            {top && <><rect x="28" y="42" width="36" height="56" fill="#FFFFFF" /><rect x="128" y="96" width="36" height="54" fill="#FFFFFF" /></>}
            {bars.map(([y, c], j) => <rect key={j} x="28" y={y} width="136" height="36" rx="18" fill={top ? c : 'none'} stroke={j === 1 ? '#A3E36A' : '#7E9486'} strokeWidth="1" />)}
          </g>
        );
      })}
    </svg>
  );
}
