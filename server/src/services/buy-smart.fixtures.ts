// Dry-run fixtures for buy-smart.ts (OUTLAY_DRY=1): what the Researcher reads from the demo order, a Lagos
// kitchen buying 2 chest freezers and a deep fryer while talking to an Instagram seller and an Alaba shop.
// The offers come from best-price.fixtures.ts and the seller checks from vendor-check.fixtures.ts, so a
// demo run walks every path: a marketplace pick that needs no check, a pick from a shop we don't know, and
// RED, AMBER and GREEN sellers. Seller text is quoted from the brief when it is there, as the model is asked to.
// Any other brief gets Best Price's phone demo, plus whatever sellers it lists.
import { parse as phones } from './best-price.fixtures.ts';

const DEMO_SELLERS = [
  { text: '@frostking_ng on Instagram (Frost King Appliances), WhatsApp 0816 700 1122', name: 'Frost King Appliances', entity: 'company', location: 'Lagos', address: null, phone: '0816 700 1122', website: null, instagram: '@frostking_ng', tiktok: null, email: null, bankAccountName: null, quoted: null, claimedYears: null, detailsChanged: false },
  { text: 'Coolhouse Appliances, Alaba International Market, 0805 222 3344', name: 'Coolhouse Appliances', entity: 'company', location: 'Alaba International Market, Ojo, Lagos', address: 'Alaba International Market', phone: '0805 222 3344', website: null, instagram: null, tiktok: null, email: null, bankAccountName: null, quoted: null, claimedYears: null, detailsChanged: false },
];

/** The sellers named under "Sellers already considered:" (the order form's brief), else the demo pair. */
function sellersIn(brief: string) {
  const block = brief.match(/Sellers already considered:\n([\s\S]*?)(?:\n[A-Z][\w ]+:|$)/)?.[1];
  const lines = block?.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
  if (!lines.length) return /frost\s*king|coolhouse/i.test(brief) ? DEMO_SELLERS : [];
  return lines.map((text) => {
    const quoted = text.match(/quoted\s+₦\s?([\d,]+)/i)?.[1], changed = /new (bank|account)|changed (their|the) (bank|account)/i.test(text);
    const extra = { text, quoted: quoted ? { amount: Number(quoted.replace(/,/g, '')), currency: 'NGN' } : null, detailsChanged: changed };
    const demo = DEMO_SELLERS.find((d) => text.toLowerCase().includes(d.name.split(' ')[0].toLowerCase()) || (d.instagram && text.includes(d.instagram.slice(1))));
    const name = text.split(/[,;(]| - /)[0].trim();
    return demo ? { ...demo, ...extra } : { name: /^@/.test(name) ? null : name, entity: 'company', location: null, address: null, phone: text.match(/\+?\d[\d\s]{8,14}\d/)?.[0] ?? null, website: null, instagram: text.match(/@[\w.]{2,30}/)?.[0] ?? null, tiktok: null, email: null, bankAccountName: null, claimedYears: null, ...extra };
  });
}

export const parse = (brief: string) => /freezer|fryer/i.test(brief) || !/[a-z]/i.test(brief) ? JSON.stringify({
  items: [
    { name: 'Chest freezer, 300 L', query: '300L chest freezer', qty: 2, condition: 'new', mustHave: ['300 litres'], imageUrl: null, identify: false },
    { name: 'Deep fryer, double basket', query: 'double basket deep fryer', qty: 1, condition: 'new', mustHave: ['double basket'], imageUrl: null, identify: false },
  ],
  city: 'Surulere, Lagos', country: 'Nigeria', gl: 'ng', currency: 'NGN', budget: { amount: 900000, currency: 'NGN' },
  marketplaces: ['jumia.com.ng', 'konga.com', 'jiji.ng', 'slot.ng'],
  sellers: sellersIn(brief),
  wantsSanctions: /sanction|aml/i.test(brief),
}) : JSON.stringify({ ...JSON.parse(phones()), sellers: sellersIn(brief), wantsSanctions: /sanction|aml/i.test(brief) }); // anything else: Best Price's phone demo
