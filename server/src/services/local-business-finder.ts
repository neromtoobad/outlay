// Local Business Finder: "every café in Lekki without a website" → a clean CSV + summary.
// Researcher parses the brief → Scout pulls Google Maps pages (Serper Maps) → Verifier dedupes and
// normalizes phone numbers → Analyst summarizes → QA is deterministic code, not an LLM grading itself:
// no duplicates, every row has a name and address, and the customer's filter actually holds.
import { Job } from '../job.ts';
import { MODELS } from '../config.ts';
import { HOSTS, llm, mapsSearch, parseJson, type Place } from '../tools.ts';

type Spec = { category: string; location: string; want: number; filter: 'none' | 'no_website' | 'has_website' | 'has_phone'; queries: string[] };

function normPhone(p?: string): string | undefined {
  if (!p) return undefined;
  const d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('+234')) return d;
  if (d.startsWith('234')) return '+' + d;
  if (d.startsWith('0') && d.length === 11) return '+234' + d.slice(1);
  return d || undefined;
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const localBusinessFinder = {
  id: 'local-business-finder',
  name: 'Local Business Finder',
  priceUsd: 3,
  policy: { budgetUsd: 0.25, allowHosts: [HOSTS.blockrun, HOSTS.orthogonal] },

  async run(brief: string, opts: { orderId?: string } = {}): Promise<Job> {
    const job = new Job(this.id, brief, this.policy, opts.orderId);
    try {
      job.log('researcher', 'parse', 'category, location, how many, which filter');
      const spec = parseJson<Spec>(
        await llm(job, 'researcher', [
          { role: 'system', content: 'Parse a local-business search request. Reply JSON only: {"category": string, "location": string (neighbourhood, city, country), "want": number (default 30, max 60), "filter": "none"|"no_website"|"has_website"|"has_phone", "queries": [2-3 Google Maps queries that together cover the category in that location, e.g. synonyms]}' },
          { role: 'user', content: brief },
        ], 'parse the request into a search spec', { model: MODELS.fast, maxTokens: 300, json: true,
          dry: () => JSON.stringify({ category: 'cafés', location: 'Lekki, Lagos, Nigeria', want: 20, filter: 'no_website', queries: ['cafe Lekki Lagos', 'coffee shop Lekki Phase 1'] }) }),
        { category: brief, location: '', want: 30, filter: 'none', queries: [brief] },
      );
      spec.want = Math.min(60, Math.max(5, spec.want || 30));

      // Search: up to 3 queries × 2 pages, stop once we have enough after filtering
      const byKey = new Map<string, Place>();
      const keep = (p: Place) =>
        spec.filter === 'no_website' ? !p.website : spec.filter === 'has_website' ? !!p.website : spec.filter === 'has_phone' ? !!p.phone : true;
      let calls = 0;
      outer: for (const q of spec.queries.slice(0, 3)) {
        for (const page of [1, 2]) {
          if (calls >= 6) break outer;
          job.log('scout', 'maps', `"${q}" page ${page}`);
          let places: Place[];
          try { places = await mapsSearch(job, 'scout', q, `Google Maps: "${q}" p${page}`, page); }
          catch (e: any) { job.log('scout', 'skip', `"${q}" failed (${String(e?.message ?? e).slice(0, 50)}); moving on`); calls++; break; }
          calls++;
          for (const p of places) {
            const key = p.cid ?? `${p.title}|${p.address}`.toLowerCase();
            if (!byKey.has(key)) byKey.set(key, p);
          }
          if ([...byKey.values()].filter(keep).length >= spec.want) break outer;
          if (places.length < 10) break; // no more pages for this query
        }
      }

      if (!byKey.size) throw new Error('no search came back; nothing to deliver');
      job.log('verifier', 'clean', `${byKey.size} unique places → applying "${spec.filter}", normalizing phones`);
      const rows = [...byKey.values()]
        .filter(keep)
        .map((p) => ({ ...p, phone: normPhone(p.phone) }))
        .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
        .slice(0, spec.want);

      // Deterministic QA
      const names = rows.map((r) => `${r.title}|${r.address}`.toLowerCase());
      const dupes = names.length - new Set(names).size;
      const missing = rows.filter((r) => !r.title || !r.address).length;
      const filterBroken = rows.filter((r) => !keep(r)).length;
      const issues = [
        dupes ? `${dupes} duplicate rows` : '',
        missing ? `${missing} rows missing name/address` : '',
        filterBroken ? `${filterBroken} rows violate the filter` : '',
        rows.length < spec.want ? `found ${rows.length} of ${spec.want} requested (Maps had no more matches)` : '',
      ].filter(Boolean);
      const hardFail = dupes > 0 || missing > 0 || filterBroken > 0;
      job.log('auditor', 'check', hardFail ? issues.join('; ') : `pass${issues.length ? ` (note: ${issues.join('; ')})` : ''}`);
      job.qa = { verdict: hardFail ? 'revise' : 'pass', notes: issues.join(' | '), model: 'deterministic rules' };

      const header = ['name', 'category', 'address', 'phone', 'website', 'rating', 'reviews', 'hours', 'lat', 'lng'];
      const csv = [header.join(','), ...rows.map((r) => [r.title, r.category, r.address, r.phone, r.website, r.rating, r.ratingCount, r.hours, r.lat, r.lng].map(csvCell).join(','))].join('\n');
      job.files.push({ name: 'businesses.csv', content: csv + '\n' });

      job.log('analyst', 'summarize', 'counts, ratings, contactability');
      const withPhone = rows.filter((r) => r.phone).length;
      const avg = rows.filter((r) => r.rating).reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(1, rows.filter((r) => r.rating).length);
      const top = rows.slice(0, 10).map((r, i) => `| ${i + 1} | ${r.title} | ${r.address ?? ''} | ${r.phone ?? '—'} | ${r.rating ?? '—'} (${r.ratingCount ?? 0}) |`).join('\n');
      job.deliverable = `# ${spec.category} in ${spec.location}\n\n` +
        `**${rows.length} businesses** (filter: ${spec.filter.replace('_', ' ')}). ${withPhone} have a phone number. Average rating ${avg.toFixed(1)}.\n` +
        `Source: Google Maps via Serper, ${calls} searches on ${new Date().toISOString().slice(0, 10)}. Full list in \`businesses.csv\`.\n\n` +
        `| # | Name | Address | Phone | Rating (reviews) |\n|---|---|---|---|---|\n${top}\n\n` +
        (issues.length ? `> Notes: ${issues.join('; ')}\n` : '');
      job.status = hardFail ? 'failed' : 'delivered';
      if (hardFail) job.error = `QA failed: ${issues.join('; ')}`;
    } catch (e: any) {
      job.status = 'failed';
      job.error = String(e?.message ?? e);
      console.error('  ✗', job.error);
    }
    job.save();
    return job;
  },
};
