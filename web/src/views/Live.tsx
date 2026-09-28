'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Office from '@/office/Office.tsx';
import { Seal } from '@/lib.tsx';

/** The office and nothing else: full screen, chrome fades away when the mouse is still. */
export default function Live() {
  const [mode, setMode] = useState<{ mode: 'live' | 'replay' | 'idle'; orderId?: string }>({ mode: 'idle' });
  const [sound, setSound] = useState(false);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const wake = () => { setIdle(false); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setIdle(true), 3000); };
    const key = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') toggleFull(); };
    const fs = () => setFull(!!document.fullscreenElement);
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake); window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs); window.clearTimeout(timer.current); };
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); };

  return (
    <main className={`livestage${idle ? ' idle' : ''}`}>
      <Office fill idleReplayMs={6000} soundOnFirstClick onMode={setMode} onSound={setSound} />
      <div className={`live-hud${idle ? ' hidden' : ''}`}>
        <div className="live-brand">
          <Seal size={28} /><span className="wordmark">OUTLAY HQ</span>
          {mode.mode === 'live' ? <span className="chip live"><span className="dot" />Live</span>
            : mode.mode === 'replay' ? <span className="chip dark">↺ Replay · real events</span>
            : <span className="chip dark">Quiet</span>}
        </div>
        <div className="live-exit">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={toggleFull}>{full ? '⤡ Exit full screen' : '⛶ Full screen'}</button>
          <Link href="/office" onPointerDown={(e) => e.stopPropagation()}>✕ Close</Link>
        </div>
        {!sound && <div className="live-hint">Click anywhere for the marimba ♪</div>}
      </div>
    </main>
  );
}
