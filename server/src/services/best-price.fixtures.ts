// Dry-run fixtures for best-price.ts: a believable Lagos phone market built around whatever item is
// searched, so OUTLAY_DRY=1 walks every branch of the service: Google Shopping links that must be
// resolved to the store's own page, a price that changed on the page, an out-of-stock page, pages that
// need a browser (Exa's copy), a too-cheap unknown seller asking for a bank transfer, a used "swap" phone
// that only the auditor catches, list pages and a price guide to set aside, and imports priced in USD.

type Row = {
  seller: string; host: string; path: string; title: string; price: string; via: 'shopping' | 'local' | 'intl' | 'general';
  google?: boolean; delivery?: string; rating?: number; ratingCount?: number; snippet?: string; page?: string; copy?: string;
};

const markets = new Map<string, Row[]>();
const byUrl = new Map<string, Row>();
const urlOf = (r: Row) => `https://${r.host}${r.path}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ngn = (n: number) => `₦${n.toLocaleString('en-US')}`;
const ngnJumia = (n: number) => `₦ ${n.toLocaleString('en-US')}`;

function market(name: string): Row[] {
  const hit = markets.get(name);
  if (hit) return hit;
  // prices are a real Lagos snapshot for a Galaxy A16; any other item gets the same shape, scaled
  const scale = /a16/i.test(name) ? 1 : (20 + ([...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 60)) / 190;
  const p = (n: number) => Math.round((n * scale) / 100) * 100;
  const s = slug(name), n = name, id = p(189900) % 9973, brand = name.split(' ')[0];
  const usdAmazon = (p(189900) / 1055.06).toFixed(2), usdAli = (p(189900) / 1149.52).toFixed(2);
  const about = `\nProduct details\nThe ${name} has a 6.7-inch FHD+ Super AMOLED display, a 50MP main camera with 5MP ultra-wide and 2MP macro lenses, a 5000mAh battery with 25W fast charging, 4GB RAM and 128GB storage expandable by microSD up to 1.5TB. In the box: phone, USB-C cable, SIM ejector pin.\nSpecifications: Android 14 with One UI 6.1, dual SIM, 4G LTE, side fingerprint sensor, IP54 dust and splash resistance.`;
  const list: Row[] = [
    {
      seller: 'Jumia Nigeria', host: 'www.jumia.com.ng', path: `/${s}-6.7-4gb-ram-128gb-rom-android-14-black-${id}.html`, via: 'shopping',
      title: `${n} 6.7" 4GB RAM/128GB ROM Android 14 - Black`, price: ngn(p(189900)), delivery: '₦1,500 delivery', rating: 4.4, ratingCount: 212,
      page: `${n} 6.7" 4GB RAM/128GB ROM Android 14 - Black | Jumia Nigeria\nOfficial Store\nBrand: ${brand} | Similar products from ${brand}\n${ngnJumia(p(189900))}\n${ngnJumia(p(215000))}\n-12%\nIn stock\n+ shipping from ₦ 1,500 to LEKKI-AJAH (SANGOTEDO)\nAdd to cart\nDelivery & Returns\nChoose your location: Lagos, Lekki\nDoor Delivery\nDelivery Fees ₦ 1,500\nReady for delivery between 3 October and 6 October if you order within the next 5hrs 12mins\nReturn Policy: free return within 7 days for all eligible items\nSeller Information\n${brand} Official Store\n94% Seller Score\n18,204 Followers\nShipping speed: Excellent\nQuality Score: Excellent\nProduct details\n6.7-inch display, 5000mAh battery, 50MP triple camera, 4GB RAM, 128GB storage.\nCustomers also viewed\n${brand} phone, older model ${ngnJumia(p(164000))}\n${brand} phone, newer model ${ngnJumia(p(249900))}${about}`,
    },
    {
      seller: 'Konga', host: 'www.konga.com', path: `/product/${s}-4gb-ram-128gb-rom-light-green-${id + 1}`, via: 'local',
      title: `Buy ${n} (4GB RAM, 128GB ROM) - Light Green | Konga Online Shopping`, price: ngn(p(192500)),
      snippet: `${ngn(p(192500))}. ${n} 4GB RAM 128GB ROM, 6.7" display, 5000mAh. Pay on delivery in Lagos.`,
      page: `${n} (4GB RAM, 128GB ROM) - Light Green\nSold by: Konga Tech Hub\n${ngn(p(195000))}\n${ngn(p(210000))}\nYou save ${ngn(p(15000))}\nAvailable in stock\nAdd To Cart\nBuy Now\nDelivery\nLagos, Lekki: delivered in 2-4 working days. Delivery fee: ₦2,000\nSeller rating: 4.6/5 (1,208 ratings)\nPay on Delivery available${about}`,
    },
    {
      seller: 'Konga', host: 'www.konga.com', path: `/product/${s}-128gb-grade-a-swap-${id + 2}`, via: 'shopping',
      title: `${n} 128GB (Grade A Swap)`, price: ngn(p(152000)),
      page: `${n} 128GB (Grade A Swap)\nSold by: PhoneSwap NG\n${ngn(p(152000))}\nGrade A swap: fully tested, 95% battery health, no scratches. 7-day warranty.\nIn stock\nAdd To Cart\nDelivery fee: ₦2,500 (Lagos)\nSeller rating: 4.1/5 (86 ratings)${about}`,
    },
    {
      seller: 'Slot Systems Limited', host: 'slot.ng', path: `/${s}-128gb-4gb-ram-dual-sim`, via: 'shopping', google: true,
      title: `${n} 128GB 4GB RAM Dual SIM`, price: ngn(p(199000)), rating: 4.5, ratingCount: 64,
      page: `${n} 128GB 4GB RAM Dual SIM - Slot\n${ngn(p(199000))}\nIn Stock\nFree delivery within Lagos on orders above ₦50,000\nAdd to Cart\nPay small small with Slot Credit\nVisit any of our 80+ stores nationwide${about}`,
    },
    {
      seller: 'Pointek', host: 'pointekonline.com', path: `/product/${s}-128gb`, via: 'shopping',
      title: `${n} 128GB 4GB RAM`, price: ngn(p(195500)),
      page: `${n} 128GB 4GB RAM\n${ngn(p(195500))}\nOut of stock\nNotify me when available\nDelivery within Lagos ₦2,500\nPointek: Nigeria's gadget store since 2006${about}`,
    },
    {
      seller: '3CHub', host: '3chub.com', path: `/product/${s}-128gb-4gb`, via: 'shopping',
      title: `${n} (128GB/4GB)`, price: ngn(p(194000)), rating: 4.3, ratingCount: 31,
      page: `${n} (128GB/4GB)\n${ngn(p(194000))}\nIn stock\nAdd to cart\n12 months warranty\nCall 0700 3CHUB or visit our Ikeja showroom${about}`,
    },
    {
      seller: 'Kara', host: 'kara.com.ng', path: `/${s}-128gb`, via: 'shopping', google: true,
      title: `${n} - 128GB - 4GB RAM`, price: ngn(p(201000)), delivery: 'Free delivery',
      page: `${n} - 128GB - 4GB RAM\n${ngn(p(201000))}\nIn stock\nAdd to basket\nFree delivery in Lagos${about}`,
    },
    {
      seller: 'PhoneMart Deals', host: 'phonemart-deals.com.ng', path: `/${s}-brand-new-promo`, via: 'shopping',
      title: `${n} 128GB Brand New Sealed - Promo`, price: ngn(p(79000)),
      page: `${n} 128GB Brand New Sealed - PROMO\n${ngn(p(79000))}\n${ngn(p(195000))}\nOnly 3 left! In stock.\nTo confirm your order, pay via bank transfer to our account and send proof on WhatsApp: 0906 000 0000.\nNo pay on delivery.${about}`,
    },
    {
      seller: 'Jumia Nigeria', host: 'www.jumia.com.ng', path: `/${s}-shockproof-case-cover-${id + 3}.html`, via: 'shopping',
      title: `${n} Shockproof Case Cover`, price: ngn(p(3500)), rating: 4.0, ratingCount: 19,
    },
    {
      seller: 'Jiji', host: 'jiji.ng', path: `/ikeja/mobile-phones/${s}-128gb-black-uk-used-${id}.html`, via: 'local',
      title: `UK Used ${n} 128GB Black in Ikeja - Mobile Phones, Tunde Gadgets | Jiji.ng`, price: ngn(p(140000)),
      snippet: `${ngn(p(140000))}. UK used, very clean, 128GB, 4GB RAM, battery 91%. Call Tunde Gadgets.`,
    },
    {
      seller: 'Jiji', host: 'jiji.ng', path: `/lagos/mobile-phones/${s}`, via: 'local',
      title: `${n} in Lagos for sale ▷ Prices on Jiji.ng`, price: ngn(p(135000)),
      snippet: `${ngn(p(135000))} … ${ngn(p(186000))}. 57 ads for ${n} in Lagos. Buy new and used phones from verified sellers.`,
    },
    {
      seller: 'Jumia', host: 'www.jumia.com.ng', path: `/catalog/?q=${encodeURIComponent(n.toLowerCase()).replace(/%20/g, '+')}`, via: 'local',
      title: `${n} - Buy Online | Jumia Nigeria`, price: ngn(p(184500)),
      snippet: `Shop ${n} from ${ngnJumia(p(184500))} on Jumia. Pay on delivery, free returns.`,
    },
    {
      seller: 'Amazon', host: 'www.amazon.com', path: `/Samsung-${s}-International-Model/dp/B0DFQ${id}`, via: 'intl',
      title: `${n} 4G LTE (128GB + 4GB) International Model - Black : Amazon.com`, price: `$${usdAmazon}`,
      snippet: `$${usdAmazon}. ${n} 4G LTE, 128GB + 4GB, unlocked international model.`,
      page: 'To discuss automated access to Amazon data please contact api-services-support@amazon.com.',
      copy: `${n} 4G LTE (128GB + 4GB) International Model - Black\n$${usdAmazon}\n$52.37 Shipping & Import Charges to Nigeria\nIn Stock\nShips from Amazon.com\nSold by Amazon.com${about}`,
    },
    {
      seller: 'AliExpress', host: 'www.aliexpress.com', path: `/item/100500${id}7712.html`, via: 'intl',
      title: `${n} Global Version 4GB 128GB 6.7" Smartphone - AliExpress`, price: `US $${usdAli}`,
      snippet: `US $${usdAli}. ${n} Global Version, 4GB 128GB, Dual SIM. Free shipping.`,
      page: 'Aliexpress\nLoading...',
      copy: `${n} Global Version 4GB 128GB 6.7" Smartphone\nUS $${usdAli}\nFree shipping\nDelivery: Oct 28 - Nov 12\nSold by Mobile Global Store\n92.4% positive feedback\nAdd to cart${about}`,
    },
    {
      seller: 'Temu', host: 'www.temu.com', path: `/clear-shockproof-case-for-${s}-g-601099${id}.html`, via: 'intl',
      title: `Clear Shockproof Case for ${n} - Temu`, price: '$2.49', snippet: `$2.49. Clear TPU shockproof case for ${n}.`,
    },
    {
      seller: '3CHub', host: '3chub.com', path: `/product/${s}-128gb-4gb`, via: 'general',
      title: `${n} (128GB/4GB) - 3CHub`, price: ngn(p(194000)), snippet: `${ngn(p(194000))}. ${n} 128GB, 12 months warranty.`,
    },
    {
      seller: 'NaijaTechGuide', host: 'www.naijatechguide.com', path: `/${s}-price-in-nigeria.html`, via: 'general',
      title: `${n} Price in Nigeria (2026) & Specs - NaijaTechGuide`, price: ngn(p(175000)),
      snippet: `The ${n} sells for between ${ngn(p(175000))} and ${ngn(p(210000))} in Nigeria, depending on the store.`,
    },
  ];
  markets.set(name, list);
  for (const r of list) if (!byUrl.get(urlOf(r))?.page) byUrl.set(urlOf(r), r); // a search result must not hide the store's page
  return list;
}

const nameFrom = (q: string) => q.replace(/\s+(price|site:).*$/i, '').trim();
const gLink = (r: Row) => `https://www.google.com/search?ibp=oshop&q=${encodeURIComponent(r.title)}&prds=pid:${r.title.length}${r.price.length}`;

export const parse = () => JSON.stringify({
  items: [{ name: 'Samsung Galaxy A16', query: 'Samsung Galaxy A16', qty: 2, condition: 'new', mustHave: [], imageUrl: null, identify: false }],
  city: 'Lekki, Lagos', country: 'Nigeria', gl: 'ng', currency: 'NGN', budget: { amount: 400000, currency: 'NGN' },
  marketplaces: ['jumia.com.ng', 'konga.com', 'jiji.ng', 'slot.ng'],
});

export const shopping = (q: string) => ({
  searchParameters: { q, type: 'shopping', engine: 'google' },
  shopping: market(nameFrom(q)).filter((r) => r.via === 'shopping').map((r, i) => ({
    title: r.title, source: r.seller, link: r.google ? gLink(r) : `${urlOf(r)}?srsltid=AfmBOoq${i}`, price: r.price,
    ...(r.delivery ? { delivery: r.delivery } : {}), ...(r.rating ? { rating: r.rating, ratingCount: r.ratingCount } : {}),
    imageUrl: `https://encrypted-tbn0.gstatic.com/shopping?q=tbn:${i}`, productId: `${9000 + i}`, position: i + 1,
  })),
});

/** Organic Google results for one of the service's queries: local marketplaces, imports or the open web. */
export function google(q: string, name: string, kind: 'local' | 'intl' | 'general') {
  return {
    searchParameters: { q, type: 'search', engine: 'google' },
    organic: market(name).filter((r) => r.via === kind).map((r, i) => ({ title: r.title, link: urlOf(r), snippet: r.snippet ?? r.price, position: i + 1 })),
  };
}

/** The store's own page for a Google Shopping result: the search the Scout runs with site:<store>. */
export function resolve(title: string, domain: string | undefined) {
  const rows = [...byUrl.values()].filter((r) => r.title === title && (!domain || r.host.endsWith(domain)));
  return { organic: rows.map((r, i) => ({ title: `${r.title} - ${r.seller}`, link: urlOf(r), snippet: `${r.price}. ${r.title}.`, position: i + 1 })) };
}

export const fx = (from: string, to: string) => ({
  searchParameters: { q: `1 ${from} to ${to}` },
  answerBox: from === 'USD' && to === 'NGN' ? { title: '1 United States Dollar equals', answer: '1,538.20 Nigerian Naira' } : { answer: '1.00' },
  organic: [{ title: `${from} to ${to} - Wise`, link: 'https://wise.com/', snippet: `1 ${from} = 1,538.20 ${to} at the mid-market rate.` }],
});

export const lens = (name: string) => ({
  organic: market(name).filter((r) => r.via === 'shopping').slice(0, 3).map((r) => ({ title: r.title, source: r.seller, link: urlOf(r), price: r.price })),
});

/** APEX web-read: a plain fetch, so pages that need a browser (Amazon, AliExpress) come back thin. */
export function apex(urls: string[]) {
  const results = urls.map((u) => {
    const r = byUrl.get(u.replace(/\?srsltid=.*$/, ''));
    if (!r?.page) return { ok: false, url: u, error: 'fetch failed: 403' };
    return { ok: true, url: u, finalUrl: u, title: r.title, text: r.page, bytes: r.page.length * 9, truncated: false, ...(r.copy ? { thin: true } : {}) };
  });
  return { ok: true, paid: 0.003, data: { ok: true, requested: urls.length, fetched: results.filter((r) => r.ok).length, results } };
}

export function exa(urls: string[]) {
  return { results: urls.map((u) => byUrl.get(u)).filter((r): r is Row => !!r?.copy).map((r) => ({ url: urlOf(r), title: r.title, text: r.copy })) };
}

/** What a careful reader model would pull from each page (by pattern, not guessed). */
export function facts(pages: { id: string; text: string }[]) {
  const p: Record<string, unknown> = {};
  for (const { id, text } of pages) {
    const price = text.match(/(?:US \$|\$|₦)\s?[\d,]+(?:\.\d\d)?/)?.[0] ?? null;
    const out = /out of stock|sold out/i.test(text), inn = /in stock|add to (cart|basket)/i.test(text);
    const delivery = /free (delivery|shipping)/i.test(text) ? 'free'
      : text.match(/(?:delivery fees?:?|delivery within lagos)\s*(₦\s?[\d,]+)/i)?.[1] ?? text.match(/(\$[\d.,]+) shipping/i)?.[1] ?? null;
    p[id] = {
      price, inStock: out ? false : inn ? true : null, delivery,
      seller: text.match(/sold by:?\s*([^\n]+)/i)?.[1] ?? text.match(/seller information\n([^\n]+)/i)?.[1] ?? null,
      sellerScore: text.match(/(\d+% seller score)/i)?.[1] ?? text.match(/seller rating:?\s*([^\n]+)/i)?.[1] ?? text.match(/([\d.]+% positive feedback)/i)?.[1] ?? null,
      condition: text.match(/\b(used|refurbished)\b/i)?.[1]?.toLowerCase() ?? null,
      risk: /bank transfer/i.test(text) ? 'asks for payment by bank transfer before delivery, orders on WhatsApp only' : null,
    };
  }
  return JSON.stringify({ p });
}

/** The auditor knows the local trade terms the sorting step missed: a "swap" phone is a used trade-in. */
export function audit(cands: { id: string; title: string; excerpt: string; wanted: string }[]) {
  const reject = cands.filter((c) => c.wanted === 'new' && /\bswap\b/i.test(`${c.title} ${c.excerpt}`)).map((c) => ({ id: c.id, reason: '"Grade A Swap" is a used trade-in phone; customer asked for new' }));
  return JSON.stringify({ verdict: reject.length ? 'revise' : 'pass', reject, issues: [] });
}
