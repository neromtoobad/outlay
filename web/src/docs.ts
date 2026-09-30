// The docs: Markdown files in src/docs, rendered at build time. `{{vault}}`-style placeholders are
// filled from deployments/arc.json, so addresses on the site always match what is deployed.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';

export type DocMeta = { slug: string; title: string; description: string; group: string; order: number };
export type Doc = DocMeta & { html: string; toc: { id: string; text: string; depth: number }[] };

const DIR = join(process.cwd(), 'src', 'docs');
export const GROUPS = ['Start here', 'The company', 'Money and trust', 'Build and verify'];

function deployment(): Record<string, unknown> {
  const f = join(process.cwd(), '..', 'deployments', 'arc.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
function fill(md: string, dep: Record<string, unknown>) {
  return md.replace(/\{\{([\w.→:-]+)\}\}/g, (_, path: string) => {
    const v = path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dep);
    return typeof v === 'string' ? v : `{{${path}}}`;
  });
}
function front(src: string): [Record<string, string>, string] {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return [{}, src];
  const meta = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return [meta, src.slice(m[0].length)];
}
const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function allDocs(): DocMeta[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => {
    const [m] = front(readFileSync(join(DIR, f), 'utf8'));
    return { slug: f.replace(/\.md$/, ''), title: m.title ?? f, description: m.description ?? '', group: m.group ?? GROUPS[0], order: Number(m.order ?? 99) };
  }).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order);
}

export function getDoc(slug: string): Doc | null {
  const f = join(DIR, `${slug}.md`);
  if (!/^[a-z0-9-]+$/.test(slug) || !existsSync(f)) return null;
  const [m, body] = front(readFileSync(f, 'utf8'));
  const toc: Doc['toc'] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        const plain = text.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (depth === 2 || depth === 3) toc.push({ id, text: plain, depth });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href);
        return `<a href="${href}"${title ? ` title="${title}"` : ''}${ext ? ' target="_blank" rel="noreferrer"' : ''}>${text}${ext ? '<span class="ext">↗</span>' : ''}</a>`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const kind = inner.match(/^<p><strong>(Note|Tip|Heads up|Live|Honest limit)<\/strong>/)?.[1]?.toLowerCase().replace(' ', '-') ?? 'note';
        return `<aside class="callout ${kind}">${inner}</aside>\n`;
      },
      table(token) {
        const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(fill(body, deployment()), { async: false }) as string;
  return { slug, title: m.title ?? slug, description: m.description ?? '', group: m.group ?? GROUPS[0], order: Number(m.order ?? 99), html, toc };
}
