'use client';
// Shared motion primitives. Everything respects prefers-reduced-motion via <MotionConfig reducedMotion="user">.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, MotionConfig, MotionGlobalConfig, useInView, useMotionValue, useSpring, useTransform, type Variants } from 'motion/react';

// Debug switch for screenshots in hidden/throttled browsers: localStorage outlay:still = 1 skips all Motion animations.
if (typeof window !== 'undefined') { try { if (localStorage.getItem('outlay:still') === '1') MotionGlobalConfig.skipAnimations = true; } catch {} }

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ ease: EASE }}>{children}</MotionConfig>;
}

/** Fade + lift into view once, when scrolled to. */
export function Reveal({ children, delay = 0, y = 26, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div className={className} style={style} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ duration: 0.75, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const child: Variants = { hidden: { opacity: 0, y: 28, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE } } };

/** A grid whose children rise in one after another. */
export function Stagger({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <motion.div className={className} style={style} variants={group} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -10% 0px' }}>{children}</motion.div>;
}
export const StaggerItem = motion.create('div');
export const item = child;

/** Headline that reveals word by word (keeps <em> runs styled). */
export function Words({ parts, className, delay = 0 }: { parts: { text: string; em?: boolean; cls?: string }[]; className?: string; delay?: number }) {
  let i = 0;
  return (
    <h1 className={className} aria-label={parts.map((p) => p.text).join('')}>
      {parts.map((p, pi) => {
        const words = p.text.split(/(\s+)/);
        const inner = words.map((w, wi) => {
          if (!w.trim()) return w;
          const k = i++;
          return (
            <motion.span key={wi} aria-hidden className={p.cls} style={{ display: 'inline-block', willChange: 'transform', paddingRight: '0.04em' }} initial={{ opacity: 0, y: '0.5em', filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: delay + k * 0.055, ease: EASE }}>
              {w}
            </motion.span>
          );
        });
        return p.em ? <em key={pi}>{inner}</em> : <span key={pi}>{inner}</span>;
      })}
    </h1>
  );
}

/** A number that counts up when it comes into view (and eases to new values later). */
export function CountUp({ value, decimals = 0, suffix = '', prefix = '' }: { value: number | null | undefined; decimals?: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const from = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || value == null) return;
    const c = animate(from.current, value, { duration: 1.4, ease: EASE, onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [inView, value]);
  return <span ref={ref}>{value == null ? '—' : `${prefix}${shown.toFixed(decimals)}${suffix}`}</span>;
}

/** Card that tilts toward the pointer. */
export function Tilt({ children, className, style, max = 7 }: { children: ReactNode; className?: string; style?: React.CSSProperties; max?: number }) {
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 220, damping: 20 });
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 220, damping: 20 });
  return (
    <motion.div
      className={className}
      style={{ ...style, rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      {children}
    </motion.div>
  );
}

/** Gentle idle float, for cards hovering over the stage. */
export function Float({ children, className, style, delay = 0, amp = 6 }: { children: ReactNode; className?: string; style?: React.CSSProperties; delay?: number; amp?: number }) {
  return (
    <motion.div className={className} style={style} animate={{ y: [0, -amp, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}>
      {children}
    </motion.div>
  );
}

export { motion };
