import { researchBrief } from './research-brief.ts';
import { localBusinessFinder } from './local-business-finder.ts';
import { leadList } from './lead-list.ts';
import { contentPack } from './content-pack.ts';
import { website } from './website.ts';
import { motionAd } from './motion-ad.ts';
import { videoAd } from './video-ad.ts';
import { aiAnswerAudit } from './ai-answer-audit.ts';
import { bestPrice } from './best-price.ts';
import { vendorCheck } from './vendor-check.ts';
import type { Job } from '../job.ts';

export type Runnable = { id: string; name: string; priceUsd: number; run: (brief: string, opts?: { orderId?: string }) => Promise<Job> };

export const SERVICES: Record<string, Runnable> = {
  [researchBrief.id]: researchBrief,
  [localBusinessFinder.id]: localBusinessFinder,
  [leadList.id]: leadList,
  [contentPack.id]: contentPack,
  [website.id]: website,
  [motionAd.id]: motionAd,
  [videoAd.id]: videoAd,
  [aiAnswerAudit.id]: aiAnswerAudit,
  [bestPrice.id]: bestPrice,
  [vendorCheck.id]: vendorCheck,
};

/** The public menu. `live: false` services are shown as coming soon and can't be ordered yet. */
export const CATALOG = [
  {
    id: 'ai-answer-audit', name: 'AI Answer Audit', dept: 'Growth Studio', live: true, priceUsd: 15, listedCostUsd: 2.8, etaMin: 10,
    tagline: 'What ChatGPT, Gemini, Claude and Perplexity tell your customers about you, and what they get wrong.',
    youGet: ['24 real answers: 6 customer questions put to ChatGPT, Gemini, Claude and Perplexity with web search on', 'Every wrong fact quoted word for word next to your real hours, prices and details', 'Who the AIs recommend instead of you, and the pages they cite', 'A prioritised fix list, checked by an independent auditor on a different AI model', 'Emailed to you with a spreadsheet of every answer'],
    team: ['researcher', 'scout', 'reader', 'investigator', 'analyst', 'auditor', 'writer', 'messenger'],
    example: 'Mama Put Kitchen, a restaurant in Yaba, Lagos. Website mamaputkitchen.ng',
  },
  {
    id: 'content-pack', name: 'Content Pack', dept: 'Growth Studio', live: true, priceUsd: 8, listedCostUsd: 1.1, etaMin: 6,
    tagline: 'What is working in your niche this week, and 7 posts built on it.',
    youGet: ['The content styles pulling views in your niche right now, each backed by real posts and their numbers', 'What your own account shows: what worked and what didn’t', '7 posts in your voice: hook, caption, CTA, hashtags, shot list', '3 designed images, ready to post', 'Checked: every example is real, no invented claims'],
    team: ['researcher', 'reader', 'scout', 'analyst', 'writer', 'illustrator', 'auditor', 'messenger'],
    example: 'Content for Tolu’s Small Chops in Lagos, Instagram @tolussmallchops',
  },
  {
    id: 'website', name: 'Website', dept: 'Growth Studio', live: true, priceUsd: 15, listedCostUsd: 0.7, etaMin: 6,
    tagline: 'A designed site built from your Google listing and Instagram, live today.',
    youGet: ['A site in one of 7 designed themes, in a colour taken from your own photos, live at a link today', 'Your menu or prices, real Google reviews and your best photos (flyers are left out)', 'WhatsApp on every screen, live "open now" hours, map and directions', 'Every price and phone number checked against your sources; reviewed on a phone and a laptop', 'Search-ready, and the files to host anywhere with your own domain'],
    team: ['researcher', 'scout', 'reader', 'analyst', 'illustrator', 'auditor', 'messenger'],
    example: 'A website for Tolu’s Small Chops in Surulere, Lagos. WhatsApp 0803 555 0142, Instagram @tolussmallchops',
  },
  {
    id: 'motion-ad', name: 'Motion Ad', dept: 'Growth Studio', live: true, priceUsd: 12, listedCostUsd: 0.9, etaMin: 10,
    tagline: 'A designer-grade motion video of your offer, with its own soundtrack.',
    youGet: ['A 12–24 s motion video, vertical for Reels, TikTok and Status (square or landscape on request)', 'One shape that morphs through your offer, every change driven by a tap, drag or hold', 'An original soundtrack composed from the video’s own timeline, no licensing', 'Every state reviewed for legibility before rendering', 'The editable scene file, so changes are cheap'],
    team: ['researcher', 'reader', 'producer', 'auditor', 'messenger'],
    example: 'A 16 second vertical ad for Tolu’s Small Chops: party trays, ₦25,000 for 20 guests, order on WhatsApp 0803 555 0142',
  },
  {
    id: 'video-ad', name: 'Video Ad', dept: 'Growth Studio', live: true, priceUsd: 15, listedCostUsd: 1.8, etaMin: 8,
    tagline: 'Your product photo, turned into an 8 s video ad with copy to paste.',
    youGet: ['An 8 s ad in 9:16 and 1:1, from your own product photo', 'A hook on screen, an end card with your call to action, and music', 'Hooks, primary text and headlines for Meta and TikTok', 'A still key visual that works as an image ad', 'Checked: no invented claims, frames reviewed before delivery'],
    team: ['researcher', 'scout', 'illustrator', 'producer', 'writer', 'auditor', 'messenger'],
    example: 'Video ad for my small chops party trays, ₦25,000 for 20 guests, order on WhatsApp 0803 555 0142. Photo: https://…',
  },
  {
    id: 'best-price', name: 'Best Price Finder', dept: 'Buying & Suppliers', live: true, priceUsd: 3, listedCostUsd: 0.15, etaMin: 5,
    tagline: 'Where to buy it cheapest, delivered, from a seller you can trust.',
    youGet: ['Best pick and runner-up for up to 5 items, with the delivered total in your currency', 'Prices re-checked on each seller’s own page, with stock and delivery fee', 'Scam flags: too-good-to-be-true prices, unknown sellers, bank-transfer-only pages', 'Checked by an independent auditor on a different AI model', 'A spreadsheet (CSV) of every offer we found, emailed to you'],
    team: ['researcher', 'scout', 'analyst', 'reader', 'auditor', 'writer', 'messenger'],
    example: 'Two Samsung Galaxy A16 phones, new, delivered to Lekki, Lagos. Budget ₦400k',
  },
  {
    id: 'vendor-check', name: 'Check Before You Pay', dept: 'Buying & Suppliers', live: true, priceUsd: 4, listedCostUsd: 0.5, etaMin: 4,
    tagline: 'About to pay a supplier or vendor upfront? Red, amber or green before the money leaves.',
    youGet: ['A RED / AMBER / GREEN verdict from fixed rules, with the rule that fired', 'Every signal cited: phone fraud checks, domain age, Google Maps, scam reports on Nairaland and Reddit, Instagram history', 'Sanctions screening when $500 or more is at stake', 'What to ask them before paying, and how to pay safely', 'Raw signals as a JSON file, emailed to you'],
    team: ['investigator', 'verifier', 'scout', 'reader', 'analyst', 'writer', 'auditor', 'messenger'],
    example: 'I want to pay ₦850,000 upfront to Gadget Plug NG for 5 iPhone 13s. Instagram @gadgetplug_ng, phone 0803 123 4567, shop in Computer Village Ikeja',
  },
  {
    id: 'local-business-finder', name: 'Local Business Finder', dept: 'Sales & Growth', live: true, priceUsd: 3, listedCostUsd: 0.2, etaMin: 3,
    tagline: 'Every business of a type in an area, with phone, website and rating.',
    youGet: ['A clean spreadsheet (CSV) of up to 60 businesses', 'Phone numbers normalised to +234', 'Filters like "no website" or "has a phone"', 'Checked by rules: no duplicates, every row complete, filter holds', 'Emailed to you with the spreadsheet attached'],
    team: ['researcher', 'scout', 'verifier', 'analyst', 'auditor', 'messenger'],
    example: 'Every café and coffee shop in Lekki Phase 1 that has no website',
  },
  {
    id: 'lead-list', name: 'Lead List', dept: 'Sales & Growth', live: true, priceUsd: 5, listedCostUsd: 0.5, etaMin: 8,
    tagline: '25 verified business emails, each with a personalised first line.',
    youGet: ['Up to 25 leads with emails that passed a live deliverability check', 'Where each email came from (their own site or a finder)', 'One opening line per lead, written from real data', 'You send; we never cold-email for you', 'Emailed to you with the spreadsheet attached'],
    team: ['researcher', 'scout', 'reader', 'verifier', 'writer', 'auditor', 'messenger'],
    example: '25 boutique hotels in Victoria Island, Lagos, for my bakery\'s weekly pastry delivery',
  },
  {
    id: 'research-brief', name: 'Research Brief', dept: 'Research', live: true, priceUsd: 3, listedCostUsd: 0.3, etaMin: 6,
    tagline: 'Competitors, market and pricing, with every claim cited.',
    youGet: ['A 600–900 word brief with a 3-point summary', 'Every factual claim cited to a source you can open', 'Concrete recommendations', 'Checked by an independent auditor on a different AI model', 'Emailed to you when it is done'],
    team: ['researcher', 'scout', 'reader', 'auditor', 'writer', 'messenger'],
    example: 'Competitors and pricing for a small bakery in Lekki, Lagos that wants to add cake delivery',
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
