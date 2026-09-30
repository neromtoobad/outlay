'use client';
// The docs' sidebar (collapses into a picker on small screens) and the "on this page" list that follows your scroll.
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Group = { name: string; items: { slug: string; title: string }[] };

export function DocsSidebar({ groups, current }: { groups: Group[]; current: string }) {
  const [open, setOpen] = useState(false);
  const title = groups.flatMap((g) => g.items).find((d) => d.slug === current)?.title;
  return (
    <aside className={`docs__side${open ? ' open' : ''}`}>
      <button className="docs__pick" onClick={() => setOpen((o) => !o)} aria-expanded={open}><span className="mono">Docs</span><b>{title}</b><span>{open ? '×' : '▾'}</span></button>
      <nav>
        {groups.map((g) => (
          <div key={g.name} className="docs__group">
            <span className="mono">{g.name}</span>
            <ul>{g.items.map((d) => <li key={d.slug}><Link href={`/docs/${d.slug}`} className={d.slug === current ? 'on' : ''} onClick={() => setOpen(false)}>{d.title}</Link></li>)}</ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function OnThisPage({ toc }: { toc: { id: string; text: string; depth: number }[] }) {
  const [active, setActive] = useState(toc[0]?.id);
  useEffect(() => {
    const els = toc.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    const on = () => {
      let cur = els[0]?.id;
      for (const el of els) if (el.getBoundingClientRect().top < 140) cur = el.id;
      setActive(cur);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [toc]);
  if (!toc.length) return <aside className="docs__toc" />;
  return (
    <aside className="docs__toc">
      <span className="mono">On this page</span>
      <ul>{toc.map((t) => <li key={t.id} className={`d${t.depth}${t.id === active ? ' on' : ''}`}><a href={`#${t.id}`}>{t.text}</a></li>)}</ul>
    </aside>
  );
}
