import { researchBrief } from './research-brief.ts';
import { localBusinessFinder } from './local-business-finder.ts';
import { leadList } from './lead-list.ts';
import type { Job } from '../job.ts';

export type Runnable = { id: string; name: string; priceUsd: number; run: (brief: string, opts?: { orderId?: string }) => Promise<Job> };

export const SERVICES: Record<string, Runnable> = {
  [researchBrief.id]: researchBrief,
  [localBusinessFinder.id]: localBusinessFinder,
  [leadList.id]: leadList,
};

/** The public menu. `live: false` services are shown as coming soon and can't be ordered yet. */
export const CATALOG = [
  {
    id: 'research-brief', name: 'Research Brief', dept: 'Research', live: true, priceUsd: 3, listedCostUsd: 0.2, etaMin: 6,
    tagline: 'Competitors, market and pricing, with every claim cited.',
    youGet: ['A 600–900 word brief with a 3-point summary', 'Every factual claim cited to a source you can open', 'Concrete recommendations', 'Checked by an independent auditor on a different AI model'],
    team: ['researcher', 'scout', 'reader', 'auditor', 'writer'],
    example: 'Competitors and pricing for a small bakery in Lekki, Lagos that wants to add cake delivery',
  },
  {
    id: 'local-business-finder', name: 'Local Business Finder', dept: 'Sales & Growth', live: true, priceUsd: 3, listedCostUsd: 0.1, etaMin: 3,
    tagline: 'Every business of a type in an area, with phone, website and rating.',
    youGet: ['A clean spreadsheet (CSV) of up to 60 businesses', 'Phone numbers normalised to +234', 'Filters like "no website" or "has a phone"', 'Checked by rules: no duplicates, every row complete, filter holds'],
    team: ['researcher', 'scout', 'verifier', 'analyst', 'auditor'],
    example: 'Every café and coffee shop in Lekki Phase 1 that has no website',
  },
  {
    id: 'lead-list', name: 'Lead List', dept: 'Sales & Growth', live: true, priceUsd: 5, listedCostUsd: 0.4, etaMin: 8,
    tagline: '25 verified business emails, each with a personalised first line.',
    youGet: ['Up to 25 leads with emails that passed a live deliverability check', 'Where each email came from (their own site or a finder)', 'One opening line per lead, written from real data', 'You send; we never cold-email for you'],
    team: ['researcher', 'scout', 'reader', 'verifier', 'writer', 'auditor'],
    example: '25 boutique hotels in Victoria Island, Lagos, for my bakery\'s weekly pastry delivery',
  },
  {
    id: 'content-pack', name: 'Content Pack', dept: 'Content & Creative', live: false, priceUsd: 4, listedCostUsd: 0.3, etaMin: 10,
    tagline: '7 posts in your voice, 3 images and a posting plan.',
    youGet: ['7 posts written from your own website', '3 on-brand images', 'A one-week posting plan'], team: ['researcher', 'writer', 'illustrator', 'auditor'], example: '',
  },
  {
    id: 'seo-audit', name: 'Website / SEO Audit', dept: 'Web & Tech', live: false, priceUsd: 3, listedCostUsd: 0.1, etaMin: 6,
    tagline: 'What is holding your site back, and the exact fixes.',
    youGet: ['A prioritised issue list', 'Rewritten titles and meta descriptions', 'Screenshots of what we saw'], team: ['reader', 'analyst', 'writer', 'auditor'], example: '',
  },
  {
    id: 'translation', name: 'Translation & Localisation', dept: 'Content & Creative', live: false, priceUsd: 2, listedCostUsd: 0.03, etaMin: 3,
    tagline: 'Into Pidgin, Yoruba, Igbo, Hausa, French or Swahili.',
    youGet: ['Your text in up to two languages', 'A second-model check of every line'], team: ['linguist', 'auditor'], example: '',
  },
  {
    id: 'grants-finder', name: 'Grants & Opportunities', dept: 'Research', live: false, priceUsd: 3, listedCostUsd: 0.15, etaMin: 6,
    tagline: 'Grants, accelerators, tenders and hackathons that fit you.',
    youGet: ['A shortlist with deadlines and eligibility', 'Links to apply'], team: ['scout', 'reader', 'researcher', 'auditor'], example: '',
  },
  {
    id: 'receipts-to-books', name: 'Receipts → Books', dept: 'Finance & Ops', live: false, priceUsd: 3, listedCostUsd: 0.1, etaMin: 5,
    tagline: 'Invoice and receipt PDFs into a spreadsheet and a real ledger.',
    youGet: ['A spreadsheet of every line item', 'A double-entry ledger file', 'We do for you what we do for ourselves'], team: ['bookkeeper', 'reader', 'auditor'], example: '',
  },
] as const;

export type CatalogItem = (typeof CATALOG)[number];
