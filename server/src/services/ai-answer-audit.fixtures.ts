// Dry-run fixtures for AI Answer Audit: Mama Put Kitchen, a restaurant in Yaba, Lagos. Its record is
// clear (Google listing + website), but ChatGPT gets the hours and a price wrong and invents a student
// deal, Gemini names two competitors and can't answer the basics, Claude mostly declines, and Perplexity
// says it "may be permanently closed" while citing a "best restaurants in Yaba" blog. The analyst fixture
// has one paraphrased quote and one competitor that isn't in the answer (QA must drop both), and one maker
// verdict the auditor overturns (the two-key rule must leave it out of the score).

export const spec = {
  name: 'Mama Put Kitchen', website: 'mamaputkitchen.ng', area: 'Yaba', city: 'Lagos', country: 'Nigeria', countryIso: 'NG',
  category: 'restaurant', categoryPlural: 'restaurants', service: 'jollof rice', priceItem: 'a plate of jollof rice and chicken',
};

const HOURS = { Monday: '8 AM–9 PM', Tuesday: '8 AM–9 PM', Wednesday: '8 AM–9 PM', Thursday: '8 AM–9 PM', Friday: '8 AM–9 PM', Saturday: '8 AM–9 PM', Sunday: '12–8 PM' };

export const maps = () => ({
  places: [
    {
      position: 1, title: 'Mama Put Kitchen', address: '23 Herbert Macaulay Way, Yaba, Lagos 101245, Lagos', latitude: 6.5095412, longitude: 3.3710845,
      rating: 4.3, ratingCount: 212, type: 'Nigerian restaurant', types: ['Nigerian restaurant', 'Restaurant'], website: 'https://mamaputkitchen.ng/',
      phoneNumber: '0803 456 7812', openingHours: HOURS, cid: '1234567890123456789', placeId: 'ChIJx8mB5nKNOxARmamaputYaba',
    },
    { position: 2, title: 'Mama Put Spot Sabo', address: '4 Commercial Ave, Sabo, Yaba, Lagos', latitude: 6.5071, longitude: 3.3752, rating: 3.9, ratingCount: 41, type: 'Restaurant', cid: '998877665544332211' },
  ],
});

const slot = (o: number, c: number) => [{ open: { hour: o, minute: 0 }, close: { hour: c, minute: 0 } }];

export const gbp = () => [{
  keyword: 'cid:1234567890123456789', items_count: 1,
  items: [{
    type: 'google_business_info', title: 'Mama Put Kitchen', category: 'Nigerian restaurant', additional_categories: ['Restaurant', 'Caterer'],
    cid: '1234567890123456789', address: '23 Herbert Macaulay Way, Yaba, Lagos 101245', phone: '+234 803 456 7812',
    url: 'https://mamaputkitchen.ng/', domain: 'mamaputkitchen.ng', is_claimed: false,
    rating: { rating_type: 'Max5', value: 4.3, votes_count: 212, rating_max: 5 },
    place_topics: { jollof: 38, amala: 21, portion: 15, 'small chops': 12, delivery: 9 },
    people_also_search: [
      { cid: '11', title: 'Yakoyo Restaurant', rating: { value: 4.1, votes_count: 980 } },
      { cid: '12', title: 'The Place Yaba', rating: { value: 4.0, votes_count: 1450 } },
      { cid: '13', title: 'Chicken Republic Herbert Macaulay', rating: { value: 3.8, votes_count: 620 } },
      { cid: '14', title: 'Amala Shitta', rating: { value: 4.2, votes_count: 2100 } },
    ],
    work_time: {
      work_hours: {
        timetable: { monday: slot(8, 21), tuesday: slot(8, 21), wednesday: slot(8, 21), thursday: slot(8, 21), friday: slot(8, 21), saturday: slot(8, 21), sunday: slot(12, 20) },
        current_status: 'opened',
      },
    },
    local_business_links: [{ type: 'menu', title: 'mamaputkitchen.ng', url: 'https://mamaputkitchen.ng/menu' }],
  }],
}];

const PAGES: Record<string, string> = {
  '': 'Mama Put Kitchen — Home-style Nigerian food in Yaba\nOur smoky party jollof is cooked over firewood every morning. Eat in, take away or order delivery.\nOpening hours: Monday – Saturday: 8am – 9pm | Sunday: 1pm – 8pm\n23 Herbert Macaulay Way, Yaba, Lagos. Call or WhatsApp 0803 456 7812.',
  '/contact': 'Contact Mama Put Kitchen\nVisit: 23 Herbert Macaulay Way, Yaba, Lagos\nCall or WhatsApp: 0803 456 7812\nEmail: hello@mamaputkitchen.ng\nWe deliver within Yaba, Surulere and Ebute Metta via Chowdeck and Glovo.',
  '/about': 'About us\nMama Put Kitchen started in 2016 as a roadside buka near Sabo market. Today we seat 40 guests and cook everything fresh each morning.',
  '/menu': 'Menu & prices\nJollof rice & chicken – ₦3,500\nFried rice & turkey – ₦4,200\nAmala, ewedu & gbegiri – ₦2,800\nSmall chops platter (50 pcs) – ₦12,000\nParty jollof for events: from 20 guests, ask for a quote.\nPrices include VAT.',
};

export const site = (urls: string[]) => ({
  pages: urls.map((u) => {
    const path = new URL(u).pathname.replace(/\/$/, '');
    return { url: u, title: PAGES[path] ? `Mama Put Kitchen ${path || 'home'}` : '404', text: PAGES[path] ?? '404 — Page not found. The page you are looking for does not exist.' };
  }),
});

const home = 'https://mamaputkitchen.ng', contact = `${home}/contact`, menu = `${home}/menu`;
export const siteFacts = () => ({
  facts: [
    { field: 'hours', value: 'Mon–Sat 8am–9pm, Sun 1pm–8pm', quote: 'Monday – Saturday: 8am – 9pm | Sunday: 1pm – 8pm', url: home },
    { field: 'phone', value: '0803 456 7812', quote: 'Call or WhatsApp: 0803 456 7812', url: contact },
    { field: 'address', value: '23 Herbert Macaulay Way, Yaba, Lagos', quote: 'Visit: 23 Herbert Macaulay Way, Yaba, Lagos', url: contact },
    { field: 'price', value: 'Jollof rice & chicken ₦3,500', quote: 'Jollof rice & chicken – ₦3,500', url: menu },
    { field: 'price', value: 'Fried rice & turkey ₦4,200', quote: 'Fried rice & turkey – ₦4,200', url: menu },
    { field: 'price', value: 'Amala, ewedu & gbegiri ₦2,800', quote: 'Amala, ewedu & gbegiri – ₦2,800', url: menu },
    { field: 'price', value: 'Small chops platter (50 pcs) ₦12,000', quote: 'Small chops platter (50 pcs) – ₦12,000', url: menu },
    { field: 'delivery', value: 'Delivery in Yaba, Surulere and Ebute Metta via Chowdeck and Glovo', quote: 'We deliver within Yaba, Surulere and Ebute Metta via Chowdeck and Glovo', url: contact },
    { field: 'menu', value: 'Smoky party jollof cooked over firewood', quote: 'Our smoky party jollof is cooked over firewood every morning', url: home },
    { field: 'service', value: 'Party jollof catering from 20 guests', quote: 'Party jollof for events: from 20 guests, ask for a quote', url: menu },
  ],
  conflicts: [{ field: 'hours', google: 'Sunday 12 PM–8 PM', website: 'Sunday 1pm–8pm', quote: 'Sunday: 1pm – 8pm', url: home }],
});

type A = { title: string; url: string; direct_url?: string };
const MODEL = { chatgpt: 'gpt-5-mini-2025-08-07', gemini: 'gemini-2.5-flash', claude: 'claude-sonnet-4-20250514', perplexity: 'sonar' } as const;
const vertex = (title: string, direct: string): A => ({ title, url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF3x9', direct_url: direct });
const guide = { title: 'Best Restaurants in Yaba (2026) – Lagos Food Guide', url: 'https://lagosfoodguide.ng/best-restaurants-in-yaba-2026' };
const trip = { title: 'The 10 best restaurants in Yaba – Tripadvisor', url: 'https://www.tripadvisor.com/Restaurants-g304026-zfn7778523-Yaba_Lagos_Lagos_State.html' };

const ANSWERS: Record<string, Record<string, [string, A[]]>> = {
  chatgpt: {
    hours: ["Mama Put Kitchen in Yaba, Lagos is generally open **Monday to Saturday from 9:00 AM to 6:00 PM** and is closed on Sundays. Hours can change on public holidays, so it's worth calling ahead before you go.",
      [{ title: 'Mama Put Kitchen, Lagos - Tripadvisor', url: 'https://www.tripadvisor.com/Restaurant_Review-g304026-d2345678-Reviews-Mama_Put_Kitchen-Lagos_Lagos_State.html' }]],
    status: ["Yes, Mama Put Kitchen is still operating. It's at **23 Herbert Macaulay Way, Yaba, Lagos**, and you can reach them on **0803 456 7812**. It's a popular spot for Nigerian home-style dishes.",
      [{ title: 'Contact – Mama Put Kitchen', url: contact }]],
    price: ['A plate of jollof rice and chicken at Mama Put Kitchen costs around **₦2,000–₦2,500**. They also run a **Wednesday jollof special with 20% off** for students with a valid ID, so midweek is the best time to go.',
      [{ title: 'Cheap eats in Yaba – LagosFoodie', url: 'https://lagosfoodie.com/cheap-eats-yaba' }]],
    best: ["Some of the best restaurants in Yaba, Lagos include:\n\n1. **Yakoyo Restaurant** – famous for amala, ewedu and gbegiri.\n2. **The Place Yaba** – reliable rice dishes and grilled chicken.\n3. **Chicken Republic (Herbert Macaulay Way)** – quick, affordable meals.\n\nIf you're happy to travel, **Yellow Chilli** in Ikeja is a popular sit-down option.",
      [trip, guide]],
    service: ['For good jollof rice near Yaba, Lagos, try:\n\n- **Mama Put Kitchen** on Herbert Macaulay Way – known for smoky party jollof.\n- **The Place Yaba** – consistent jollof and chicken combos.\n- **Jollof Joint Sabo** – budget-friendly portions.',
      [guide]],
    recommend: ['Here are a few well-reviewed restaurants in Yaba, Lagos:\n\n- **Yakoyo Restaurant** – traditional Yoruba dishes.\n- **Amala Shitta** – just over in Surulere, worth the short trip.\n- **The Place Yaba** – good for quick lunches.',
      [trip]],
  },
  gemini: {
    hours: ['Mama Put Kitchen in Yaba is open from 8 AM to 9 PM, Monday through Saturday, and from 12 PM to 8 PM on Sundays.', [vertex('mamaputkitchen.ng', `${home}/`)]],
    status: ["I couldn't find current information confirming whether Mama Put Kitchen in Yaba is still operating. I'd recommend checking its Google Maps listing or calling the restaurant directly before you visit.", []],
    price: ["I don't have current menu prices for Mama Put Kitchen. At similar buka-style restaurants in Yaba, a plate of jollof rice with chicken usually costs between ₦2,500 and ₦4,000.", []],
    best: ['Top-rated restaurants in Yaba include **Yakoyo Restaurant**, known for its amala, and **Amala Shitta**, a local favourite for traditional Yoruba dishes.', [vertex('tripadvisor.com', trip.url)]],
    service: ['You can get good jollof rice near Yaba at **The Place Yaba** or at **Yakoyo Restaurant**, both close to the University of Lagos.', [vertex('lagosfoodguide.ng', guide.url)]],
    recommend: ['Popular choices in Yaba are **Yakoyo Restaurant** and **Amala Shitta**. Both have strong Google reviews.', [vertex('tripadvisor.com', trip.url)]],
  },
  claude: {
    hours: ["I don't have reliable, current information about Mama Put Kitchen's opening hours in Yaba. I'd suggest checking their Google Maps listing or their website, mamaputkitchen.ng, before visiting.", []],
    status: ["Based on what I can find, Mama Put Kitchen appears to still be operating in Yaba, listed at 23 Herbert Macaulay Way. I couldn't find a phone number for them.", [{ title: 'Contact – Mama Put Kitchen', url: contact }]],
    price: ["According to their website, jollof rice with chicken is ₦3,500 and a small chops platter is ₦12,000. I didn't find any current deals or discounts advertised.", [{ title: 'Menu & prices – Mama Put Kitchen', url: menu }]],
    best: ['Well-regarded options in Yaba include **The Place Yaba** for quick rice dishes and **Yakoyo Restaurant** for amala and traditional Yoruba food.', [trip]],
    service: ['**Mama Put Kitchen** on Herbert Macaulay Way is often mentioned for jollof rice and small chops. **The Place Yaba** is another reliable choice nearby.', [guide]],
    recommend: ["I don't have enough reliable, current local information to recommend specific restaurants in Yaba. Google Maps reviews are the best way to compare options near you.", []],
  },
  perplexity: {
    hours: ['Mama Put Kitchen in Yaba opens **8:00 AM – 9:00 PM, Monday to Saturday**[1]. On Sundays it is listed as open 12:00 PM – 8:00 PM[2].',
      [{ title: 'Mama Put Kitchen', url: `${home}/` }, { title: 'Mama Put Kitchen - Google Maps', url: 'https://maps.google.com/?cid=1234567890123456789' }]],
    status: ['Some listings suggest **Mama Put Kitchen may be permanently closed**[1], although its website is still online[2]. The last known address was 23 Herbert Macaulay Way, Yaba, Lagos.',
      [{ title: 'Mama Put Kitchen Yaba – NigeriaGalleria', url: 'https://www.nigeriagalleria.com/Lagos/Restaurants/Mama-Put-Kitchen-Yaba.html' }, { title: 'Mama Put Kitchen', url: `${home}/` }]],
    price: ["Mama Put Kitchen's jollof rice and chicken is about ₦3,500[1]. They advertise **free delivery on orders above ₦10,000** within Yaba[1].", [{ title: 'Menu & prices – Mama Put Kitchen', url: menu }]],
    best: ['According to the *Best Restaurants in Yaba (2026)* guide[1], top picks are **Yakoyo Restaurant**, **The Place Yaba** and **Jollof Joint Sabo**[1][2].', [guide, trip]],
    service: ['Good jollof near Yaba: **Mama Put Kitchen**[1], known for smoky party jollof, and **The Place Yaba**[2].', [guide, { title: 'Menu & prices – Mama Put Kitchen', url: menu }]],
    recommend: ['Well-reviewed restaurants in Yaba include **Yakoyo Restaurant**, **Amala Shitta** and **The Place Yaba**[1].', [guide]],
  },
};

/** One DataForSEO LLM Responses `result` array, shaped per engine (Claude adds a reasoning item). */
export const answer = (engine: string, kind: string) => {
  const [text, annotations] = ANSWERS[engine]?.[kind] ?? ['(no fixture)', []];
  const message = { type: 'message', sections: [{ type: 'text', text, annotations }] };
  const reasoning = { type: 'reasoning', sections: [{ type: 'summary_text', text: 'The user wants local information; I should search the web first.' }] };
  return [{ model_name: MODEL[engine as keyof typeof MODEL], web_search: true, items: engine === 'claude' ? [reasoning, message] : [message], fan_out_queries: [] }];
};

type F = { field: string; quote: string; claim: string; verdict: string; truth: string };
const f = (field: string, quote: string, claim: string, verdict: string, truth = ''): F => ({ field, quote, claim, verdict, truth });
const J: Record<string, Record<string, { named?: boolean; name_quote?: string; facts?: F[]; missing?: string[]; competitors?: string[] }>> = {
  hours: {
    chatgpt: { facts: [f('hours', 'Monday to Saturday from 9:00 AM to 6:00 PM', 'Open Mon–Sat 9 AM–6 PM', 'wrong', 'Google: Mon–Sat 8 AM–9 PM'), f('hours', 'closed on Sundays', 'Closed on Sundays', 'wrong', 'Google: Sunday 12 PM–8 PM')] },
    gemini: { facts: [f('hours', 'open from 8 AM to 9 PM, Monday through Saturday', 'Mon–Sat 8 AM–9 PM', 'correct', 'Google: Mon–Sat 8 AM–9 PM'), f('hours', 'from 12 PM to 8 PM on Sundays', 'Sun 12–8 PM', 'correct', 'Google: Sunday 12 PM–8 PM')] },
    claude: { facts: [f('website', 'mamaputkitchen.ng', 'Website is mamaputkitchen.ng', 'correct', 'mamaputkitchen.ng')], missing: ['hours'] },
    perplexity: { facts: [f('hours', 'opens 8:00 AM – 9:00 PM, Monday to Saturday', 'Mon–Sat 8 AM–9 PM', 'correct', 'Google: Mon–Sat 8 AM–9 PM'), f('hours', 'open 12:00 PM – 8:00 PM', 'Sun 12–8 PM', 'correct', 'Google: Sunday 12 PM–8 PM')] },
  },
  status: {
    chatgpt: { facts: [f('status', 'Mama Put Kitchen is still operating', 'Still operating', 'correct', 'Operating'), f('address', '23 Herbert Macaulay Way, Yaba, Lagos', 'Address', 'correct', '23 Herbert Macaulay Way, Yaba, Lagos 101245'), f('phone', '0803 456 7812', 'Phone', 'correct', '+234 803 456 7812')] },
    gemini: { missing: ['status', 'address', 'phone'] },
    // paraphrased quote: the answer says "appears to still be operating", so QA must drop this one
    claude: { facts: [f('status', 'Mama Put Kitchen is still operating in Yaba', 'Still operating', 'correct', 'Operating'), f('address', 'listed at 23 Herbert Macaulay Way', 'Address', 'correct', '23 Herbert Macaulay Way')], missing: ['phone'] },
    perplexity: { facts: [f('status', 'Mama Put Kitchen may be permanently closed', 'May be permanently closed', 'wrong', 'Google shows it operating, not closed'), f('address', '23 Herbert Macaulay Way, Yaba, Lagos', 'Address', 'correct', '23 Herbert Macaulay Way, Yaba, Lagos 101245')], missing: ['phone'] },
  },
  price: {
    chatgpt: { facts: [f('price', '₦2,000–₦2,500', 'Jollof rice and chicken costs ₦2,000–₦2,500', 'wrong', 'Website menu: Jollof rice & chicken ₦3,500'), f('deal', 'Wednesday jollof special with 20% off for students', '20% off jollof for students on Wednesdays', 'made_up', 'No deals or discounts on the Google listing or website')] },
    gemini: { missing: ['price', 'deal'] },
    claude: { facts: [f('price', 'jollof rice with chicken is ₦3,500', 'Jollof rice & chicken ₦3,500', 'correct', '₦3,500'), f('price', 'small chops platter is ₦12,000', 'Small chops platter ₦12,000', 'correct', '₦12,000'), f('deal', "I didn't find any current deals or discounts advertised", 'No current deals', 'correct', 'No deals listed')] },
    // maker error on purpose: ₦3,500 matches the menu, so the auditor must overturn this
    perplexity: { facts: [f('price', 'jollof rice and chicken is about ₦3,500', 'About ₦3,500', 'wrong', 'Website: ₦3,500'), f('deal', 'free delivery on orders above ₦10,000', 'Free delivery over ₦10,000', 'made_up', 'Website: delivery via Chowdeck and Glovo; no free-delivery offer')] },
  },
  best: {
    chatgpt: { named: false, competitors: ['Yakoyo Restaurant', 'The Place Yaba', 'Chicken Republic', 'Yellow Chilli', 'Terra Kulture'] }, // Terra Kulture is not in the text
    gemini: { named: false, competitors: ['Yakoyo Restaurant', 'Amala Shitta'] },
    claude: { named: false, competitors: ['The Place Yaba', 'Yakoyo Restaurant'] },
    perplexity: { named: false, competitors: ['Yakoyo Restaurant', 'The Place Yaba', 'Jollof Joint Sabo'] },
  },
  service: {
    chatgpt: { named: true, name_quote: 'Mama Put Kitchen', competitors: ['The Place Yaba', 'Jollof Joint Sabo'], facts: [f('menu', 'known for smoky party jollof', 'Known for smoky party jollof', 'correct', 'Website: smoky party jollof cooked over firewood'), f('address', 'on Herbert Macaulay Way', 'On Herbert Macaulay Way', 'correct', '23 Herbert Macaulay Way')] },
    gemini: { named: false, competitors: ['The Place Yaba', 'Yakoyo Restaurant'] },
    claude: { named: true, name_quote: 'Mama Put Kitchen', competitors: ['The Place Yaba'], facts: [f('address', 'on Herbert Macaulay Way', 'On Herbert Macaulay Way', 'correct', '23 Herbert Macaulay Way')] },
    perplexity: { named: true, name_quote: 'Mama Put Kitchen', competitors: ['The Place Yaba'], facts: [f('menu', 'known for smoky party jollof', 'Known for smoky party jollof', 'correct', 'Website: smoky party jollof')] },
  },
  recommend: {
    chatgpt: { named: false, competitors: ['Yakoyo Restaurant', 'Amala Shitta', 'The Place Yaba'] },
    gemini: { named: false, competitors: ['Yakoyo Restaurant', 'Amala Shitta'] },
    claude: { named: false, competitors: [] },
    perplexity: { named: false, competitors: ['Yakoyo Restaurant', 'Amala Shitta', 'The Place Yaba'] },
  },
};

/** The analyst's judgement for one question: every engine's answer, keyed `${engine}:${kind}`. */
export const judge = (kind: string) => ({
  answers: Object.entries(J[kind] ?? {}).map(([engine, j]) => ({ id: `${engine}:${kind}`, named: false, name_quote: '', facts: [], missing: [], competitors: [], ...j })),
});

/** The auditor re-judges blind; it overturns the maker's "wrong" on Perplexity's (correct) ₦3,500. */
export const audit = (items: { id: string; engine: string; field: string; verdict: string }[]) => ({
  checks: items.map((i) => i.engine === 'perplexity' && i.field === 'price' && i.verdict === 'wrong'
    ? { id: i.id, verdict: 'correct', note: 'the menu lists jollof rice & chicken at ₦3,500' }
    : { id: i.id, verdict: i.verdict, note: 'agrees with the record' }),
});

export const mentions = () => [{
  total_count: 1, items_count: 1,
  items: [{ platform: 'google', model_name: 'google_ai_overview', question: 'where to eat jollof rice in yaba lagos', ai_search_volume: 90,
    sources: [{ domain: 'mamaputkitchen.ng', url: `${home}/menu`, title: 'Menu & prices – Mama Put Kitchen' }] }],
}];

export const summary = () =>
  'Only 3 of the 12 answers where customers asked AI assistants for a restaurant in Yaba named Mama Put Kitchen; Yakoyo Restaurant was recommended far more often. ' +
  'When customers asked about you by name, the assistants got 4 facts wrong, the most harmful being Perplexity saying you "may be permanently closed". ' +
  "Two answers also promised deals that aren't on your listing or website, so customers may turn up expecting them.";
