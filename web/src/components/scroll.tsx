'use client';
// Scroll primitives. One engine drives every scroll-linked animation on the page: components register a
// frame function, it runs on scroll and resize, and keeps running only while something is still easing.
// Everything is written straight to CSS variables or classes, so React never re-renders on scroll.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode, type RefObject } from 'react';

type Frame = (dt: number) => boolean | void;
const frames = new Set<Frame>();
let raf = 0, last = 0;
function loop(t: number) {
  raf = 0;
  const dt = last ? Math.min(64, t - last) : 16;
  last = t;
  let busy = false;
  frames.forEach((f) => { try { if (f(dt)) busy = true; } catch {} });
  if (busy) raf = requestAnimationFrame(loop); else last = 0;
}
export function kick() { if (typeof window !== 'undefined' && !raf) raf = requestAnimationFrame(loop); }
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
/** Frame-rate independent easing toward a target. */
export const approach = (cur: number, target: number, dt: number, tau = 90) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useFrame(fn: Frame) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f: Frame = (dt) => ref.current(dt);
    frames.add(f);
    kick();
    return () => { frames.delete(f); };
  }, []);
}

/**
 * Progress through a tall section whose content is sticky: 0 when its top reaches the top of the
 * screen, 1 when its bottom leaves. Eased, and written to `--p` on the element.
 */
export function useStickyProgress(ref: RefObject<HTMLElement | null>, onProgress?: (p: number) => void) {
  const cur = useRef(0);
  useFrame((dt) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    const target = span > 0 ? clamp(-r.top / span) : clamp((window.innerHeight - r.top) / (window.innerHeight + r.height));
    cur.current = reducedMotion() ? target : approach(cur.current, target, dt, 70);
    el.style.setProperty('--p', cur.current.toFixed(4));
    onProgress?.(cur.current);
    return Math.abs(cur.current - target) > 0.0005;
  });
}

/** Adds `in` once the element is well inside the viewport (for CSS-driven reveals). */
export function useInView<T extends HTMLElement>(margin = '-18% 0px -18% 0px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || !('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen];
}

/** Fades and lifts its children in when scrolled to. */
export function Rv({ as: Tag = 'div', children, className = '', style, delay = 0 }: { as?: ElementType; children: ReactNode; className?: string; style?: CSSProperties; delay?: number }) {
  const [ref, seen] = useInView<HTMLElement>('-8% 0px -8% 0px');
  return <Tag ref={ref} className={`rv${seen ? ' in' : ''} ${className}`} style={{ ...style, transitionDelay: `${delay}s` }}>{children}</Tag>;
}

/**
 * A headline split into its rendered lines; each line rises through its own mask when scrolled to.
 * The split is measured after layout (and again once fonts load or the width changes), so it always
 * matches how the browser actually wrapped the text.
 */
export function SplitLines({ text, as: Tag = 'h2', className = '', delay = 0, accent }: { text: string; as?: ElementType; className?: string; delay?: number; accent?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(false);
  const words = text.split(' ');

  useLayoutEffect(() => {
    if (lines) return;
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>('.w'));
    const out: string[][] = [];
    let top: number | null = null;
    for (const s of spans) {
      if (top === null || Math.abs(s.offsetTop - top) > 2) { out.push([]); top = s.offsetTop; }
      out[out.length - 1].push(s.textContent ?? '');
    }
    setLines(out.map((l) => l.join(' ')));
  }, [lines, text]);

  useEffect(() => {
    let w = window.innerWidth, t: ReturnType<typeof setTimeout>;
    const again = () => { clearTimeout(t); t = setTimeout(() => { if (window.innerWidth !== w) { w = window.innerWidth; setLines(null); } }, 150); };
    window.addEventListener('resize', again);
    document.fonts?.ready.then(() => setLines(null));
    return () => { window.removeEventListener('resize', again); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { setSeen(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }), { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const mark = (s: string) => (accent && s.includes(accent) ? <>{s.slice(0, s.indexOf(accent))}<span className="accent">{accent}</span>{s.slice(s.indexOf(accent) + accent.length)}</> : s);
  return (
    <Tag ref={ref} className={`split${seen ? ' in' : ''} ${className}`} aria-label={text}>
      {lines
        ? lines.map((l, i) => <span className="ln" key={i} aria-hidden="true"><span className="ln__in" style={{ transitionDelay: `${(delay + 0.06 + i * 0.09).toFixed(2)}s` }}>{mark(l)}</span></span>)
        : words.map((w, i) => <span className="w" key={i}>{w}{i < words.length - 1 ? ' ' : ''}</span>)}
    </Tag>
  );
}
