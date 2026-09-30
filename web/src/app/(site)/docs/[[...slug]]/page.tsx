import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allDocs, getDoc, GROUPS } from '@/docs.ts';
import { DocsSidebar, OnThisPage } from '@/views/DocsParts.tsx';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ slug: [] }, ...allDocs().map((d) => ({ slug: [d.slug] }))];
}

type Props = { params: Promise<{ slug?: string[] }> };
const slugOf = async (p: Props['params']) => (await p).slug?.[0] ?? 'overview';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = getDoc(await slugOf(params));
  return d ? { title: `${d.title} · Docs`, description: d.description } : {};
}

export default async function DocsPage({ params }: Props) {
  const slug = await slugOf(params);
  const doc = getDoc(slug);
  if (!doc) notFound();
  const docs = allDocs();
  const i = docs.findIndex((d) => d.slug === slug);
  const prev = docs[i - 1], next = docs[i + 1];
  const groups = GROUPS.map((g) => ({ name: g, items: docs.filter((d) => d.group === g).map(({ slug, title }) => ({ slug, title })) }));
  return (
    <main className="docs">
      <DocsSidebar groups={groups} current={slug} />
      <article className="docs__main">
        <div className="docs__crumb mono"><Link href="/docs">Docs</Link><span>/</span><span>{doc.group}</span></div>
        <h1>{doc.title}</h1>
        {doc.description && <p className="docs__lede">{doc.description}</p>}
        <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <nav className="docs__pager">
          {prev ? <Link href={`/docs/${prev.slug}`} className="prev"><span className="mono">← Previous</span><b>{prev.title}</b></Link> : <span />}
          {next ? <Link href={`/docs/${next.slug}`} className="next"><span className="mono">Next →</span><b>{next.title}</b></Link> : <span />}
        </nav>
        <p className="docs__edit mono">Something unclear or wrong? <a href={`https://github.com/neromtoobad/syncly/blob/main/web/src/docs/${slug}.md`} target="_blank" rel="noreferrer">See this page's source ↗</a></p>
      </article>
      <OnThisPage toc={doc.toc} />
    </main>
  );
}
