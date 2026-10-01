// Lead List: 25 verified leads with a personalized opener each.
// Researcher parses the target → Scout pulls businesses WITH websites from Google Maps → Reader reads
// each site's homepage + contact page (APEX, 10 pages per $0.003) and extracts emails → the CFO rule
// "cheapest first": only sites with no email on their pages get a paid Tomba lookup → Investigator bulk-
// checks every address (APEX, 100 per $0.009) → Writer drafts one opener per lead → deterministic QA.
import { Job } from '../job.ts';
import { MODELS } from '../config.ts';
import { HOSTS, domainEmails, emailsIn, llm, mapsSearch, webPlaces, parseJson, verifyEmails, webRead, type Place } from '../tools.ts';
import { MAIL_BUDGET_USD, MAIL_HOST } from '../mail.ts';

type Spec = { target: string; location: string; want: number; offer: string; queries: string[] };
type Lead = Place & { domain: string; email?: string; emailSource?: 'website' | 'tomba'; verdict?: string; opener?: string };

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const hostOf = (u?: string) => {
  try { return u ? new URL(u.startsWith('http') ? u : `https://${u}`).host.replace(/^www\./, '') : ''; } catch { return ''; }
};

export const leadList = {
  id: 'lead-list',
  name: 'Lead List',
  priceUsd: 5,
  policy: { budgetUsd: 0.6 + MAIL_BUDGET_USD, allowHosts: [HOSTS.blockrun, HOSTS.orthogonal, HOSTS.apex, HOSTS.exa, ...(MAIL_HOST ? [MAIL_HOST] : [])] },

  async run(brief: string, opts: { orderId?: string } = {}): Promise<Job> {
    const job = new Job(this.id, brief, this.policy, opts.orderId);
    try {
      job.log('researcher', 'parse', 'who to target, where, how many, what the customer sells');
      const spec = parseJson<Spec>(
        await llm(job, 'researcher', [
          { role: 'system', content: 'Parse a B2B lead-list request. Reply JSON only: {"target": business type to find, "location": area, "want": number (default 25, max 40), "offer": what the customer sells to them (one sentence), "queries": [2-3 Google Maps queries for the target in the location]}' },
          { role: 'user', content: brief },
        ], 'parse the lead request', { model: MODELS.fast, maxTokens: 300, json: true,
          dry: () => JSON.stringify({ target: 'boutique hotels', location: 'Victoria Island, Lagos', want: 25, offer: 'weekly fresh pastry delivery', queries: ['boutique hotel Victoria Island Lagos', 'hotel Victoria Island'] }) }),
        { target: brief, location: '', want: 25, offer: '', queries: [brief] },
      );
      spec.want = Math.min(40, Math.max(5, spec.want || 25));

      // 1. Businesses with a website (we need a domain to find an email)
      const byDomain = new Map<string, Lead>();
      let mapsCalls = 0, mapsDown = false;
      outer: for (const q of spec.queries.slice(0, 3)) {
        for (const page of [1, 2, 3]) {
          if (mapsCalls >= 6 || byDomain.size >= spec.want * 2) break;
          job.log('scout', 'maps', `"${q}" page ${page}`);
          let places: Awaited<ReturnType<typeof mapsSearch>>;
          try { places = await mapsSearch(job, 'scout', q, `find ${spec.target} with websites`, page); }
          catch (e: any) {
            const msg = String(e?.message ?? e);
            if (/verification|temporarily unavailable/i.test(msg)) { mapsDown = true; job.log('scout', 'switch', 'the Maps seller cannot take payments right now; searching the open web instead'); break outer; }
            job.log('scout', 'skip', `"${q}" failed (${msg.slice(0, 50)}); moving on`); break;
          }
          mapsCalls++;
          for (const p of places) {
            const domain = hostOf(p.website);
            if (!domain || /facebook|instagram|linktr|wa\.me|google|booking\.com|tripadvisor/.test(domain)) continue;
            if (!byDomain.has(domain)) byDomain.set(domain, { ...p, domain });
          }
          if (places.length < 10) break;
        }
      }
      if (mapsDown || !byDomain.size) {
        for (const p of await webPlaces(job, { category: spec.target, location: spec.location, queries: spec.queries }, spec.want * 2)) {
          const domain = hostOf(p.website);
          if (!domain || /facebook|instagram|linktr|wa\.me|google|booking\.com|tripadvisor/.test(domain)) continue;
          if (!byDomain.has(domain)) byDomain.set(domain, { ...p, domain });
        }
      }
      const leads = [...byDomain.values()].slice(0, spec.want * 2);
      job.log('scout', 'shortlist', `${leads.length} businesses with their own website`);

      // 2. Cheapest first: read homepage + /contact for every site
      const urls = leads.flatMap((l) => [`https://${l.domain}`, `https://${l.domain}/contact`]);
      job.log('reader', 'read sites', `${urls.length} pages in ${Math.ceil(urls.length / 10)} calls`);
      const pages = await webRead(job, 'reader', urls, 'look for published contact emails on each site');
      for (const l of leads) {
        const text = pages.filter((p) => hostOf(p.url) === l.domain).map((p) => p.text).join('\n');
        const onDomain = emailsIn(text).filter((e) => e.endsWith('@' + l.domain));
        const any = emailsIn(text);
        if (onDomain[0] ?? any[0]) { l.email = onDomain[0] ?? any[0]; l.emailSource = 'website'; }
      }

      // 3. Paid lookup only where the site showed nothing, and only until we can fill the list
      const missing = leads.filter((l) => !l.email);
      const need = Math.max(0, spec.want - leads.filter((l) => l.email).length);
      const lookups = missing.slice(0, Math.min(need + 3, 20));
      job.log('investigator', 'tomba', `${lookups.length} paid lookups (skipped ${missing.length - lookups.length}: list already full or over cap)`);
      for (const l of lookups) {
        const found = await domainEmails(job, 'investigator', l.domain, `no email on ${l.domain}'s own pages`);
        const best = found.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        if (best) { l.email = best.email; l.emailSource = 'tomba'; }
      }

      // 4. Verify every address in one or two bulk calls
      const withEmail = leads.filter((l) => l.email);
      job.log('investigator', 'verify', `${withEmail.length} addresses`);
      const verdicts = await verifyEmails(job, 'investigator', withEmail.map((l) => l.email!), 'check deliverability before anyone sends');
      const vmap = new Map(verdicts.map((v) => [v.email, v]));
      const good = withEmail.filter((l) => vmap.get(l.email!)?.ok).slice(0, spec.want);
      for (const l of withEmail) l.verdict = vmap.get(l.email!)?.verdict ?? 'unchecked';

      // 5. One opener per lead, in one call
      job.log('writer', 'openers', `${good.length} personalized first lines`);
      const openerJson = parseJson<{ openers: { domain: string; opener: string }[] }>(
        await llm(job, 'writer', [
          { role: 'system', content: `Write one short, specific cold-email opening line (max 30 words) per business for someone selling: "${spec.offer}". Mention something real from the data (name, category, rating, area). No flattery clichés, no invented facts. Reply JSON only: {"openers": [{"domain": string, "opener": string}]}` },
          { role: 'user', content: JSON.stringify(good.map((l) => ({ domain: l.domain, name: l.title, category: l.category, rating: l.rating, reviews: l.ratingCount, address: l.address }))) },
        ], 'write personalized openers', { maxTokens: 2500, json: true,
          dry: () => JSON.stringify({ openers: good.map((l) => ({ domain: l.domain, opener: `Saw ${l.title} on ${l.address} — ${l.rating}★ from ${l.ratingCount} guests.` })) }) }),
        { openers: [] },
      );
      const omap = new Map(openerJson.openers.map((o) => [o.domain, o.opener]));
      for (const l of good) l.opener = omap.get(l.domain);

      // 6. Deterministic QA
      const dupes = good.length - new Set(good.map((l) => l.email)).size;
      const noOpener = good.filter((l) => !l.opener).length;
      const nameless = good.filter((l) => l.opener && !l.opener.toLowerCase().includes(l.title.split(' ')[0].toLowerCase())).length;
      const issues = [
        dupes ? `${dupes} duplicate emails` : '',
        noOpener ? `${noOpener} leads without an opener` : '',
        nameless ? `${nameless} openers don't name the business` : '',
        good.length < spec.want ? `${good.length} of ${spec.want} verified leads found` : '',
      ].filter(Boolean);
      const hardFail = dupes > 0 || noOpener > Math.ceil(good.length * 0.1) || good.length === 0;
      job.log('auditor', 'check', hardFail ? issues.join('; ') : `pass${issues.length ? ` (note: ${issues.join('; ')})` : ''}`);
      job.qa = { verdict: hardFail ? 'revise' : 'pass', notes: issues.join(' | '), model: 'deterministic rules' };

      const header = ['business', 'category', 'email', 'email_source', 'email_check', 'website', 'phone', 'address', 'rating', 'reviews', 'opener'];
      const csv = [header.join(','), ...good.map((l) => [l.title, l.category, l.email, l.emailSource, l.verdict, `https://${l.domain}`, l.phone, l.address, l.rating, l.ratingCount, l.opener].map(csvCell).join(','))].join('\n');
      job.files.push({ name: 'leads.csv', content: csv + '\n' });
      const fromSite = good.filter((l) => l.emailSource === 'website').length;
      job.deliverable = `# ${good.length} verified leads: ${spec.target}, ${spec.location}\n\n` +
        `For: ${spec.offer}\n\n` +
        `- ${fromSite} emails published on the business's own site, ${good.length - fromSite} found via Tomba.\n` +
        `- Every address passed a live deliverability check (MX, disposable, shape).\n` +
        `- Each lead has a first line written from its real Maps data. Review before sending; Syncly never sends cold email for you.\n\n` +
        `| Business | Email | Opener |\n|---|---|---|\n` + good.slice(0, 10).map((l) => `| ${l.title} | ${l.email} | ${l.opener ?? ''} |`).join('\n') +
        `\n\nFull list in \`leads.csv\`.` + (issues.length ? `\n\n> Notes: ${issues.join('; ')}` : '');
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
