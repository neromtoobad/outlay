// Dry-run fixtures for Get Found: the same Mama Put Kitchen in Yaba as the AI Answer Audit fixtures (whose
// listing, profile, site and AI answers it reuses). On Google Maps it is 1st or 2nd at its own door but
// slips to 11th and then out of the results to the south-east, where The Place Yaba, Yakoyo and Jollof
// Joint Sabo take over; "Mama Put Spot Sabo" has a similar name and must never be counted as the business.
// Its reviews include fresh complaints about a wait, a Sunday trip and a slow delivery, one review the
// owner already answered, and an old one about a rude cashier. The writer's first reply to the wait
// complaint offers a free plate, so the code check and the auditor must both catch it and the rewrite must
// drop it.

type P = { title: string; address: string; latitude: number; longitude: number; rating: number; ratingCount: number; type: string; types: string[]; website?: string; phoneNumber?: string; openingHours?: Record<string, string>; cid: string };

const H = (open: string, close: string, sunday = '12–8 PM') => Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => [d, `${open}–${close}`]).concat([['Sunday', sunday]]));
const US: P = {
  title: 'Mama Put Kitchen', address: '23 Herbert Macaulay Way, Yaba, Lagos 101245, Lagos', latitude: 6.5095412, longitude: 3.3710845, rating: 4.3, ratingCount: 212,
  type: 'Nigerian restaurant', types: ['Nigerian restaurant', 'Restaurant'], website: 'https://mamaputkitchen.ng/', phoneNumber: '0803 456 7812', openingHours: H('8 AM', '9 PM'), cid: '1234567890123456789',
};
const R: Record<string, P> = {
  P: { title: 'The Place Yaba', address: '12 Herbert Macaulay Way, Yaba, Lagos', latitude: 6.5121, longitude: 3.3702, rating: 4.0, ratingCount: 1450, type: 'Restaurant', types: ['Restaurant', 'Fast food restaurant', 'Caterer'], website: 'https://theplace.com.ng/', phoneNumber: '0700 000 0001', openingHours: H('7 AM', '10 PM', '9 AM–10 PM'), cid: '12' },
  Y: { title: 'Yakoyo Restaurant', address: '5 Tejuosho Road, Yaba, Lagos', latitude: 6.5052, longitude: 3.3655, rating: 4.1, ratingCount: 980, type: 'Nigerian restaurant', types: ['Nigerian restaurant', 'Restaurant', 'Caterer'], website: 'https://yakoyo.ng/', phoneNumber: '0809 000 0002', openingHours: H('8 AM', '10 PM'), cid: '11' },
  J: { title: 'Jollof Joint Sabo', address: '7 Commercial Ave, Sabo, Yaba, Lagos', latitude: 6.5034, longitude: 3.3781, rating: 4.4, ratingCount: 86, type: 'Nigerian restaurant', types: ['Nigerian restaurant', 'Takeout restaurant', 'Delivery restaurant'], phoneNumber: '0811 000 0003', openingHours: H('10 AM', '10 PM'), cid: '15' },
  C: { title: 'Chicken Republic Herbert Macaulay', address: '44 Herbert Macaulay Way, Yaba, Lagos', latitude: 6.5143, longitude: 3.3768, rating: 3.8, ratingCount: 620, type: 'Fast food restaurant', types: ['Fast food restaurant', 'Chicken restaurant'], website: 'https://chicken-republic.com/', phoneNumber: '0700 000 0004', openingHours: H('8 AM', '10 PM'), cid: '13' },
  A: { title: 'Amala Shitta', address: '2 Shitta Street, Surulere, Lagos', latitude: 6.4981, longitude: 3.3592, rating: 4.2, ratingCount: 2100, type: 'Nigerian restaurant', types: ['Nigerian restaurant', 'Restaurant'], phoneNumber: '0802 000 0005', openingHours: H('9 AM', '6 PM', 'Closed'), cid: '14' },
  M: { title: 'Mama Put Spot Sabo', address: '4 Commercial Ave, Sabo, Yaba, Lagos', latitude: 6.5071, longitude: 3.3752, rating: 3.9, ratingCount: 41, type: 'Restaurant', types: ['Restaurant'], cid: '998877665544332211' },
  B: { title: 'Buka Hut Yaba', address: '19 Ojuelegba Road, Yaba, Lagos', latitude: 6.5011, longitude: 3.3698, rating: 4.0, ratingCount: 310, type: 'Nigerian restaurant', types: ['Nigerian restaurant'], website: 'https://bukahut.ng/', phoneNumber: '0813 000 0006', openingHours: H('8 AM', '9 PM'), cid: '16' },
  I: { title: 'Iya Basira Kitchen', address: '3 Akoka Road, Yaba, Lagos', latitude: 6.5177, longitude: 3.3851, rating: 4.5, ratingCount: 58, type: 'Nigerian restaurant', types: ['Nigerian restaurant'], phoneNumber: '0814 000 0007', cid: '17' },
};
const FILL = ['Ofada Hut Yaba', 'Calabar Pot Onike', 'Suya Corner Tejuosho', 'Mummy B Kitchen', 'Golden Ladle Surulere', 'Pepper Pot Alagomeji', 'Bukka Spot Akoka', 'Eko Grill Yaba', 'Iya Femi Amala', 'Rice & Stew Hub', 'The Food Court Sabo', 'Ewa Agoyin Corner'];
FILL.forEach((t, i) => { R[`f${i}`] = { title: t, address: `${10 + i} Main Road, Yaba, Lagos`, latitude: 6.5 + i / 1000, longitude: 3.37 + i / 1000, rating: 3.6 + (i % 5) / 10, ratingCount: 9 + i * 7, type: 'Restaurant', types: ['Restaurant'], cid: `90${i}`, ...(i % 3 ? { openingHours: H('9 AM', '8 PM') } : {}) }; });
const ORDER = ['P', 'Y', 'J', 'C', 'A', 'M', 'B', 'I', ...FILL.map((_, i) => `f${i}`)];

// Who shows above the business at each of the 9 spots (north-west → south-east, row by row); null = not in the results
const f = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
const AHEAD: (string[] | null)[][] = [
  // "restaurant in Yaba" (the derived search): good at the door, weak to the south
  [['P', 'Y', 'B', 'C'], ['Y', 'P'], ['C', 'P', 'Y', 'B', 'I', 'J', 'M'], ['Y', 'P', 'A'], ['Y'], ['P', 'C', 'Y', 'B', 'I'], ['A', 'Y', 'P', 'J', 'M', 'B', ...f(4)], ['J', 'Y', 'P', 'M', 'A', 'B'], null],
  // "jollof rice near me": stronger, since it is what the business is known for
  [['J', 'P'], ['P'], ['C', 'P', 'J'], ['J'], [], ['P', 'C'], ['A', 'J', 'M', 'P', 'Y'], ['J', 'M', 'P'], ['J', 'P', 'C', 'M', 'Y', 'B', 'I', 'f0']],
];

/** One Serper Maps page for search `s` from spot `p` (0-8): 20 places, the business where the grid puts it. */
export const grid = (s: number, p: number) => {
  const ahead = AHEAD[s % AHEAD.length][p % 9];
  const list: P[] = (ahead ?? []).map((k) => R[k]);
  if (ahead) list.push(US);
  for (const k of ORDER) if (list.length < 20 && !(ahead ?? []).includes(k)) list.push(R[k]);
  return { places: list.slice(0, 20).map((x, i) => ({ position: i + 1, ...x })) };
};

const rv = (id: string, rating: number, date: string, isoDate: string, name: string, snippet: string, response?: string) =>
  ({ id, rating, date, isoDate, snippet, likes: 0, user: { name, reviews: 3 + id.length }, ...(response ? { response: { date, snippet: response } } : {}) });
const N1 = rv('rv-n1', 2, '3 days ago', '2026-09-28T19:12:00Z', 'Tunde Bakare', 'Waited almost 50 minutes for two plates of jollof on Saturday evening and the chicken was cold when it came. The rice itself was tasty but the wait spoilt it.');
const N4 = rv('rv-n4', 1, '3 weeks ago', '2026-09-10T10:05:00Z', 'Ibrahim Musa', 'Came on Sunday morning at 10am and it was closed even though I thought it would be open. Wasted trip from Surulere.');
const N6 = rv('rv-n6', 3, 'a month ago', '2026-09-01T13:40:00Z', 'Emeka Nwosu', 'Food is nice but the delivery through Chowdeck took over an hour and the soup leaked in the bag.');
const L1 = rv('rv-l1', 1, '8 months ago', '2026-02-03T12:00:00Z', 'Dapo Ogunleye', 'The cashier shouted at me when I asked for my change. Food was fine but I did not feel welcome.');
const L2 = rv('rv-l2', 2, 'a year ago', '2025-08-20T12:00:00Z', 'Grace E.', 'Too much pepper in the stew for my taste.');

/** Serper Reviews for the business, newest first or lowest rating first. */
export const reviews = (sortBy: string) => ({
  reviews: sortBy === 'lowestRating' ? [N4, L1, N1, L2, N6] : [
    N1,
    rv('rv-n2', 5, 'a week ago', '2026-09-24T18:30:00Z', 'Chiamaka Obi', 'Best party jollof in Yaba, that smoky taste is real. Portions are big and the staff are friendly. Will be back with my colleagues.'),
    rv('rv-n3', 4, '2 weeks ago', '2026-09-17T12:20:00Z', 'Seyi Adebayo', 'Good amala and ewedu at a fair price. It gets crowded at lunch so come early.'),
    N4,
    rv('rv-n5', 5, 'a month ago', '2026-09-03T20:00:00Z', 'Funke Adeyemi', 'Ordered the small chops platter for my sister\'s birthday. Fresh and well packed.', 'Thank you Funke! Happy birthday to your sister.'),
    N6,
    rv('rv-n7', 5, '2 months ago', '2026-08-02T14:00:00Z', 'Bisi Ola', 'Amala, gbegiri and ewedu just like home. Clean place.'),
    rv('rv-n8', 4, '3 months ago', '2026-07-01T14:00:00Z', 'Kelechi Eze', 'Jollof is top. Wish they had more seats.'),
  ],
});

/** The profile description the writer drafts (numbers only from the record: 23 and 20). */
export const description = () =>
  'Mama Put Kitchen is a Nigerian restaurant at 23 Herbert Macaulay Way, Yaba, serving home-style Nigerian food every day of the week. ' +
  'We are known for our smoky party jollof, cooked over firewood every morning, alongside fried rice and turkey, amala with ewedu and gbegiri, and small chops platters. ' +
  'We deliver within Yaba, Surulere and Ebute Metta through Chowdeck and Glovo. Planning an event? We cook party jollof for groups from 20 guests; ask us for a quote. ' +
  'Our customers often mention our jollof, our amala and our portions.';

const REPLY: Record<string, string> = {
  // the first draft offers a free plate: the code check and the auditor must both catch it
  'rv-n1': 'Tunde, we are sorry you waited so long and that your chicken arrived cold. That is not how we want anyone to eat with us. Your next plate is on us: call or WhatsApp us on 0803 456 7812 when you are coming.',
  'rv-n4': 'Sorry you made the trip for nothing, Ibrahim. On Sundays we open in the afternoon, not in the morning. Call or WhatsApp us on 0803 456 7812 before you come and we will tell you if we are open.',
  'rv-n6': 'Thank you for telling us, Emeka, and sorry the soup leaked and the delivery took so long. That is not what we want for our delivery customers. If it happens again, please call or WhatsApp us on 0803 456 7812 so we can sort it out with you.',
  'rv-l1': 'Dapo, we are sorry. Nobody should be shouted at when they ask for their change. Thank you for telling us, and we hope you will give us another chance to welcome you properly.',
  'rv-n2': 'Thank you, Chiamaka! We are glad you enjoyed the smoky party jollof and the portions. See you and your colleagues soon at Herbert Macaulay Way.',
  'rv-n3': 'Thank you, Seyi. Glad you enjoyed the amala and ewedu. Lunch does get busy, so coming a little early is a good tip.',
};
const FIXED: Record<string, string> = {
  'rv-n1': 'Tunde, we are sorry you waited so long and that your chicken arrived cold. That is not how we want anyone to eat with us. Next time, call or WhatsApp us on 0803 456 7812 before you come and we will tell you how long the wait is.',
};

type Ask = { id: string; key: string }; // the short id the model sees, and Serper's review id
/** The writer's replies for the reviews it was given. */
export const replies = (xs: Ask[]) => ({ replies: xs.filter((x) => REPLY[x.key]).map((x) => ({ id: x.id, reply: REPLY[x.key] })) });
/** The writer's second try, for the replies that failed a check. */
export const rewrite = (xs: Ask[]) => ({ replies: xs.map((x) => ({ id: x.id, reply: FIXED[x.key] ?? REPLY[x.key] ?? '' })) });
/** The auditor flags any text that gives something away. */
export const check = (items: { id: string; text: string }[]) => ({
  checks: items.map((i) => (/on us|free|refund|discount/i.test(i.text) ? { id: i.id, ok: false, issues: ['promises a free plate the business never offered'] } : { id: i.id, ok: true, issues: [] })),
});

/** The writer's summary, built only from the facts it was handed (so the number check passes). */
export const summary = (facts: any) => {
  const m = facts.google_maps?.[0], top = facts.shows_above_you_most, ai = facts.ai_assistants;
  return [
    m && m.spots_searched > 1 ? `When customers search "${m.search}" on Google Maps, you are in the top 3 at ${m.in_top_3_at} of the ${m.spots_searched} spots we searched from${m.not_shown_at ? `, and missing from the results at ${m.not_shown_at} of them` : ''}.` : '',
    m && m.spots_searched === 1 ? `When customers search "${m.search}" on Google Maps, ${m.shown_at ? 'you show up' : 'you do not show up'}.` : '',
    top ? `${top.name} shows above you most often, at ${top.searches} of ${top.of} searches.` : '',
    ai ? `AI assistants named you in ${ai.named_in} of ${ai.recommendation_answers} answers when asked for a recommendation${ai.most_harmful ? `, and ${ai.most_harmful.assistant} told customers "${ai.most_harmful.said}"` : ''}.` : '',
  ].filter(Boolean).join(' ');
};
