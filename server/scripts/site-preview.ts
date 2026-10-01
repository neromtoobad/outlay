// node scripts/site-preview.ts <fixture.json> <outdir> [theme] [hero]
// Renders a customer site from a fixture (facts + photos + plan) without any paid calls, then takes
// phone and laptop screenshots. For working on the site engine's design.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { renderSite } from '../src/site/engine.ts';
import { parseHours } from '../src/site/facts.ts';
import { prepPhoto } from '../src/site/photos.ts';
import { validatePlan } from '../src/site/plan.ts';
import { screenshots } from '../src/browser.ts';

const [file, out, theme, hero] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(out, { recursive: true });
const facts = { ...fx.facts, hours: parseHours(fx.facts.hoursText) };
const photos = [];
for (const p of fx.photos) {
  try {
    const { buf, w, h } = await prepPhoto(readFileSync(resolve(dirname(file), p.path)), p.id === fx.plan.hero.photo ? 1800 : 1100);
    writeFileSync(join(out, `${p.id}.jpg`), buf);
    photos.push({ ...p, file: `${p.id}.jpg`, w, h });
  } catch (e) { console.log('skip photo', p.id, String(e).slice(0, 80)); }
}
const raw = { ...fx.plan, ...(theme ? { theme } : {}), hero: { ...fx.plan.hero, ...(hero ? { variant: hero } : {}) } };
const { plan, notes } = validatePlan(raw, facts, photos, [fx.plan.brand]);
if (notes.length) console.log('plan notes:', notes);
const site = renderSite(plan, facts, photos, { url: 'https://hiresyncly.site/s/preview' });
writeFileSync(join(out, 'index.html'), site.html);
console.log('html', (site.html.length / 1024).toFixed(1), 'KB');
const shots = await screenshots(join(out, 'index.html'), [{ name: 'phone', width: 390, height: 844, full: true }, { name: 'laptop', width: 1366, height: 860, full: true }]);
for (const s of shots) writeFileSync(join(out, `${s.name}.png`), s.png);
process.exit(0);
