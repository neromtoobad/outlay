// Dry-mode fixtures for vendor-check (OUTLAY_DRY=1). Three demo payees so every verdict path runs without
// paying: "Gadget Plug NG" (an Instagram phone vendor → RED), "Mainland Bakery Supplies" (an established
// wholesaler → GREEN), and anyone else (thin evidence → AMBER). Shapes mirror the real sellers' responses.
// Buy Smart's demo order adds three appliance sellers: "Frost King Appliances" (@frostking_ng, a young,
// renamed Instagram account named in a Nairaland report → RED), "Coolhouse Appliances" (an Alaba market
// shop whose Google Maps listing shows another number → AMBER) and "Chef's Corner Equipment" (a Surulere
// showroom with a 2019 domain → GREEN).
export type Scenario = 'risky' | 'clean' | 'thin' | 'frostking' | 'coolhouse' | 'chefscorner';
export const scenarioOf = (brief: string): Scenario => (/gadget\s*plug/i.test(brief) ? 'risky' : /mainland bakery/i.test(brief) ? 'clean'
  : /frost\s*king/i.test(brief) ? 'frostking' : /cool\s*house/i.test(brief) ? 'coolhouse' : /chef'?s\s*corner|chefscorner/i.test(brief) ? 'chefscorner' : 'thin');

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const unix = (d: number) => Math.floor((Date.now() - d * 86400_000) / 1000);

const NAIRALAND_REPORT = 'https://www.nairaland.com/8123456/beware-gadget-plug-ng-instagram';
const NAIRALAND_LIST = 'https://www.nairaland.com/8130021/computer-village-phone-vendors-avoid-2026';
const REDDIT_Q = 'https://www.reddit.com/r/Nigeria/comments/1ntq2x9/anyone_bought_from_gadgetplug_ng_on_ig/';
const NAIRALAND_GOOD = 'https://www.nairaland.com/7998412/where-buy-baking-flour-bulk-lagos';
const NAIRALAND_FROST = 'https://www.nairaland.com/8156602/paid-frost-king-appliances-freezers-nothing-delivered';
const NAIRALAND_FREEZERS = 'https://www.nairaland.com/8044310/where-buy-chest-freezers-lagos';
const DIRECTORY_COOLHOUSE = 'https://www.vconnect.example/coolhouse-appliances-alaba';
const NAIRALAND_CHEF = 'https://www.nairaland.com/8090127/where-restaurants-buy-kitchen-equipment-lagos';

const PAGES: Record<string, string> = {
  'https://gadgetplugng.com': "Gadget Plug NG | UK Used & Brand New iPhones in Lagos. Lagos' trusted iPhone plug since 2016. Over 10,000 happy customers nationwide. iPhone 13 128GB UK used ₦390,000. iPhone 13 Pro ₦520,000. Order now: call or WhatsApp 0803 123 4567. Full payment before dispatch. No refunds after payment.",
  'https://gadgetplugng.com/contact': 'Contact Gadget Plug NG. Call/WhatsApp: 0803 123 4567. Location: Computer Village, Ikeja, Lagos. We deliver nationwide within 24 hours after payment is confirmed.',
  [NAIRALAND_REPORT]: "Beware Of Gadget Plug NG (@gadgetplug_ng) On Instagram - Crime - Nairaland. Posted by lagosbuyer22: I paid ₦620,000 to them in August for four iPhone 12 Pro after seeing their page. The number they gave me was 0803 123 4567. After payment they said the phones were held at customs and asked for another ₦85,000 clearing fee, then they blocked me on WhatsApp. The account name I paid into was not the business name. Reply by tunde_ikj: Same thing happened to my cousin in July, same WhatsApp number. They changed the IG name before.",
  [NAIRALAND_LIST]: 'Computer Village Phone Scams: IG Vendors To Avoid (2026). Collected from members: @gadgetplug_ng collects full payment and blocks you, uses 0803 123 4567 on WhatsApp. Always buy inside the plaza and test the phone before you pay.',
  [REDDIT_Q]: 'r/Nigeria: Has anyone bought from gadgetplug_ng on IG? Their iPhone 13 is about ₦80k below other sellers. Is it legit? Comment: Never bought from them, but prices that low for iPhones should make you careful.',
  'https://mainlandbakerysupplies.com': 'Mainland Bakery Supplies Ltd. Wholesale flour, sugar, yeast, margarine and baking equipment for Lagos bakeries since 2014. Warehouse and showroom: 12 Ijora Causeway, Ijora, Lagos. Call 0802 555 0198 (Mon to Sat, 8am to 6pm). RC 1182734.',
  'https://mainlandbakerysupplies.com/contact': 'Visit us at 12 Ijora Causeway, Ijora, Lagos. Phone: 0802 555 0198. Email: sales@mainlandbakerysupplies.com. Please pay only into our corporate account in the name Mainland Bakery Supplies Ltd.',
  'https://mainlandbakerysupplies.com/about': 'Family-run since 2014, we supply more than 300 bakeries across Lagos and Ogun with flour, sugar and equipment.',
  [NAIRALAND_GOOD]: 'Where To Buy Baking Flour In Bulk In Lagos? - Business - Nairaland. Reply by ovenfreshng: Mainland Bakery Supplies at Ijora has been reliable for us for 4 years, they deliver on time and their invoices always match what arrives. Call them on 0802 555 0198.',
  [NAIRALAND_FROST]: 'Paid Frost King Appliances (@frostking_ng) For Freezers, Nothing Delivered - Business - Nairaland. Posted by surulere_caterer: I paid ₦410,000 to @frostking_ng in July for two chest freezers after seeing their Instagram page. Their WhatsApp is 0816 700 1122. After payment they said the freezers were held at the port and asked for ₦45,000 more for clearing, then they blocked me. Reply by bimbo_events: Same page sold my sister a fridge in June under another name.',
  [NAIRALAND_FREEZERS]: 'Where To Buy Chest Freezers In Lagos? - Business - Nairaland. Reply by ikotun_chops: I bought two Hisense freezers from Coolhouse Appliances in Alaba last year and they delivered on time to Ikotun. Ask for their shop in Block C. Reply by mama_t: Alaba is cheaper than the malls but inspect before you pay.',
  [DIRECTORY_COOLHOUSE]: 'Coolhouse Appliances - Alaba International Market, Ojo, Lagos. Home appliances: freezers, fridges, air conditioners, generators. Phone: 0805 222 3344. Block C, Shop 14, Alaba International Market.',
  [NAIRALAND_CHEF]: 'Where Do Restaurants Buy Kitchen Equipment In Lagos? - Food - Nairaland. Reply by suya_spot_ikeja: We got our fryers and shawarma grill from Chef\'s Corner Equipment in Surulere, they deliver on time and the warranty was honoured when a thermostat failed. Reply by owambe_kitchen: Their showroom is on Western Avenue.',
  'https://chefscornerng.com': "Chef's Corner Equipment | Commercial kitchen equipment for restaurants and caterers in Lagos since 2019. Deep fryers, ovens, griddles, shawarma grills and cold rooms. Showroom: 27 Western Avenue, Surulere, Lagos. Call 0909 555 2810. Pay on delivery within Lagos.",
  'https://chefscornerng.com/contact': "Contact Chef's Corner Equipment. Showroom: 27 Western Avenue, Surulere, Lagos (Monday to Saturday, 9am to 6pm). Phone: 0909 555 2810. Email: sales@chefscornerng.com. We deliver within Lagos in 1-2 working days.",
  'https://chefscornerng.com/about': "Chef's Corner Equipment Ltd (RC 1543210) supplies and services commercial kitchen equipment for restaurants, hotels and caterers across Lagos. Every machine comes with a written warranty and a technician visit for installation.",
};

const hit = (link: string, title: string, snippet: string, date?: string) => ({ title, link, snippet, ...(date ? { date } : {}) });

export const fx = {
  parse(s: Scenario, brief: string): string {
    if (s === 'risky') return JSON.stringify({ name: 'Gadget Plug NG', entity: 'company', country: 'NG', location: 'Computer Village, Ikeja, Lagos', address: 'Computer Village, Ikeja, Lagos', phone: '0803 123 4567', website: 'gadgetplugng.com', instagram: '@gadgetplug_ng', tiktok: null, email: null, bankAccountName: null, wallet: null, amount: 850000, currency: 'NGN', purpose: '5 iPhone 13s', claimedYears: null, detailsChanged: false, wantsSanctions: false });
    if (s === 'clean') return JSON.stringify({ name: 'Mainland Bakery Supplies Ltd', entity: 'company', country: 'NG', location: 'Ijora, Lagos', address: '12 Ijora Causeway, Lagos', phone: '0802 555 0198', website: 'mainlandbakerysupplies.com', instagram: null, tiktok: null, email: null, bankAccountName: 'Mainland Bakery Supplies Ltd', wallet: null, amount: 1200, currency: 'USD', purpose: '40 bags of flour', claimedYears: null, detailsChanged: false, wantsSanctions: false });
    if (s === 'frostking') return JSON.stringify({ name: 'Frost King Appliances', entity: 'company', country: 'NG', location: 'Lagos', address: null, phone: '0816 700 1122', website: null, instagram: '@frostking_ng', tiktok: null, email: null, bankAccountName: null, wallet: null, amount: null, currency: 'NGN', purpose: 'chest freezers', claimedYears: null, detailsChanged: false, wantsSanctions: false });
    if (s === 'coolhouse') return JSON.stringify({ name: 'Coolhouse Appliances', entity: 'company', country: 'NG', location: 'Alaba International Market, Ojo, Lagos', address: 'Alaba International Market', phone: '0805 222 3344', website: null, instagram: null, tiktok: null, email: null, bankAccountName: null, wallet: null, amount: null, currency: 'NGN', purpose: 'chest freezers', claimedYears: null, detailsChanged: false, wantsSanctions: false });
    if (s === 'chefscorner') return JSON.stringify({ name: "Chef's Corner Equipment", entity: 'company', country: 'NG', location: 'Surulere, Lagos', address: null, phone: null, website: 'chefscornerng.com', instagram: null, tiktok: null, email: null, bankAccountName: null, wallet: null, amount: null, currency: 'NGN', purpose: 'a deep fryer', claimedYears: null, detailsChanged: false, wantsSanctions: false });
    const name = brief.match(/(?:[Pp]ay(?:ing)?|[Tt]o|[Ff]rom|[Cc]heck|[Ii]s)\s+((?:[A-Z][a-z][\w&'.-]*\s?){1,4})/)?.[1]?.trim() ?? null;
    const bankAccountName = brief.match(/pay into ([A-Z][a-z]+ [A-Z][a-z]+)/)?.[1] ?? null;
    const country = /\+44|£|\.co\.uk/.test(brief) ? 'GB' : 'NG';
    return JSON.stringify({ name, entity: 'company', country, location: country === 'GB' ? 'London' : 'Lagos', purpose: brief.match(/\bfor ([^?.]+)/)?.[1] ?? 'goods', bankAccountName, detailsChanged: /new (bank|account|payment) details|changed (their|the) (bank|account)/i.test(brief), wantsSanctions: /sanction/i.test(brief) });
  },

  phone(s: Scenario, e164: string) {
    const [cc, iso] = e164.startsWith('+44') ? ['44', 'GB'] : e164.startsWith('+1') ? ['1', 'US'] : ['234', 'NG'];
    const base = { calling_country_code: cc, country_code: iso, phone_number: e164, national_format: '0' + e164.slice(1 + cc.length), valid: true, validation_errors: [] };
    const unsupported = { error_code: 60606 };
    if (s === 'risky') return { result: { ...base, line_type_intelligence: { type: 'mobile', carrier_name: 'MTN Nigeria', mobile_country_code: '621', mobile_network_code: '30', error_code: null }, sim_swap: { last_sim_swap: null, ...unsupported }, call_forwarding: { call_forwarding_status: true, error_code: null } } };
    if (s === 'clean') return { result: { ...base, line_type_intelligence: { type: 'mobile', carrier_name: 'Airtel Nigeria', mobile_country_code: '621', mobile_network_code: '20', error_code: null }, sim_swap: { last_sim_swap: { last_sim_swap_date: '2021-06-02T09:12:00Z', swapped_period: 'PT24H', swapped_in_period: false }, error_code: null }, call_forwarding: { call_forwarding_status: false, error_code: null } } };
    if (s === 'frostking' || s === 'coolhouse') return { result: { ...base, line_type_intelligence: { type: 'mobile', carrier_name: s === 'frostking' ? 'Globacom Nigeria' : 'MTN Nigeria', mobile_country_code: '621', mobile_network_code: s === 'frostking' ? '50' : '30', error_code: null }, sim_swap: { last_sim_swap: null, ...unsupported }, call_forwarding: { call_forwarding_status: false, error_code: null } } };
    return { result: { ...base, line_type_intelligence: { type: 'mobile', carrier_name: 'Airtel Nigeria', error_code: null }, sim_swap: { last_sim_swap: null, ...unsupported }, call_forwarding: { call_forwarding_status: null, ...unsupported } } };
  },

  rdap(s: Scenario, domain: string) {
    if (s === 'risky') return { created: daysAgo(21), registrar: 'Example Registrar, Inc.', status: ['client transfer prohibited'] };
    if (s === 'clean') return { created: '2014-03-11T10:22:31Z', registrar: 'Example Registrar Ltd', status: ['client transfer prohibited'] };
    if (s === 'chefscorner') return { created: '2019-05-14T08:03:11Z', registrar: 'Example Registrar Ltd', status: ['client transfer prohibited'] };
    return { notFound: true };
  },

  whois: (_s: Scenario, _domain: string) => [{ total_count: 0, items_count: 0, items: [] }],

  search(s: Scenario, q: string) {
    const organic: ReturnType<typeof hit>[] = [];
    const has = (re: RegExp) => re.test(q);
    if (s === 'risky') {
      const report = hit(NAIRALAND_REPORT, 'Beware Of Gadget Plug NG (@gadgetplug_ng) On Instagram - Crime - Nairaland', 'I paid ₦620,000 to them in August for four iPhone 12 Pro ... The number they gave me was 0803 123 4567 ... then they blocked me on WhatsApp.', 'Aug 29, 2026');
      const list = hit(NAIRALAND_LIST, 'Computer Village Phone Scams: IG Vendors To Avoid (2026) - Nairaland', '@gadgetplug_ng collects full payment and blocks you, uses 0803 123 4567 on WhatsApp ...', 'Sep 14, 2026');
      const reddit = hit(REDDIT_Q, 'Has anyone bought from gadgetplug_ng on IG? : r/Nigeria', 'Their iPhone 13 is about ₦80k below other sellers. Is it legit?', 'Sep 3, 2026');
      if (has(/nairaland/)) organic.push(report, list);
      else if (has(/reddit/)) organic.push(reddit);
      else if (has(/8031234567|0803 123 4567/)) organic.push(report, list, hit('https://www.instagram.com/gadgetplug_ng/', 'Gadget Plug NG (@gadgetplug_ng) • Instagram photos and videos', '48.2K Followers, 12 Following, 9 Posts - UK used & brand new iPhones'));
      else if (has(/scam/)) organic.push(report, hit('https://techcabal.example/2026/05/spot-fake-iphone-sellers-instagram', 'How to spot fake iPhone sellers on Instagram in Lagos', 'Prices far below market, pressure to pay in full, no physical shop you can visit ...'), reddit);
      else organic.push(hit('https://www.instagram.com/gadgetplug_ng/', 'Gadget Plug NG (@gadgetplug_ng)', 'UK used & brand new iPhones. Since 2016.'), hit('https://www.scamadviser.com/check-website/gadgetplugng.com', 'gadgetplugng.com Reviews: is it a scam or legit?', 'gadgetplugng.com has a low trust score. The domain was registered recently.'));
    } else if (s === 'clean') {
      const good = hit(NAIRALAND_GOOD, 'Where To Buy Baking Flour In Bulk In Lagos? - Business - Nairaland', 'Mainland Bakery Supplies at Ijora has been reliable for us for 4 years, they deliver on time ...', 'Mar 2, 2026');
      if (has(/nairaland/)) organic.push(good);
      else if (has(/reddit/)) organic.push();
      else if (has(/8025550198|0802 555 0198/)) organic.push(hit('https://mainlandbakerysupplies.com/contact', 'Contact | Mainland Bakery Supplies Ltd', 'Phone: 0802 555 0198. 12 Ijora Causeway, Ijora, Lagos.'), hit('https://lagosbusinessdirectory.example/ijora/mainland-bakery-supplies-ltd', 'Mainland Bakery Supplies Ltd, Ijora - Lagos Business Directory', 'Bakery equipment supplier · 12 Ijora Causeway · 0802 555 0198'), good);
      else if (has(/scam/)) organic.push(good, hit('https://bakingnaija.example/avoid-fake-flour-suppliers', 'How to avoid fake flour suppliers in Lagos', 'Always visit the warehouse, ask for a CAC number and never pay a personal account ...'));
      else organic.push(hit('https://mainlandbakerysupplies.com', 'Mainland Bakery Supplies Ltd | Wholesale baking supplies Lagos', 'Wholesale flour, sugar, yeast and baking equipment since 2014.'));
    } else if (s === 'frostking') {
      const report = hit(NAIRALAND_FROST, 'Paid Frost King Appliances (@frostking_ng) For Freezers, Nothing Delivered - Nairaland', 'I paid ₦410,000 to @frostking_ng in July for two chest freezers ... Their WhatsApp is 0816 700 1122 ... then they blocked me.', 'Sep 7, 2026');
      const page = hit('https://www.instagram.com/frostking_ng/', 'Frost King Appliances (@frostking_ng) • Instagram photos and videos', '21.4K Followers, 9 Following, 11 Posts - Brand new freezers, fridges & ACs at factory prices');
      if (has(/nairaland/)) organic.push(report);
      else if (has(/reddit/)) organic.push();
      else if (has(/8167001122|0816 700 1122/)) organic.push(report, page);
      else if (has(/scam/)) organic.push(report, hit('https://techcabal.example/2026/06/instagram-appliance-sellers-lagos', 'How to buy appliances from Instagram sellers in Lagos without getting burnt', 'Factory prices, pay-before-delivery and no shop address are the signs to slow down ...'));
      else organic.push(page);
    } else if (s === 'coolhouse') {
      const good = hit(NAIRALAND_FREEZERS, 'Where To Buy Chest Freezers In Lagos? - Business - Nairaland', 'I bought two Hisense freezers from Coolhouse Appliances in Alaba last year and they delivered on time ...', 'Feb 11, 2026');
      const directory = hit(DIRECTORY_COOLHOUSE, 'Coolhouse Appliances, Alaba International Market - VConnect', 'Home appliances · Block C, Shop 14, Alaba International Market · 0805 222 3344');
      if (has(/nairaland/)) organic.push(good);
      else if (has(/reddit/)) organic.push();
      else if (has(/8052223344|0805 222 3344/)) organic.push(directory);
      else if (has(/scam/)) organic.push(hit('https://lagosshopping.example/alaba-market-buying-guide', 'Buying at Alaba market: how to avoid fake goods (2026)', 'Inspect the carton, test the item in the shop and pay at the counter ...'));
      else organic.push(directory);
    } else if (s === 'chefscorner') {
      const good = hit(NAIRALAND_CHEF, 'Where Do Restaurants Buy Kitchen Equipment In Lagos? - Food - Nairaland', "We got our fryers and shawarma grill from Chef's Corner Equipment in Surulere, they deliver on time ...", 'May 20, 2026');
      if (has(/nairaland/)) organic.push(good);
      else if (has(/reddit/)) organic.push();
      else if (has(/scam/)) organic.push(hit('https://bakingnaija.example/buying-commercial-kitchen-equipment', 'Buying commercial kitchen equipment in Lagos: a checklist', 'Visit the showroom, test the machine and get the warranty in writing ...'));
      else organic.push(hit('https://chefscornerng.com', "Chef's Corner Equipment | Commercial kitchen equipment Lagos", 'Deep fryers, ovens, griddles and cold rooms. Showroom in Surulere.'));
    } else {
      organic.push(hit('https://lagosshopping.example/where-to-buy-lace', 'Where to buy quality lace fabric in Lagos (2026 guide)', 'Balogun, Tejuosho and Instagram vendors compared ...'));
    }
    return { organic };
  },

  places(s: Scenario, q: string) {
    if (s === 'clean') return { places: [{ position: 1, title: 'Mainland Bakery Supplies Ltd', address: '12 Ijora Causeway, Ijora 102273, Lagos', latitude: 6.4679, longitude: 3.3685, rating: 4.4, ratingCount: 213, category: 'Bakery equipment supplier', phoneNumber: '0802 555 0198', website: 'https://mainlandbakerysupplies.com/', cid: '12417360385122203001' }] };
    if (s === 'risky') return { places: ['Otigba Gadgets World', 'Ikeja Phones Hub', 'Computer Village Mobile Plaza'].map((title, i) => ({ position: i + 1, title, address: `${12 + i} Otigba Street, Computer Village, Ikeja, Lagos`, rating: 4.1 + i / 10, ratingCount: 30 + i * 17, category: 'Cell phone store', phoneNumber: `0809 44${i} 20${i}1`, cid: `99021${i}` })) };
    if (s === 'frostking') return { places: ['Kingsway Home Appliances', 'Polar Cool Appliances', 'Ikeja Appliance Centre'].map((title, i) => ({ position: i + 1, title, address: `${3 + i * 7} Allen Avenue, Ikeja, Lagos`, rating: 4.0 + i / 10, ratingCount: 22 + i * 9, category: 'Appliance store', phoneNumber: `0803 61${i} 40${i}2`, cid: `77310${i}` })) };
    if (s === 'coolhouse') return { places: [{ position: 1, title: 'Coolhouse Appliances', address: 'Block C, Shop 14, Alaba International Market, Ojo, Lagos', latitude: 6.4627, longitude: 3.1876, rating: 4.2, ratingCount: 37, category: 'Appliance store', phoneNumber: '0803 909 1100', cid: '15530218741190023001' }] };
    if (s === 'chefscorner') return { places: [{ position: 1, title: "Chef's Corner Equipment", address: '27 Western Avenue, Surulere, Lagos', latitude: 6.4969, longitude: 3.3532, rating: 4.6, ratingCount: 52, category: 'Restaurant supply store', phoneNumber: '0909 555 2810', website: 'https://chefscornerng.com/', cid: '9927301184451200077' }] };
    return { places: [{ position: 1, title: `Fabric shop near ${q.split(' ').slice(-1)[0]}`, address: 'Balogun Market, Lagos Island', rating: 4, ratingCount: 8, category: 'Fabric store' }] };
  },

  voygr(s: Scenario) {
    if (s === 'clean' || s === 'coolhouse' || s === 'chefscorner') return { existence_status: 'exists', open_closed_status: 'open' };
    if (s === 'risky') return { existence_status: 'not_exists', open_closed_status: 'uncertain' };
    return { existence_status: 'uncertain', open_closed_status: 'uncertain' };
  },

  pages: (_s: Scenario, urls: string[]) => ({
    pages: urls.map((url) => (PAGES[url.replace(/\/$/, '')] ? { url, title: url, text: PAGES[url.replace(/\/$/, '')] } : { url, title: url, text: '', error: 'HTTP 404' })),
  }),

  igProfile(s: Scenario, handle: string) {
    const posts = (n: number, spanDays: number) => Array.from({ length: Math.min(n, 12) }, (_, i) => ({ node: { id: String(3600000000 + i), taken_at_timestamp: unix(1 + Math.round((i * spanDays) / Math.max(1, Math.min(n, 12) - 1))), edge_liked_by: { count: 40 + i * 3 }, edge_media_to_comment: { count: 2 + (i % 4) } } }));
    if (s === 'frostking') return { success: true, data: { user: { username: handle, full_name: 'Frost King Appliances', biography: 'Brand new freezers, fridges & ACs at factory prices | Lagos | Nationwide delivery | WhatsApp 0816 700 1122 | Pay before delivery', external_url: '', edge_followed_by: { count: 21400 }, edge_follow: { count: 9 }, is_private: false, is_verified: false, is_business_account: true, category_name: 'Home goods store', business_address_json: null, edge_owner_to_timeline_media: { count: 11, edges: posts(11, 40) } } } };
    if (s === 'risky') return { success: true, data: { user: { username: handle, full_name: 'Gadget Plug NG', biography: 'UK used & brand new iPhones | Computer Village Ikeja | Since 2016 | WhatsApp 0803 123 4567 | No refund after payment', external_url: 'https://gadgetplugng.com', edge_followed_by: { count: 48200 }, edge_follow: { count: 12 }, is_private: false, is_verified: false, is_business_account: true, category_name: 'Electronics store', business_address_json: null, edge_owner_to_timeline_media: { count: 9, edges: posts(9, 26) } } } };
    return { success: true, data: { user: { username: handle, full_name: 'Bola Fabrics', biography: 'Lace, Ankara & aso-oke | Balogun Market | Nationwide delivery', external_url: '', edge_followed_by: { count: 1240 }, edge_follow: { count: 310 }, is_private: false, is_verified: false, is_business_account: true, category_name: 'Clothing store', edge_owner_to_timeline_media: { count: 85, edges: posts(85, 60) } } } };
  },
  igAbout: (s: Scenario) => ({ code: 200, data: s === 'risky' ? { date_joined: 'March 2019', country: 'Nigeria' } : s === 'frostking' ? { date_joined: 'May 2026', country: 'Nigeria' } : { date_joined: 'June 2025', country: 'Nigeria' } }),
  igFormer: (s: Scenario, handle: string) => ({ code: 200, data: { username: handle, former_username_count: s === 'risky' ? 4 : s === 'frostking' ? 3 : 0, has_former_usernames: s === 'risky' || s === 'frostking' } }),

  aml(s: Scenario, name: string, entity: string) {
    const hits = s === 'clean'
      ? [{ id: 'fx1', caption: 'Mainland Supplies Trading LLC', match_score: 61, risk_score: 70, review_status: 'False Positive', datasets: ['Sanctions'], sanction_matches: [{ list_name: 'Example consolidated list', matched_name: 'Mainland Supplies Trading LLC' }], pep_matches: [], warning_matches: [], adverse_media_matches: [] }]
      : [];
    return { request_id: 'dry-aml', aml: { status: 'Approved', total_hits: hits.length, entity_type: entity, score: 0, hits, screened_data: { full_name: name }, warnings: [] } };
  },

  // Labels the way the Analyst model is asked to, from plain keyword cues, quoting a sentence verbatim.
  label(sources: { i: number; text: string }[]): string {
    return JSON.stringify({
      labels: sources.map(({ i, text: all }) => {
        // the text is "title\nbody"; quote from the body, skipping sentences that only repeat the title
        const [head, ...rest] = all.split('\n');
        const text = rest.join(' ') || head;
        const sentence = (t: string, re: RegExp) => t.split(/(?<=[.!?])\s+/).find((x) => re.test(x) && !head.includes(x.replace(/[.!?]$/, '')))?.trim() ?? '';
        const loss = /\b(I|we|my \w+) (paid|sent|transferred)\b|blocked me|same thing happened/i;
        const warn = /\b(avoid|beware|collects? (full )?payment and blocks?)\b/i;
        const good = /\b(reliable|recommend|deliver(ed)? on time|always match)\b/i;
        const ask = /\b(anyone|legit)\b.*\?/i;
        const [stance, re] = loss.test(text) ? ['report', loss] : warn.test(text) ? ['warning', warn] : good.test(text) ? ['positive', good] : ask.test(text) ? ['question', /\?/] : ['other', /$^/];
        return { i, stance, about: stance === 'other' ? 'unclear' : 'this_vendor', quote: sentence(text, re as RegExp) };
      }),
    });
  },
};
