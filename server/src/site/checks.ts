// Copy checks that don't need a model: phrases that mark AI filler, and any number or price in the
// model's copy that the sources don't contain (prices, years, counts are where invention shows up).
import type { Facts } from './facts.ts';
import { norm } from './facts.ts';
import type { Plan } from './plan.ts';

const SLOP: [RegExp, string][] = [
  [/nestled/i, 'nestled'], [/\belevat(e|es|ing)\b/i, 'elevate'], [/in the heart of/i, 'in the heart of'], [/look no further/i, 'look no further'],
  [/unparallel?ed/i, 'unparalleled'], [/second to none/i, 'second to none'], [/culinary (journey|experience|delight|adventure)/i, 'culinary journey'],
  [/a testament to/i, 'a testament to'], [/\bseamless(ly)?\b/i, 'seamless'], [/\bdelve\b/i, 'delve'], [/\bembark\b/i, 'embark'], [/\bunlock\b/i, 'unlock'],
  [/tapestry/i, 'tapestry'], [/world[- ]class/i, 'world-class'], [/state[- ]of[- ]the[- ]art/i, 'state-of-the-art'], [/one[- ]stop[- ]shop/i, 'one-stop shop'],
  [/cutting[- ]edge/i, 'cutting-edge'], [/\bwhere [a-z ]{3,24} meets? /i, 'where X meets Y'], [/taste ?buds/i, 'taste buds'], [/mouth[- ]?watering/i, 'mouth-watering'],
  [/\bindulge\b/i, 'indulge'], [/\bexquisite\b/i, 'exquisite'], [/crafted with (love|care|passion)/i, 'crafted with love'], [/\bpremier\b/i, 'premier'],
  [/\bbest in (town|lagos|abuja|the city|nigeria)\b/i, 'best in town'], [/\bnext level\b/i, 'next level'], [/\bunforgettable\b/i, 'unforgettable'],
  [/\bsymphony of\b/i, 'symphony of'], [/\bjourney\b/i, 'journey'], [/\bexperience the difference\b/i, 'experience the difference'],
];
const EMOJI = /\p{Extended_Pictographic}/u;

/** Every piece of copy the model wrote, with where it sits. */
export function copyOf(plan: Plan): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [
    { at: 'title', text: plan.title }, { at: 'description', text: plan.description }, { at: 'hero.eyebrow', text: plan.hero.eyebrow ?? '' },
    { at: 'hero.headline', text: plan.hero.headline }, { at: 'hero.sub', text: plan.hero.sub }, { at: 'whatsappText', text: plan.whatsappText },
  ];
  plan.sections.forEach((s, i) => {
    const p = `sections[${i}] (${s.kind})`;
    if ('title' in s && s.title) out.push({ at: `${p}.title`, text: s.title });
    if (s.kind === 'offer') { if (s.intro) out.push({ at: `${p}.intro`, text: s.intro }); s.items.forEach((x, j) => x.desc && out.push({ at: `${p}.items[${j}].desc`, text: x.desc })); }
    if (s.kind === 'about') out.push({ at: `${p}.body`, text: s.body });
    if (s.kind === 'steps') s.steps.forEach((x, j) => out.push({ at: `${p}.steps[${j}]`, text: `${x.title}. ${x.body}` }));
    if (s.kind === 'location' && s.note) out.push({ at: `${p}.note`, text: s.note });
    if (s.kind === 'faq') s.items.forEach((x, j) => out.push({ at: `${p}.items[${j}]`, text: `${x.q} ${x.a}` }));
    if (s.kind === 'cta') out.push({ at: `${p}`, text: `${s.headline} ${s.sub ?? ''}` });
  });
  return out.filter((c) => c.text.trim());
}

export function copyIssues(plan: Plan, f: Facts): string[] {
  const issues: string[] = [];
  const src = norm(`${f.sources} ${f.items.map((i) => `${i.name} ${i.price ?? ''} ${i.note ?? ''}`).join(' ')} ${f.hoursText ?? ''} ${f.reviews.map((r) => r.text).join(' ')} ${f.rating ?? ''} ${f.ratingCount ?? ''}`);
  for (const c of copyOf(plan)) {
    for (const [re, name] of SLOP) if (re.test(c.text)) issues.push(`${c.at} uses the filler phrase "${name}"; say something specific to this business instead`);
    if (EMOJI.test(c.text)) issues.push(`${c.at} has an emoji; remove it`);
    for (const m of c.text.matchAll(/(?:₦|N|\$)?\d[\d,.]*\s?(?:k|%|\+)?/g)) {
      const n = norm(m[0]).replace(/\s/g, '');
      if (!n || /^\d$/.test(n)) continue; // single digits ("3 steps") are fine
      if (!src.replace(/\s/g, '').includes(n.replace(/^n(?=\d)/, '₦'))) issues.push(`${c.at} says "${m[0].trim()}", which isn't in the sources; remove it or use a number the facts give`);
    }
  }
  return [...new Set(issues)];
}
