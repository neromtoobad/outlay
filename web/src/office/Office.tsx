import { useEffect, useRef, useState } from 'react';
import type { OfficeScene, OfficeEvent } from './scene.ts';

export type FeedItem = { at: string; kind: 'live' | 'replay'; e: OfficeEvent };
type Props = {
  orderId?: string; // job page: only this order's events
  team?: string[]; // dim everyone else
  idleReplayMs?: number; // start replaying recorded events after this much silence (0 = never auto)
  onFeed?: (f: FeedItem) => void;
  onMode?: (m: { mode: 'live' | 'replay' | 'idle'; orderId?: string }) => void;
  replayToken?: number; // bump to force a replay (e.g. "Replay this job")
};

const wait = (ms: number, signal: { stop: boolean }) => new Promise<void>((r) => { const t = setInterval(() => { if (signal.stop) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, ms); });

export default function Office({ orderId, team, idleReplayMs = 12000, onFeed, onMode, replayToken }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const scene = useRef<OfficeScene | null>(null);
  const [ready, setReady] = useState(false);
  const lastLive = useRef(0);
  const replaying = useRef<{ stop: boolean } | null>(null);
  const cb = useRef({ onFeed, onMode });
  cb.current = { onFeed, onMode };

  // mount the scene
  useEffect(() => {
    let s: OfficeScene | null = null, cancelled = false;
    import('./scene.ts').then((m) => (cancelled || !el.current ? null : m.OfficeScene.create(el.current))).then((x) => { if (!x) return; if (cancelled) x.destroy(); else { s = scene.current = x; setReady(true); } });
    return () => { cancelled = true; replaying.current && (replaying.current.stop = true); s?.destroy(); scene.current = null; };
  }, []);
  useEffect(() => { if (ready) scene.current?.focus(team ?? null); }, [ready, team?.join(',')]);

  // live events
  useEffect(() => {
    if (!ready) return;
    const es = new EventSource(orderId ? `/api/events?order=${orderId}` : '/api/events');
    const onEvent = (msg: MessageEvent) => {
      const e = JSON.parse(msg.data) as OfficeEvent;
      if (!e.type) return;
      if (replaying.current) { replaying.current.stop = true; replaying.current = null; }
      lastLive.current = Date.now();
      scene.current?.handle(e);
      cb.current.onFeed?.({ at: e.at ?? new Date().toISOString(), kind: 'live', e });
      cb.current.onMode?.({ mode: 'live', orderId: e.orderId });
    };
    for (const t of ['step', 'purchase', 'order']) es.addEventListener(t, onEvent);
    return () => es.close();
  }, [ready, orderId]);

  // replay recorded events when idle (or on demand)
  async function playReplay(signal: { stop: boolean }) {
    const r = await fetch(`/api/replay?limit=5${orderId ? `&order=${orderId}` : ''}`).then((x) => x.json()).catch(() => null);
    const orders: { id: string; events: OfficeEvent[] }[] = r?.orders ?? [];
    if (!orders.length) { cb.current.onMode?.({ mode: 'idle' }); return; }
    for (const o of [...orders].reverse()) {
      if (signal.stop) return;
      cb.current.onMode?.({ mode: 'replay', orderId: o.id });
      let prev = 0;
      for (const e of o.events) {
        if (signal.stop) return;
        const t = Date.parse(e.at ?? '');
        const gap = prev ? Math.min(1400, Math.max(260, (t - prev) / 3)) : 300;
        prev = t;
        await wait(gap, signal);
        if (signal.stop) return;
        scene.current?.handle(e);
        cb.current.onFeed?.({ at: e.at ?? '', kind: 'replay', e });
      }
      await wait(3500, signal);
    }
  }
  useEffect(() => {
    if (!ready) return;
    const tick = setInterval(() => {
      if (!idleReplayMs || replaying.current) return;
      if (Date.now() - lastLive.current < idleReplayMs) return;
      const sig = { stop: false };
      replaying.current = sig;
      playReplay(sig).finally(() => { if (replaying.current === sig) { replaying.current = null; lastLive.current = Date.now() - idleReplayMs + 8000; } });
    }, 1000);
    lastLive.current = Date.now() - idleReplayMs + 2500; // first replay starts ~2.5 s after load if nothing is live
    return () => clearInterval(tick);
  }, [ready, idleReplayMs, orderId]);
  useEffect(() => {
    if (!ready || !replayToken) return;
    replaying.current && (replaying.current.stop = true);
    const sig = { stop: false };
    replaying.current = sig;
    playReplay(sig).finally(() => { if (replaying.current === sig) replaying.current = null; });
  }, [replayToken]);

  return <div ref={el} className="office-canvas" style={{ aspectRatio: '1344 / 752', background: '#e9e2d3' }} />;
}
