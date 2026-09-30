// Website: a real one-page site for a small business, live at synclyhq…/s/<name> and downloadable.
// Researcher parses the brief → Scout finds the Google listing (address, phone, hours, rating) and
// real reviews → Reader reads any existing site and their recent Instagram posts (their own photos
// become the gallery) → Illustrator makes a hero image when there are no photos → Designer (Opus 5,
// or Opus 4.8 when its wallet is empty) writes the site from those facts only → QA: code checks that
// every phone number and price on the page is in the sources, that it's mobile-ready and has no
// outside scripts; screenshots on a phone and a laptop go to a vision model for a design review; the
// Designer fixes what either found, once; Lighthouse scores the live page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Job } from '../job.ts';
import { DATA_DIR, DRY, MODELS } from '../config.ts';
import { HOSTS, llm, mapsSearch, parseJson, webRead, type Msg, type Place } from '../tools.ts';
import { AISA, ORTHO, aisa, dataforseo, ortho } from '../sellers.ts';
import { download, ffmpeg, image } from '../media.ts';
import { screenshots } from '../browser.ts';
import { zip } from '../zip.ts';
import { MAIL_BUDGET_USD, MAIL_HOST, PUBLIC_URL } from '../mail.ts';

type Spec = { business: string; offer: string; location: string; phone?: string; whatsapp?: string; email?: string; instagram?: string; website?: string; style: string; sections: string[]; audience: string; mapsQuery: string };
type Asset = { name: string; buf: Buffer; about: string };

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'site';
const digits = (s: string) => s.replace(/\D/g, '');
const handle = (h?: string) => h?.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').trim() || undefined;

/** Every check a customer's site must pass, in code. Returns problems as plain sentences. */
export function checkSite(html: string, facts: string, assets: string[]): string[] {
  const p: string[] = [];
  if (html.length > 250_000) p.push(`the page is ${(html.length / 1000).toFixed(0)} KB; keep it under 250 KB`);
  if (!/<meta[^>]+name=["']viewport/i.test(html)) p.push('no mobile viewport meta tag');
  if (!/<title>[^<]{3,}<\/title>/i.test(html)) p.push('no <title>');
  if (!/<meta[^>]+name=["']description/i.test(html)) p.push('no meta description');
  if ((html.match(/<h1[\s>]/gi) ?? []).length !== 1) p.push('there must be exactly one <h1>');
  if (/<script[^>]+src=/i.test(html)) p.push('outside scripts are not allowed (inline only)');
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) if (!assets.includes(m[1])) p.push(`image "${m[1]}" is not one of the provided files`);
  const factDigits = digits(facts);
  for (const m of html.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g)) {
    const d = digits(m[0]);
    if (d.length >= 10 && d.length <= 14 && !factDigits.includes(d.slice(-10))) p.push(`phone-like number "${m[0].trim()}" is not in the sources`);
  }
  for (const m of html.matchAll(/(?:₦|NGN|\$|£|€|GH₵|KSh)\s?\d[\d,.]*\s?[kK]?/g)) if (!facts.includes(m[0].replace(/\s/g, '')) && !facts.includes(m[0])) p.push(`price "${m[0]}" is not in the sources`);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { JSON.parse(m[1]); } catch { p.push('the JSON-LD block is not valid JSON'); } }
  return [...new Set(p)];
}

async function toJpeg(png: Buffer, maxH: number): Promise<Buffer> {
  return ffmpeg({ 'in.png': png }, (f, out) => ['-i', f['in.png'], '-vf', `crop=iw:min(ih\\,${maxH}):0:0`, '-q:v', '4', out], 'jpg');
}

export const website = {
  id: 'website',
  name: 'Website',
  priceUsd: 15,
  policy: { budgetUsd: 2.2 + MAIL_BUDGET_USD, allowHosts: [HOSTS.blockrun, HOSTS.blockrunArc, HOSTS.orthogonal, HOSTS.apex, AISA, ...(MAIL_HOST ? [MAIL_HOST] : [])] },

  async run(brief: string, opts: { orderId?: string } = {}): Promise<Job> {
    const job = new Job(this.id, brief, this.policy, opts.orderId);
    try {
      job.log('researcher', 'parse', 'the business, how customers reach it, and the look they want');
      const spec = parseJson<Spec>(
        await llm(job, 'researcher', [
          { role: 'system', content: 'Parse a request for a small-business website. Reply JSON only: {"business": name, "offer": what they sell (one sentence), "location": area and city, "phone": as given or null, "whatsapp": as given or null, "email": or null, "instagram": handle or null, "website": existing site url or null, "style": the look they want (default: "bold, warm and modern, mobile-first"), "sections": sections the site needs (default ["hero","what we offer","gallery","reviews","hours & location","contact"]), "audience": who buys, "mapsQuery": a Google Maps search that finds this exact business ("name area city")}' },
          { role: 'user', content: brief },
        ], 'parse the site brief', { model: MODELS.fast, maxTokens: 500, json: true,
          dry: () => JSON.stringify({ business: 'Tolu’s Small Chops', offer: 'Small chops trays and party catering for events in Lagos', location: 'Surulere, Lagos', phone: '0803 555 0142', whatsapp: '0803 555 0142', email: null, instagram: '@tolussmallchops', website: null, style: 'bold, warm and modern, mobile-first', sections: ['hero', 'what we offer', 'gallery', 'reviews', 'hours & location', 'contact'], audience: 'Lagos party hosts and office admins', mapsQuery: 'Tolu small chops Surulere Lagos' }) }),
        { business: brief.slice(0, 50), offer: brief, location: '', style: 'bold, warm and modern, mobile-first', sections: ['hero', 'offer', 'contact'], audience: '', mapsQuery: brief.slice(0, 60) },
      );

      // 1. Facts, from sources only
      const facts: string[] = [`Business: ${spec.business}`, `Offer: ${spec.offer}`, `Brief from the owner: ${brief}`];
      let place: Place | undefined;
      try {
        job.log('scout', 'listing', `Google listing for "${spec.mapsQuery}"`);
        const places = await mapsSearch(job, 'scout', spec.mapsQuery, `find ${spec.business} on Google Maps`);
        const name = spec.business.toLowerCase().split(/\s+/)[0];
        place = places.find((p) => p.title?.toLowerCase().includes(name)) ?? undefined;
        if (place) facts.push(`Google listing: ${place.title}; address ${place.address ?? '?'}; phone ${place.phone ?? '?'}; rating ${place.rating ?? '?'} from ${place.ratingCount ?? 0} reviews; hours ${place.hours ?? '?'}; category ${place.category ?? '?'}`);
        else job.log('scout', 'note', 'no Google listing matched; using the owner\'s details only');
      } catch (e: any) { job.log('scout', 'skip', `Maps lookup failed (${String(e?.message ?? e).slice(0, 50)})`); }
      const reviews: { text: string; who: string; rating: number }[] = [];
      if (place?.cid) {
        try {
          const d = await ortho<any>(job, 'serper/reviews', { body: { cid: place.cid } }, { agent: 'scout', vendor: 'Serper Reviews (Orthogonal)', reason: `real Google reviews for ${spec.business}`, expectUsd: 0.002, maxUsd: 0.005,
            dry: () => ({ reviews: [{ rating: 5, snippet: 'The small chops were still hot when they arrived and my guests finished everything.', user: { name: 'Adaeze O.' } }, { rating: 5, snippet: 'Booked for our office party, delivered on time. The puff-puff is elite.', user: { name: 'Kunle A.' } }] }) });
          for (const r of (d?.reviews ?? []).filter((r: any) => r.rating >= 4 && r.snippet).slice(0, 4)) reviews.push({ text: String(r.snippet).slice(0, 220), who: String(r.user?.name ?? 'Google reviewer').split(' ')[0], rating: r.rating });
          if (reviews.length) facts.push(`Real Google reviews (quote exactly, first name only): ${reviews.map((r) => `"${r.text}" (${r.who}, ${r.rating}★)`).join(' | ')}`);
        } catch (e: any) { job.log('scout', 'skip', `reviews unavailable (${String(e?.message ?? e).slice(0, 50)})`); }
      }
      if (spec.website) {
        try {
          job.log('reader', 'read', `their current site ${spec.website}`);
          const [pg] = await webRead(job, 'reader', [spec.website.startsWith('http') ? spec.website : `https://${spec.website}`], 'read their existing site');
          if (pg?.text) facts.push(`Their current site says: ${pg.text.slice(0, 3500)}`);
        } catch (e: any) { job.log('reader', 'skip', `site unreadable (${String(e?.message ?? e).slice(0, 50)})`); }
      }
      const assets: Asset[] = [];
      const ig = handle(spec.instagram);
      if (ig) {
        try {
          job.log('reader', 'instagram', `@${ig}'s recent posts: captions for facts, photos for the gallery`);
          const d = await aisa<any>(job, 'instagram/user/posts', { query: { handle: ig, trim: true } }, { agent: 'reader', vendor: 'Instagram posts (AIsa)', reason: `@${ig}'s own photos and captions`,
            dry: () => ({ items: [0, 1, 2, 3].map((i) => ({ code: `P${i}`, display_uri: 'dry://photo', caption: { text: ['Tray of the week: puff-puff, samosa, spring rolls, gizzard', 'Office party for 80, done', 'Weekend orders open. DM to book', 'Wedding trays, Lekki'][i] } })) }) });
          const items = (d?.items ?? []).slice(0, 12);
          const caps = items.map((p: any) => p.caption?.text).filter(Boolean).slice(0, 10);
          if (caps.length) facts.push(`Their Instagram captions: ${caps.map((c: string) => c.slice(0, 200)).join(' | ')}`);
          for (const p of items.filter((p: any) => p.display_uri || p.image_versions2?.candidates?.[0]?.url).slice(0, 6)) {
            try {
              const buf = DRY ? (await image(job, 'illustrator', { prompt: `gallery ${assets.length}`, reason: 'demo photo' })).buf : await download(p.display_uri ?? p.image_versions2.candidates[0].url, 8);
              assets.push({ name: `photo-${assets.length + 1}.jpg`, buf, about: `their own Instagram photo: ${String(p.caption?.text ?? '').slice(0, 90)}` });
            } catch { /* expired or blocked image; skip it */ }
          }
        } catch (e: any) { job.log('reader', 'skip', `Instagram unavailable (${String(e?.message ?? e).slice(0, 50)})`); }
      }
      if (!assets.length || !DRY) {
        job.log('illustrator', 'design', 'a hero image in their colours');
        try {
          const { buf } = await image(job, 'illustrator', { prompt: `Hero photograph for the website of ${spec.business}: ${spec.offer}, ${spec.location}. Wide, warm, appetising or aspirational, natural light, real-looking, room on one side for a headline. No text, no logos.`, size: '1792x1024', reason: 'hero image for the site' });
          assets.unshift({ name: 'hero.png', buf, about: 'generated hero image (wide)' });
        } catch (e: any) { job.log('illustrator', 'skip', `hero image failed (${String(e?.message ?? e).slice(0, 50)})`); }
      }
      const factText = facts.join('\n');
      const names = assets.map((a) => a.name);

      // 2. Design and build
      const phone = spec.whatsapp ?? spec.phone ?? place?.phone;
      const system = `You are a senior web designer building a one-page website for a small business. Output ONE complete HTML file only (no Markdown fences, no commentary).
Rules:
- Facts: use ONLY the facts provided. Never invent prices, dishes, services, awards, years in business, testimonials or statistics. Quote reviews exactly as given with first names only; if none are given, show no testimonials. If a price isn't given, don't show one ("Ask for a quote" instead).
- Contact: a prominent WhatsApp button (https://wa.me/<international number without +>) and a tel: link when a phone is known; a Google Maps iframe (https://www.google.com/maps?q=<url-encoded address>&output=embed) when an address is known; opening hours if known.
- Images: use only these files, by exact name: ${names.join(', ') || '(none; use colour, type and shape instead)'}. Every <img> needs alt text, width/height attributes and loading="lazy" (except the hero).
- Design: ${spec.style}. Mobile-first (most visitors are on phones), fluid type with clamp(), a clear palette of 3–4 colours drawn from the business, one display font + one text font from Google Fonts (a <link> is fine), generous spacing, strong visual hierarchy, big tap targets, a sticky mobile call-to-action bar, subtle CSS-only motion (prefers-reduced-motion respected). It should feel designed for this business, not like a template.
- Technical: exactly one <h1>; <title> and meta description written for local search ("${spec.business} in ${spec.location}"); Open Graph tags; a JSON-LD LocalBusiness block with only known facts; semantic sections; no external scripts (inline JS only if needed); a small footer credit "Site by Syncly".
- Sections: ${spec.sections.join(', ')}.`;
      const user = `Facts:\n${factText}\n\nPhone/WhatsApp for buttons: ${phone ?? 'none known'}\nEmail: ${spec.email ?? 'none'}\nAudience: ${spec.audience}\n\nImage files:\n${assets.map((a) => `- ${a.name}: ${a.about}`).join('\n') || '(none)'}`;
      job.log('illustrator', 'build', `designing and coding the site with ${MODELS.designer.split('/')[1]}`);
      const dryHtml = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${spec.business} in ${spec.location}</title><meta name="description" content="${spec.offer}"><script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"${spec.business}"}</script><style>body{margin:0;font-family:system-ui;background:#fbf6ee;color:#2a1a0e}header{padding:48px 20px;background:#7a2e12;color:#fff}h1{font-size:clamp(32px,8vw,64px);margin:0}.cta{position:sticky;bottom:0;display:flex;gap:8px;padding:12px;background:#fff}.cta a{flex:1;padding:14px;border-radius:12px;text-align:center;background:#1f7a3a;color:#fff;text-decoration:none}img{width:100%;height:auto;display:block}</style></head><body><header><h1>${spec.business}</h1><p>${spec.offer}</p></header>${names.map((n) => `<img src="${n}" alt="${spec.business}" width="1024" height="768" loading="lazy">`).join('')}<section><h2>Reviews</h2>${reviews.map((r) => `<blockquote>${r.text} — ${r.who}</blockquote>`).join('')}</section><div class="cta"><a href="https://wa.me/2348035550142">WhatsApp</a><a href="tel:+2348035550142">Call 0803 555 0142</a></div><footer>Site by Syncly</footer></body></html>`;
      const build = (msgs: Msg[], why: string) => llm(job, 'illustrator', msgs, why, { model: MODELS.designer, fallback: MODELS.designerFallback, maxTokens: 16000, maxUsd: 0.6, dry: dryHtml });
      const clean = (s: string) => s.replace(/^[\s\S]*?(<!doctype html|<html)/i, '$1').replace(/<\/html>[\s\S]*$/i, '</html>').trim();
      let html = clean(await build([{ role: 'system', content: system }, { role: 'user', content: user }], 'design and code the site'));
      if (!/<html/i.test(html)) throw new Error('the designer did not return an HTML page');

      // 3. Publish to a private working folder, then check it like a customer would
      const slug = `${slugify(spec.business)}-${randomBytes(2).toString('hex')}`;
      const dir = join(DATA_DIR, 'sites', slug);
      const publish = () => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'index.html'), html); for (const a of assets) writeFileSync(join(dir, a.name), a.buf); };
      publish();
      const review = async () => {
        const shots = await screenshots(join(dir, 'index.html'), [{ name: 'phone', width: 390, height: 844, full: true }, { name: 'laptop', width: 1280, height: 800 }]);
        const jpgs = await Promise.all(shots.map(async (s) => ({ name: s.name, jpg: await toJpeg(s.png, s.name === 'phone' ? 3400 : 800), png: s.png })));
        job.log('auditor', 'look', `design review of the phone and laptop screenshots with ${MODELS.vision.split('/')[1]}`);
        const verdict = parseJson<{ issues: string[] }>(await llm(job, 'auditor', [
          { role: 'system', content: 'You review a small-business website from screenshots (a full phone page and a laptop first screen). List concrete visual problems only: unreadable text or low contrast, broken or overlapping layout, content cut off, empty sections, images missing or distorted, buttons too small, the page looking unfinished or generic. Ignore taste differences. Reply JSON only: {"issues": [short, specific strings]} (empty if it looks professional).' },
          { role: 'user', content: [{ type: 'text', text: `The ${spec.business} site. Phone screenshot, then laptop.` }, ...jpgs.map((j) => ({ type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${j.jpg.toString('base64')}` } }))] },
        ], 'look at the site on a phone and a laptop', { model: MODELS.vision, maxTokens: 700, json: true, maxUsd: 0.1, dry: () => JSON.stringify({ issues: [] }) }), { issues: [] });
        return { shots: jpgs, issues: verdict.issues ?? [] };
      };
      let problems = checkSite(html, factText, names);
      let look = await review();
      if (problems.length || look.issues.length) {
        job.log('illustrator', 'revise', `${problems.length + look.issues.length} issues from the checks and the design review`);
        html = clean(await build([{ role: 'system', content: system }, { role: 'user', content: user },
          { role: 'assistant', content: html }, { role: 'user', content: `Fix every issue below and return the full corrected HTML file only.\n- ${[...problems, ...look.issues].join('\n- ')}` }], 'fix the issues'));
        publish();
        problems = checkSite(html, factText, names);
        look = await review();
      }

      // 4. Lighthouse on the live page (only when it's publicly reachable)
      const url = `${PUBLIC_URL}/s/${slug}`;
      let scores: Record<string, number> | undefined;
      if (!DRY) {
        try {
          job.log('auditor', 'lighthouse', `Lighthouse (mobile) on ${url}`);
          const r = await dataforseo<any>(job, 'on_page/lighthouse/live/json', { url, for_mobile: true, categories: ['performance', 'accessibility', 'best_practices', 'seo'] }, { agent: 'auditor', vendor: 'Lighthouse (DataForSEO via AIsa)', reason: 'score the live site', dry: () => [] });
          const cats = r?.[0]?.categories ?? {};
          scores = Object.fromEntries(Object.entries(cats).map(([k, v]: [string, any]) => [k, Math.round((v?.score ?? 0) * 100)]));
        } catch (e: any) { job.log('auditor', 'skip', `Lighthouse unavailable (${String(e?.message ?? e).slice(0, 60)})`); }
      }

      // 5. Deliver
      job.files.push({ name: `${slug}.zip`, content: zip([{ name: 'index.html', data: html }, ...assets.map((a) => ({ name: a.name, data: a.buf }))]) });
      for (const s of look.shots) job.files.push({ name: `${s.name}.jpg`, content: s.jpg });
      job.files.push({ name: 'index.html', content: html });
      job.deliverable = [
        `# Your website: ${spec.business}`,
        `**Live now:** [${url.replace(/^https?:\/\//, '')}](${url})\n\nThe download (\`${slug}.zip\`) has the page and its images, ready for any host. It's one HTML file, no build step.`,
        `## What's on it`,
        `- ${spec.sections.join('\n- ')}`,
        `- WhatsApp and call buttons${phone ? ` (${phone})` : ''}${place?.address ? `, a map of ${place.address}` : ''}${place?.hours ? ', opening hours' : ''}`,
        `- ${reviews.length ? `${reviews.length} real Google reviews, quoted exactly` : 'No testimonials: we only show real reviews, and none were found'}`,
        `- ${assets.filter((a) => a.name.startsWith('photo')).length ? `${assets.filter((a) => a.name.startsWith('photo')).length} of your own Instagram photos` : 'A generated hero image'}; search-ready title, description and business details for Google`,
        `## Checks`,
        `- Every phone number and price on the page was matched against your listing, your brief and your posts: ${problems.length ? `**${problems.length} still open:** ${problems.join('; ')}` : 'all matched'}.`,
        `- Design review of the phone and laptop screenshots: ${look.issues.length ? `open notes: ${look.issues.join('; ')}` : 'no problems found'}.`,
        scores ? `- Lighthouse (mobile): ${Object.entries(scores).map(([k, v]) => `${k.replace(/[-_]/g, ' ')} ${v}`).join(' · ')}` : '- Lighthouse: runs on the live page after publishing.',
        `## Changes`,
        `Ask for a revision on this order and say what to change (wording, colours, sections, photos). To use your own domain, point it at any static host and upload the zip.`,
      ].join('\n\n');
      job.qa = { verdict: problems.length ? 'revise' : 'pass', notes: [...problems, ...look.issues].join(' | ') || `site live at /s/${slug}`, model: `rules + ${MODELS.vision}` };
      job.status = 'delivered';
    } catch (e: any) {
      job.status = 'failed';
      job.error = String(e?.message ?? e);
      console.error('  ✗', job.error);
    }
    job.save();
    return job;
  },
};
