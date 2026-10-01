// The site engine: a plan + facts + photos in, one fast static page out. All design decisions live here
// (type scale, spacing, palette roles, section layouts, motion); the model only chose what goes where.
// Every phone number, price, address, hour and review is rendered from the facts, never from model text.
import type { Facts, Photo } from './facts.ts';
import { e164, hoursLines, prettyPhone, priceValue, showPrice, telLink, waLink } from './facts.ts';
import type { Action, Plan, Section } from './plan.ts';
import { THEMES } from './themes.ts';
import { palette } from './color.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const TZ: Record<string, string> = { NG: 'Africa/Lagos', GH: 'Africa/Accra', KE: 'Africa/Nairobi', ZA: 'Africa/Johannesburg', EG: 'Africa/Cairo', GB: 'Europe/London', US: 'America/New_York' };

const ICON = {
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.48 15.02L2.5 21.5l4.6-1.2A9.9 9.9 0 1 0 12.04 2Zm5.8 14.07c-.24.68-1.4 1.3-1.93 1.35-.5.05-.97.23-3.28-.68-2.78-1.1-4.55-3.94-4.69-4.12-.13-.18-1.12-1.49-1.12-2.85s.71-2.02.97-2.3c.25-.27.55-.34.73-.34l.53.01c.17 0 .4-.06.62.48.24.55.8 1.92.87 2.06.07.14.11.3.02.48-.1.18-.14.3-.28.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.04.93 1.92 1.21 2.19 1.35.27.14.43.12.59-.07.16-.18.68-.8.86-1.07.18-.27.36-.23.61-.14.25.09 1.6.75 1.87.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M5 4h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3.2 2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.5l-5.3 2.9 1.2-5.9-4.5-4.1 6-.7L12 3.2Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/></svg>',
};
const stars = (n: number) => `<span class="stars" aria-label="${n} out of 5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < Math.round(n) ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`;

export type Rendered = { html: string; llms: string; robots: string };

export function renderSite(plan: Plan, f: Facts, photos: Photo[], opts: { url: string; year?: number }): Rendered {
  const t = THEMES[plan.theme];
  const pal = palette(plan.brand, t.mode);
  const ph = new Map(photos.map((p) => [p.id, p]));
  const item = new Map(f.items.map((i) => [i.id, i]));
  const review = new Map(f.reviews.map((r) => [r.id, r]));
  const chat = f.whatsapp ?? f.phone;
  const wa = (msg = plan.whatsappText) => waLink(chat, msg, f.country);
  const tel = telLink(f.phone ?? f.whatsapp, f.country);
  const dir = f.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${f.name}, ${f.address}`)}` : undefined;
  const hasOffer = plan.sections.some((s) => s.kind === 'offer');

  const actionHref = (a: Action) => a === 'whatsapp' ? wa() : a === 'book' ? wa(`Hello ${f.name}, I'd like to book.`) : a === 'call' ? tel : a === 'directions' ? dir : hasOffer ? '#offer' : undefined;
  const ACTION_LABEL: Record<Action, string> = { whatsapp: 'Chat on WhatsApp', book: 'Book on WhatsApp', call: 'Call us', directions: 'Get directions', menu: f.kind === 'food' ? 'See the menu' : 'See prices' };
  const ACTION_ICON: Record<Action, string> = { whatsapp: ICON.whatsapp, book: ICON.whatsapp, call: ICON.phone, directions: ICON.pin, menu: ICON.arrow };
  const btn = (a: Action, cls = 'btn-primary') => { const h = actionHref(a); return h ? `<a class="btn ${cls}" href="${esc(h)}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${ACTION_ICON[a]}<span>${esc(ACTION_LABEL[a])}</span></a>` : ''; };
  const img = (id: string | undefined, sizes: string, cls = '', eager = false) => {
    const p = id ? ph.get(id) : undefined;
    if (!p) return '';
    const pos = { top: '50% 20%', bottom: '50% 80%', left: '25% 50%', right: '75% 50%', center: '50% 50%' }[p.focus ?? 'center'];
    return `<img class="${cls}" src="${esc(p.file)}" alt="${esc(p.subject || f.name)}" width="${p.w}" height="${p.h}" sizes="${sizes}" style="object-position:${pos}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
  };
  const label = (s?: string) => (s ? `<p class="label">${esc(s)}</p>` : '');
  const h = (lvl: 1 | 2 | 3, text: string, accent?: string, cls = '') => {
    const inner = accent && text.includes(accent) ? esc(text).replace(esc(accent), `<em>${esc(accent)}</em>`) : esc(text);
    return `<h${lvl} class="${cls}">${inner}</h${lvl}>`;
  };

  // ---------- quick facts
  const minPrice = f.items.map((i) => ({ i, v: priceValue(i.price) })).filter((x) => x.v).sort((a, b) => a.v! - b.v!)[0];
  const facts: string[] = [];
  if (f.hours) facts.push(`<li>${ICON.clock}<span><b data-open>Opening hours</b><small data-next>${esc(hoursLines(f.hours).slice(0, 1).map((l) => `${l.days} ${l.time}`).join(''))}</small></span></li>`);
  if (f.area || f.city) facts.push(`<li>${ICON.pin}<span><b>${esc([f.area, f.city].filter(Boolean).join(', '))}</b><small>${esc(f.landmark ?? (f.delivery ? f.delivery.slice(0, 60) : 'Find us on the map'))}</small></span></li>`);
  if (f.rating && f.ratingCount) facts.push(`<li>${ICON.star}<span><b>${f.rating.toFixed(1)} on Google</b><small>${f.ratingCount} review${f.ratingCount === 1 ? '' : 's'}</small></span></li>`);
  if (minPrice) facts.push(`<li>${ICON.tag}<span><b>From ${esc(showPrice(minPrice.i.price!, f.country).replace(/^from /, ''))}</b><small>${esc(minPrice.i.name)}</small></span></li>`);

  // ---------- sections
  const section = (s: Section, i: number): string => {
    switch (s.kind) {
      case 'strip':
        return facts.length >= 2 ? `<section class="strip" aria-label="Quick facts"><ul class="wrap">${facts.join('')}</ul></section>` : '';
      case 'offer': {
        const rows = s.items.map((x) => ({ ...x, it: item.get(x.id)! })).filter((x) => x.it);
        const price = (p?: string) => (p ? `<span class="price">${esc(showPrice(p, f.country))}</span>` : '');
        let body = '';
        if (s.variant === 'menu') {
          const cats = [...new Set(rows.map((r) => r.it.category ?? ''))];
          body = `<div class="menu">${cats.map((c) => `<div class="menu-col rv">${c ? `<h3 class="menu-cat">${esc(c)}</h3>` : ''}<ul>${rows.filter((r) => (r.it.category ?? '') === c).map((r) => `<li><div class="mi"><span class="mi-name">${esc(r.it.name)}</span><span class="dots" aria-hidden="true"></span>${price(r.it.price)}</div>${r.desc || r.it.note ? `<p class="mi-desc">${esc(r.desc ?? r.it.note)}</p>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`;
        } else if (s.variant === 'features') {
          body = `<div class="features">${rows.slice(0, 4).map((r, j) => `<article class="feature rv${j % 2 ? ' flip' : ''}">${r.photo ? `<div class="feature-img">${img(r.photo, '(min-width: 900px) 50vw, 100vw')}</div>` : ''}<div class="feature-text"><span class="num">${String(j + 1).padStart(2, '0')}</span><h3>${esc(r.it.name)}</h3>${r.desc || r.it.note ? `<p>${esc(r.desc ?? r.it.note)}</p>` : ''}${price(r.it.price)}</div></article>`).join('')}</div>`;
        } else {
          body = `<div class="cards">${rows.map((r) => `<article class="card rv">${r.photo ? `<div class="card-img">${img(r.photo, '(min-width: 900px) 33vw, 100vw')}</div>` : ''}<div class="card-body"><h3>${esc(r.it.name)}</h3>${r.desc || r.it.note ? `<p>${esc(r.desc ?? r.it.note)}</p>` : ''}${price(r.it.price)}</div></article>`).join('')}</div>`;
        }
        return `<section id="offer" class="sect offer offer-${s.variant}"><div class="wrap"><header class="sect-head rv">${h(2, s.title)}${s.intro ? `<p class="lede">${esc(s.intro)}</p>` : ''}</header>${body}${chat ? `<p class="offer-cta rv">${btn('whatsapp', 'btn-ghost')}</p>` : ''}</div></section>`;
      }
      case 'gallery': {
        // grids only tile cleanly at 3, 5 or 9 photos (one large + pairs); strips take any number
        const n = s.variant === 'grid' ? (s.photos.length >= 9 ? 9 : s.photos.length >= 5 ? 5 : 3) : s.photos.length;
        s = { ...s, photos: s.photos.slice(0, n) };
        return `<section class="sect gallery gallery-${s.variant}${s.variant === 'grid' && n === 3 ? ' g-three' : ''}"><div class="wrap">${s.title ? `<header class="sect-head rv">${h(2, s.title)}</header>` : ''}<div class="g">${s.photos.map((id, j) => `<figure class="rv g${j}">${img(id, s.variant === 'strip' ? '(min-width: 900px) 30vw, 75vw' : j === 0 ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 900px) 25vw, 50vw')}</figure>`).join('')}</div>${f.instagram ? `<p class="g-more rv"><a href="https://instagram.com/${esc(f.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">${ICON.ig}<span>More on Instagram @${esc(f.instagram.replace(/^@/, ''))}</span></a></p>` : ''}</div></section>`;
      }
      case 'reviews': {
        const rs = s.ids.map((id) => review.get(id)!).filter(Boolean);
        const quotes = rs.map((r) => `<figure class="quote rv"><span class="qmark" aria-hidden="true">“</span><blockquote>${esc(r.text)}</blockquote><figcaption>${stars(r.rating)}<span>${esc(r.who)} · Google review</span></figcaption></figure>`).join('');
        if (s.variant === 'summary' && f.rating) return `<section id="reviews" class="sect reviews reviews-summary"><div class="wrap"><div class="score rv"><p class="label">${esc(s.title)}</p><p class="big">${f.rating.toFixed(1)}</p>${stars(f.rating)}<p class="muted">from ${f.ratingCount} Google review${f.ratingCount === 1 ? '' : 's'}</p></div><div class="quotes">${quotes}</div></div></section>`;
        return `<section id="reviews" class="sect reviews"><div class="wrap"><header class="sect-head rv">${h(2, s.title)}${f.rating && f.ratingCount ? `<p class="lede rating">${stars(f.rating)} <b>${f.rating.toFixed(1)}</b> from ${f.ratingCount} Google reviews</p>` : ''}</header><div class="quotes">${quotes}</div></div></section>`;
      }
      case 'about': {
        if (s.variant === 'statement') {
          const [first, ...rest] = s.body.split(/(?<=[.!?])\s+/);
          return `<section class="sect about about-statement"><div class="wrap narrow rv">${label(s.title)}<p class="statement">${esc(first)}</p>${rest.length ? `<p class="lede">${esc(rest.join(' '))}</p>` : ''}</div></section>`;
        }
        return `<section class="sect about about-split"><div class="wrap two">${s.photo ? `<div class="about-img rv">${img(s.photo, '(min-width: 900px) 45vw, 100vw')}</div>` : ''}<div class="about-text rv">${h(2, s.title)}${s.body.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}</div></div></section>`;
      }
      case 'steps':
        return `<section class="sect steps"><div class="wrap"><header class="sect-head rv">${h(2, s.title)}</header><ol class="step-list">${s.steps.map((st) => `<li class="rv"><span class="num" aria-hidden="true"></span><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></li>`).join('')}</ol>${chat ? `<p class="steps-cta rv">${btn('whatsapp')}</p>` : ''}</div></section>`;
      case 'location': {
        const lines = f.hours ? hoursLines(f.hours) : [];
        const info = `<div class="loc-info rv">${h(2, s.title)}<p class="addr">${ICON.pin}<span>${esc(f.address)}</span></p>${s.note ? `<p class="muted">${esc(s.note)}</p>` : ''}${lines.length ? `<table class="hours"><caption class="label">Opening hours</caption>${lines.map((l) => `<tr><th scope="row">${esc(l.days)}</th><td>${esc(l.time)}</td></tr>`).join('')}</table>` : f.hoursText ? `<p class="muted">${esc(f.hoursText)}</p>` : ''}<p class="btns">${dir ? `<a class="btn btn-primary" href="${esc(dir)}" target="_blank" rel="noopener">${ICON.pin}<span>Get directions</span></a>` : ''}${tel ? `<a class="btn btn-ghost" href="${esc(tel)}">${ICON.phone}<span>${esc(prettyPhone(f.phone ?? f.whatsapp, f.country))}</span></a>` : ''}</p></div>`;
        if (s.variant === 'card') return `<section id="visit" class="sect location location-card"><div class="wrap">${info}</div></section>`;
        return `<section id="visit" class="sect location location-map"><div class="wrap two">${info}<div class="map rv"><iframe title="Map to ${esc(f.name)}" src="https://www.google.com/maps?q=${encodeURIComponent(`${f.name}, ${f.address}`)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div></section>`;
      }
      case 'faq':
        return `<section class="sect faq"><div class="wrap narrow"><header class="sect-head rv">${h(2, s.title)}</header>${s.items.map((q) => `<details class="rv"><summary>${esc(q.q)}<span class="plus" aria-hidden="true"></span></summary><p>${esc(q.a)}</p></details>`).join('')}</div></section>`;
      case 'cta':
        return `<section class="cta cta-${s.variant}"><div class="wrap rv">${h(2, s.headline)}${s.sub ? `<p class="lede">${esc(s.sub)}</p>` : ''}<p class="btns">${btn(s.action, 'btn-invert')}${s.action !== 'call' && tel ? `<a class="btn btn-line" href="${esc(tel)}">${ICON.phone}<span>${esc(prettyPhone(f.phone ?? f.whatsapp, f.country))}</span></a>` : ''}</p></div></section>`;
    }
  };

  // ---------- hero
  const hr = plan.hero;
  const nav = `<nav class="top${hr.variant === 'photo' ? ' on-photo' : ''}"><div class="wrap"><a class="brand" href="#top">${esc(f.name)}</a><div class="top-links">${hasOffer ? `<a href="#offer">${f.kind === 'food' ? 'Menu' : 'Prices'}</a>` : ''}${plan.sections.some((s) => s.kind === 'reviews') ? '<a href="#reviews">Reviews</a>' : ''}${plan.sections.some((s) => s.kind === 'location') ? '<a href="#visit">Visit</a>' : ''}${chat ? `<a class="btn btn-small" href="${esc(wa())}" target="_blank" rel="noopener">${ICON.whatsapp}<span>WhatsApp</span></a>` : ''}</div></div></nav>`;
  const heroText = `${hr.eyebrow ? `<p class="label hero-eyebrow">${esc(hr.eyebrow)}</p>` : ''}${h(1, hr.headline, hr.accent, 'hero-h')}<p class="hero-sub">${esc(hr.sub)}</p><p class="btns hero-btns">${btn(hr.primary)}${hr.secondary ? btn(hr.secondary, hr.variant === 'photo' || hr.variant === 'type' ? 'btn-line' : 'btn-ghost') : ''}</p>${f.hours ? '<p class="hero-open" data-open-pill hidden></p>' : ''}`;
  const hero = hr.variant === 'photo'
    ? `<header id="top" class="hero hero-photo">${img(hr.photo, '100vw', 'hero-bg', true)}<div class="scrim"></div>${nav}<div class="wrap hero-in">${heroText}</div></header>`
    : hr.variant === 'split'
      ? `<header id="top" class="hero hero-split">${nav}<div class="wrap two hero-in"><div class="hero-text">${heroText}</div><div class="hero-img">${img(hr.photo, '(min-width: 900px) 45vw, 100vw', '', true)}</div></div></header>`
      : hr.variant === 'stack'
        ? `<header id="top" class="hero hero-stack">${nav}<div class="wrap hero-in">${heroText}</div><div class="wrap"><div class="hero-img">${img(hr.photo, '100vw', '', true)}</div></div></header>`
        : `<header id="top" class="hero hero-type">${nav}<div class="wrap hero-in"><span class="monogram" aria-hidden="true">${esc(f.name.replace(/^(the|le|la)\s+/i, '').charAt(0))}</span>${heroText}</div></header>`;

  const bar = chat || tel || dir ? `<div class="bar" role="navigation" aria-label="Contact">${chat ? `<a class="b-wa" href="${esc(wa())}" target="_blank" rel="noopener">${ICON.whatsapp}<span>WhatsApp</span></a>` : ''}${tel ? `<a href="${esc(tel)}">${ICON.phone}<span>Call</span></a>` : ''}${dir ? `<a href="${esc(dir)}" target="_blank" rel="noopener">${ICON.pin}<span>Directions</span></a>` : ''}</div>${chat ? `<a class="float-wa" href="${esc(wa())}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${ICON.whatsapp}</a>` : ''}` : '';

  const footer = `<footer class="foot"><div class="wrap"><div><p class="brand">${esc(f.name)}</p><p class="muted">${esc(f.offer)}</p></div><ul>${f.address ? `<li>${ICON.pin}<span>${esc(f.address)}</span></li>` : ''}${tel ? `<li>${ICON.phone}<a href="${esc(tel)}">${esc(prettyPhone(f.phone ?? f.whatsapp, f.country))}</a></li>` : ''}${f.instagram ? `<li>${ICON.ig}<a href="https://instagram.com/${esc(f.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">@${esc(f.instagram.replace(/^@/, ''))}</a></li>` : ''}${f.email ? `<li><a href="mailto:${esc(f.email)}">${esc(f.email)}</a></li>` : ''}</ul><p class="fine">© ${opts.year ?? new Date().getFullYear()} ${esc(f.name)} · <a href="https://hiresyncly.site" target="_blank" rel="noopener">Site by Syncly</a></p></div></footer>`;

  // ---------- structured data (only known facts; no self-serving review markup)
  const ldType = { food: 'Restaurant', beauty: 'BeautySalon', health: 'MedicalBusiness', retail: 'Store', creative: 'ProfessionalService', events: 'ProfessionalService', professional: 'ProfessionalService', other: 'LocalBusiness' }[f.kind];
  const ld: Record<string, unknown> = { '@context': 'https://schema.org', '@type': ldType, name: f.name, description: plan.description, url: opts.url };
  if (f.phone ?? f.whatsapp) ld.telephone = `+${e164(f.phone ?? f.whatsapp, f.country)}`;
  if (f.address) ld.address = { '@type': 'PostalAddress', streetAddress: f.address, addressLocality: f.area ?? f.city, addressRegion: f.city, addressCountry: f.country };
  if (f.hours) ld.openingHoursSpecification = f.hours.map((x) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][x.day], opens: `${String(Math.floor(x.open / 60)).padStart(2, '0')}:${String(x.open % 60).padStart(2, '0')}`, closes: `${String(Math.floor(Math.min(x.close, 1439) / 60)).padStart(2, '0')}:${String(Math.min(x.close, 1439) % 60).padStart(2, '0')}` }));
  if (f.instagram) ld.sameAs = [`https://instagram.com/${f.instagram.replace(/^@/, '')}`];
  const heroPhoto = hr.photo ? ph.get(hr.photo) : undefined;
  if (heroPhoto) ld.image = `${opts.url}/${heroPhoto.file}`;

  const css = styles(t, pal);
  const script = `document.documentElement.classList.add('js');
(function(){var H=${JSON.stringify(f.hours ?? null)},Z=${JSON.stringify(TZ[f.country] ?? 'Africa/Lagos')},D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function now(){try{var p=new Intl.DateTimeFormat('en-GB',{timeZone:Z,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),o={};p.forEach(function(x){o[x.type]=x.value});return{d:D.indexOf(o.weekday),m:+o.hour*60+ +o.minute}}catch(e){var d=new Date();return{d:d.getDay(),m:d.getHours()*60+d.getMinutes()}}}
function t(m){var h=Math.floor(m/60)%24,mm=m%60,a=h>=12?'pm':'am';return((h%12)||12)+(mm?':'+(mm<10?'0':'')+mm:'')+a}
function status(){if(!H)return null;var n=now(),today=H.filter(function(x){return x.day===n.d});for(var i=0;i<today.length;i++){if(n.m>=today[i].open&&n.m<today[i].close)return{open:true,text:'Open now',sub:'Closes '+t(today[i].close)}}
for(var k=0;k<8;k++){var d=(n.d+k)%7,list=H.filter(function(x){return x.day===d&&(k>0||x.open>n.m)}).sort(function(a,b){return a.open-b.open});if(list.length)return{open:false,text:'Closed now',sub:'Opens '+(k===0?'':k===1?'tomorrow ':D[d]+' ')+t(list[0].open)}}return null}
var s=status();if(s){document.querySelectorAll('[data-open]').forEach(function(e){e.textContent=s.text});document.querySelectorAll('[data-next]').forEach(function(e){e.textContent=s.sub});document.querySelectorAll('[data-open-pill]').forEach(function(e){e.hidden=false;e.className='hero-open '+(s.open?'is-open':'is-closed');e.textContent=s.text+' · '+s.sub})}
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});document.querySelectorAll('.rv').forEach(function(e){io.observe(e)})}else document.querySelectorAll('.rv').forEach(function(e){e.classList.add('in')})})();`;

  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${pal.brand}"/><text x="32" y="44" font-family="Georgia,serif" font-size="36" font-weight="700" text-anchor="middle" fill="${pal.onBrand}">${esc(f.name.replace(/^(the|le|la)\s+/i, '').charAt(0).toUpperCase())}</text></svg>`)}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(plan.title)}</title>
<meta name="description" content="${esc(plan.description)}">
<link rel="canonical" href="${esc(opts.url)}">
<meta name="theme-color" content="${pal.brand}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(plan.title)}"><meta property="og:description" content="${esc(plan.description)}"><meta property="og:url" content="${esc(opts.url)}">${heroPhoto ? `<meta property="og:image" content="${esc(`${opts.url}/${heroPhoto.file}`)}">` : ''}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${t.fonts}&display=swap">
${heroPhoto ? `<link rel="preload" as="image" href="${esc(heroPhoto.file)}">` : ''}
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body class="t-${t.id} k-${f.kind}">
${hero}
<main>
${plan.sections.map(section).join('\n')}
</main>
${footer}
${bar}
<script>${script}</script>
</body>
</html>`;

  const llms = `# ${f.name}\n\n> ${f.offer}\n\n${[f.address && `- Address: ${f.address}`, (f.phone ?? f.whatsapp) && `- Phone/WhatsApp: +${e164(f.phone ?? f.whatsapp, f.country)}`, f.hoursText && `- Hours: ${f.hoursText}`, f.rating && `- Google rating: ${f.rating} (${f.ratingCount} reviews)`, f.instagram && `- Instagram: https://instagram.com/${f.instagram.replace(/^@/, '')}`].filter(Boolean).join('\n')}\n\n## ${f.kind === 'food' ? 'Menu' : 'Offer'}\n\n${f.items.map((i) => `- ${i.name}${i.price ? `: ${showPrice(i.price, f.country)}` : ''}`).join('\n')}\n`;
  return { html, llms, robots: 'User-agent: *\nAllow: /\n' };
}

// ---------------------------------------------------------------- the design system

function styles(t: (typeof THEMES)[keyof typeof THEMES], p: ReturnType<typeof palette>) {
  const caps = t.display.caps;
  const dark = t.mode === 'dark';
  return `
:root{--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--brand:${p.brand};--on-brand:${p.onBrand};--brand-ink:${p.brandInk};--deep:${p.deep};--on-deep:${p.onDeep};--tint:${p.tint};
--display:${t.display.family};--body:${t.body.family};--mono:${t.mono ?? 'ui-monospace, SFMono-Regular, Menlo, monospace'};
--r-btn:${t.radius.btn};--r-card:${t.radius.card};--r-img:${t.radius.img};--ease:cubic-bezier(.2,.75,.2,1);
--s-1:clamp(.84rem,.8rem + .15vw,.92rem);--s0:clamp(1rem,.96rem + .2vw,1.1rem);--s1:clamp(1.18rem,1.08rem + .45vw,1.42rem);--s2:clamp(1.4rem,1.2rem + .9vw,1.9rem);--s3:clamp(1.7rem,1.35rem + 1.6vw,2.7rem);--s4:clamp(2rem,1.45rem + ${caps ? '2.2' : '2.7'}vw,${caps ? '3.4' : '3.9'}rem);--s5:clamp(2.35rem,1.5rem + ${caps ? '3.6' : '4.4'}vw,${caps ? '4.6' : '5.5'}rem);--s6:clamp(2.6rem,1.4rem + ${caps ? '5.4' : '6.6'}vw,${caps ? '6.4' : '7.6'}rem);
--gut:clamp(20px,5vw,48px);--sect:clamp(72px,10vw,136px)}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:80px}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-weight:${t.body.weight};font-size:var(--s0);line-height:1.62;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
h1,h2,h3{font-family:var(--display);font-weight:${t.display.weight};letter-spacing:${t.display.tracking};line-height:${t.display.leading};margin:0;text-wrap:balance;${caps ? 'text-transform:uppercase;' : ''}${t.display.stretch ? `font-stretch:${t.display.stretch};` : ''}}
h2{font-size:var(--s4)}h3{font-size:var(--s1);line-height:1.2;${caps ? 'letter-spacing:-.005em;' : ''}}
h1 em,h2 em{font-style:${t.display.accentItalic ? 'italic' : 'normal'};color:${dark ? 'var(--brand-ink)' : caps ? 'var(--brand)' : 'var(--brand-ink)'}}
p{margin:0;text-wrap:pretty}
.wrap{width:100%;max-width:1200px;margin-inline:auto;padding-inline:var(--gut)}
.narrow{max-width:820px}
.two{display:grid;gap:clamp(28px,5vw,72px);align-items:center}
@media(min-width:900px){.two{grid-template-columns:1.05fr .95fr}}
.label{${t.label === 'mono' ? 'font-family:var(--mono);font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;' : t.label === 'italic' ? 'font-family:var(--display);font-style:italic;font-size:var(--s1);letter-spacing:0;' : 'font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;'}color:var(--brand-ink);margin-bottom:.9rem}
.muted{color:var(--muted)}
.lede{font-size:var(--s1);color:var(--muted);max-width:44ch;line-height:1.5}
.sect{padding-block:var(--sect)}
.sect-head{display:grid;gap:1rem;margin-bottom:clamp(32px,5vw,56px);max-width:780px}
${t.rule ? '.sect+.sect{border-top:1px solid var(--line)}' : ''}
.btns{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.6em;min-height:52px;padding:0 1.45em;border-radius:var(--r-btn);font:600 1rem/1 var(--body);text-decoration:none;letter-spacing:${caps ? '.02em' : '0'};transition:transform .25s var(--ease),background .25s,color .25s,box-shadow .25s;-webkit-tap-highlight-color:transparent}
.btn svg{width:1.25em;height:1.25em;flex:none}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--brand);color:var(--on-brand);box-shadow:0 10px 24px -12px color-mix(in srgb,var(--brand) 70%,transparent)}
.btn-primary:hover{background:color-mix(in srgb,var(--brand) 88%,var(--ink))}
.btn-ghost{border:1.5px solid color-mix(in srgb,var(--ink) 22%,transparent);color:var(--ink)}
.btn-ghost:hover{border-color:var(--ink)}
.btn-line{border:1.5px solid color-mix(in srgb,currentColor 55%,transparent);color:inherit}
.btn-invert{background:var(--on-brand);color:var(--brand)}
.btn-small{min-height:40px;padding:0 1em;font-size:.9rem;background:var(--brand);color:var(--on-brand)}
.stars{display:inline-flex;gap:2px;color:#E0A100;vertical-align:-2px}.stars i{display:inline-flex;width:16px;height:16px;opacity:.28}.stars i.on{opacity:1}.stars svg{width:100%;height:100%}
.price{font-variant-numeric:tabular-nums;font-weight:650;color:var(--brand-ink);white-space:nowrap}
/* nav */
.top{position:relative;z-index:5;padding-block:18px}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{font-family:var(--display);font-weight:${Math.min(800, t.display.weight + 50)};font-size:1.3rem;letter-spacing:${t.display.tracking};text-decoration:none;${caps ? 'text-transform:uppercase;font-size:1.05rem;' : ''}${t.display.stretch ? `font-stretch:${t.display.stretch};` : ''}}
.top-links{display:flex;align-items:center;gap:22px;font-size:.95rem}
.top-links>a:not(.btn){text-decoration:none;opacity:.8;display:none}.top-links .btn{display:none}@media(min-width:900px){.top-links .btn{display:inline-flex}}
.top-links>a:not(.btn):hover{opacity:1}
@media(min-width:760px){.top-links>a:not(.btn){display:inline}}
.top.on-photo{position:absolute;inset:0 0 auto;color:#fff}
/* hero */
.hero{position:relative}
.hero-h{font-size:var(--s6)}
.hero-sub{font-size:var(--s1);line-height:1.45;max-width:38ch;margin-top:1.1rem;opacity:.92}
.hero-btns{margin-top:1.8rem}
.hero-open{margin-top:1.2rem;display:inline-flex;align-items:center;gap:.5em;font-size:.9rem;font-weight:500}
.hero-open::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.hero-open.is-open::before{background:#2BB24C;box-shadow:0 0 0 4px color-mix(in srgb,#2BB24C 25%,transparent)}
.hero-open.is-closed::before{background:#C2412D}
.hero-photo{min-height:min(94svh,900px);display:grid;align-items:end;color:#fff;isolation:isolate;overflow:hidden;background:var(--deep)}
.hero-photo .hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.hero-photo .scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.5) 0%,rgba(0,0,0,.08) 24%,rgba(0,0,0,.28) 46%,rgba(0,0,0,.82) 100%)}@media(min-width:900px){.hero-photo .scrim{background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.35) 48%,rgba(0,0,0,.05) 75%),linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 22%)}}
.hero-photo .hero-in{padding-block:120px clamp(40px,7vw,88px)}
.hero-photo .label{color:#fff;opacity:.9}
.hero-photo .hero-h em{color:#fff}
.hero-photo .btn-primary{box-shadow:none}
.hero-split{background:${t.mode === 'warm' ? 'var(--surface)' : 'var(--bg)'}}
.hero-split .hero-in{padding-block:clamp(24px,5vw,72px) clamp(56px,8vw,112px)}
.hero-img img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r-img)}
@media(min-width:900px){.hero-split .hero-img img{aspect-ratio:4/5;max-height:76svh}}
.hero-stack .hero-in{padding-block:clamp(24px,5vw,64px) clamp(28px,4vw,48px)}
.hero-stack .hero-h{font-size:clamp(2.8rem,1.2rem + 7.5vw,${caps ? '7rem' : '8.6rem'});max-width:16ch}
.hero-stack .hero-img img{aspect-ratio:4/5;border-radius:var(--r-img);object-fit:cover;width:100%}
@media(min-width:760px){.hero-stack .hero-img img{aspect-ratio:21/9}}
.hero-type{background:var(--deep);color:var(--on-deep);overflow:hidden}
.hero-type .hero-in{position:relative;padding-block:clamp(56px,10vw,140px)}
.hero-type .label{color:color-mix(in srgb,var(--on-deep) 75%,var(--brand))}
.hero-type .hero-h em{color:color-mix(in srgb,var(--brand) 55%,var(--on-deep))}
.monogram{position:absolute;right:-.05em;bottom:-.28em;font-family:var(--display);font-size:clamp(14rem,40vw,34rem);line-height:1;color:var(--brand);opacity:.22;pointer-events:none;z-index:0;${caps ? 'text-transform:uppercase;' : ''}}
.hero-type .hero-in>*:not(.monogram){position:relative;z-index:1}
.hero-type .btn-primary{background:var(--brand);color:var(--on-brand)}
@media(prefers-reduced-motion:no-preference){.hero-in>*,.hero-text>*{animation:rise .9s var(--ease) both}.hero-in>*:nth-child(2),.hero-text>*:nth-child(2){animation-delay:.08s}.hero-in>*:nth-child(3),.hero-text>*:nth-child(3){animation-delay:.16s}.hero-in>*:nth-child(4),.hero-text>*:nth-child(4){animation-delay:.24s}.hero-img img{animation:fade 1.2s var(--ease) both .1s}}
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@keyframes fade{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
/* strip */
.strip{border-block:1px solid var(--line);background:var(--bg)}
.strip ul{list-style:none;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:0}
@media(min-width:900px){.strip ul{grid-template-columns:repeat(4,1fr)}}
.strip li{display:flex;gap:12px;align-items:flex-start;padding:20px 16px 20px 0}
.strip li+li{border-left:0}
@media(min-width:900px){.strip li{padding:26px 24px}.strip li+li{border-left:1px solid var(--line)}.strip li:first-child{padding-left:0}}
.strip svg{width:22px;height:22px;flex:none;color:var(--brand-ink);margin-top:2px}
.strip b{display:block;font-weight:600;line-height:1.3}.strip small{display:block;color:var(--muted);font-size:var(--s-1);line-height:1.4;margin-top:2px}
/* offer */
.menu{display:grid;gap:clamp(28px,5vw,64px)}
@media(min-width:900px){.menu{grid-template-columns:1fr 1fr}}
.menu ul{list-style:none;margin:0;padding:0;display:grid;gap:22px}
.menu-cat{font-size:var(--s2);margin-bottom:22px}
.mi{display:flex;align-items:baseline;gap:.6em}
.mi-name{font-family:var(--display);font-weight:${Math.min(700, t.display.weight)};font-size:var(--s1);line-height:1.2;${caps ? 'text-transform:uppercase;font-size:var(--s0);letter-spacing:.01em;' : ''}${t.display.stretch ? `font-stretch:${t.display.stretch};` : ''}}
.dots{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-.3em);min-width:24px}
.mi-desc{color:var(--muted);font-size:var(--s-1);margin-top:4px;max-width:46ch}
.cards{display:grid;gap:clamp(16px,2.4vw,28px);grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}
.card{background:${dark ? 'var(--surface)' : t.mode === 'warm' ? '#fff' : 'var(--surface)'};border-radius:var(--r-card);overflow:hidden;display:flex;flex-direction:column;${t.rule ? 'border:1px solid var(--line);' : ''}}
.card-img img{width:100%;aspect-ratio:4/3;object-fit:cover}
.card-body{padding:22px;display:grid;gap:8px;align-content:start;flex:1}
.card-body p{color:var(--muted);font-size:var(--s-1)}
.card .price{margin-top:6px}
.features{display:grid;gap:clamp(48px,8vw,96px)}
.feature{display:grid;gap:clamp(20px,4vw,56px);align-items:center}
@media(min-width:900px){.feature{grid-template-columns:1fr 1fr}.feature.flip .feature-img{order:2}}
.feature-img img{width:100%;aspect-ratio:5/4;object-fit:cover;border-radius:var(--r-img)}
.feature-text{display:grid;gap:14px;max-width:46ch}
.feature-text h3{font-size:var(--s3)}
.feature-text p{color:var(--muted);font-size:var(--s1);line-height:1.5}
.num{font-family:${t.label === 'mono' ? 'var(--mono)' : 'var(--display)'};color:var(--brand-ink);font-size:1rem;font-weight:600;letter-spacing:.04em}
.offer-cta{margin-top:clamp(32px,5vw,56px)}
/* gallery */
.gallery figure{margin:0;overflow:hidden;border-radius:var(--r-img);background:var(--surface)}
.gallery img{width:100%;height:100%;object-fit:cover;transition:transform .8s var(--ease)}
.gallery figure:hover img{transform:scale(1.03)}
.gallery-grid .g{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(8px,1.2vw,14px)}
.gallery-grid figure{aspect-ratio:1}
.gallery-grid .g0{grid-column:span 2;aspect-ratio:4/3}
@media(min-width:900px){.gallery-grid .g{grid-template-columns:repeat(4,1fr)}.gallery-grid .g0{grid-column:span 2;grid-row:span 2;aspect-ratio:auto}.g-three .g{grid-template-columns:repeat(3,1fr)}.g-three .g0{grid-column:auto;grid-row:auto;aspect-ratio:1}}
.gallery-strip .g{display:grid;grid-auto-flow:column;grid-auto-columns:min(74vw,360px);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;scrollbar-width:thin}
.gallery-strip figure{aspect-ratio:4/5;scroll-snap-align:start}
.g-more{margin-top:22px}.g-more a{display:inline-flex;align-items:center;gap:.5em;font-weight:600;text-decoration:none;color:var(--brand-ink)}.g-more svg{width:20px;height:20px}
/* reviews */
.reviews{background:${dark ? 'var(--surface)' : 'var(--tint)'}}
.rating{display:flex;align-items:center;gap:.5em;flex-wrap:wrap}
.quotes{display:grid;gap:clamp(16px,2.4vw,28px)}
@media(min-width:900px){.reviews:not(.reviews-summary) .quotes{grid-template-columns:repeat(3,1fr)}}
.quote{margin:0;background:${dark ? 'var(--bg)' : '#fff'};border-radius:var(--r-card);padding:clamp(24px,3vw,36px);display:grid;gap:18px;align-content:start;${t.rule ? 'border:1px solid var(--line);' : ''}}
.qmark{font-family:var(--display);font-size:4rem;line-height:.6;color:var(--brand);height:.4em}
.quote blockquote{margin:0;font-size:var(--s1);line-height:1.45}
.quote figcaption{display:grid;gap:6px;font-size:var(--s-1);color:var(--muted)}
.reviews-summary .wrap{display:grid;gap:clamp(28px,5vw,64px)}
@media(min-width:900px){.reviews-summary .wrap{grid-template-columns:.7fr 1.3fr;align-items:start}}
.score .big{font-family:var(--display);font-size:clamp(4.5rem,3rem + 6vw,8rem);line-height:.9;font-weight:${t.display.weight};letter-spacing:-.04em}
.score .stars i{width:22px;height:22px}
.score .muted{margin-top:10px}
/* about */
.about-img img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r-img)}
.about-text{display:grid;gap:18px;max-width:52ch}
.about-text p{font-size:var(--s1);line-height:1.55;color:color-mix(in srgb,var(--ink) 82%,var(--bg))}
.about-statement{text-align:left}
.statement{font-family:var(--display);font-size:var(--s4);line-height:1.12;letter-spacing:${t.display.tracking};font-weight:${t.display.weight};margin-bottom:1.4rem;${caps ? 'text-transform:uppercase;' : ''}${t.display.stretch ? `font-stretch:${t.display.stretch};` : ''}}
/* steps */
.step-list{list-style:none;margin:0;padding:0;display:grid;gap:clamp(20px,3vw,32px);counter-reset:s}
@media(min-width:900px){.step-list{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}}
.step-list li{counter-increment:s;display:grid;gap:10px;align-content:start;padding-top:22px;border-top:2px solid var(--ink)}
.step-list .num::before{content:counter(s,decimal-leading-zero)}
.step-list h3{font-size:var(--s2)}
.step-list p{color:var(--muted)}
.steps-cta{margin-top:clamp(32px,5vw,48px)}
/* location */
.loc-info{display:grid;gap:18px;max-width:520px}
.addr{display:flex;gap:10px;align-items:flex-start;font-size:var(--s1);line-height:1.4}.addr svg{width:24px;height:24px;flex:none;color:var(--brand-ink);margin-top:3px}
.hours{border-collapse:collapse;width:100%;font-size:var(--s0)}
.hours caption{text-align:left;margin-bottom:10px}
.hours th,.hours td{padding:10px 0;border-bottom:1px solid var(--line);text-align:left;font-weight:400}
.hours td{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
.map{border-radius:var(--r-card);overflow:hidden;aspect-ratio:4/3;background:var(--surface);border:1px solid var(--line)}
.map iframe{width:100%;height:100%;border:0;display:block;${dark ? 'filter:invert(.9) hue-rotate(180deg) saturate(.6);' : 'filter:saturate(.75)'}}
.location-card .loc-info{background:var(--deep);color:var(--on-deep);border-radius:var(--r-card);padding:clamp(28px,5vw,56px);max-width:none}
.location-card .muted,.location-card .hours td{color:color-mix(in srgb,var(--on-deep) 70%,transparent)}
.location-card .hours th,.location-card .hours td{border-color:color-mix(in srgb,var(--on-deep) 18%,transparent)}
.location-card .addr svg,.location-card .label{color:color-mix(in srgb,var(--on-deep) 80%,var(--brand))}
.location-card .btn-ghost{color:var(--on-deep);border-color:color-mix(in srgb,var(--on-deep) 40%,transparent)}
/* faq */
.faq details{border-bottom:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 0;font-size:var(--s1);font-weight:500}
.faq summary::-webkit-details-marker{display:none}
.plus{width:22px;height:22px;flex:none;position:relative}.plus::before,.plus::after{content:"";position:absolute;inset:50% 0 auto;height:2px;background:currentColor;transition:transform .3s var(--ease)}.plus::after{transform:rotate(90deg)}
details[open] .plus::after{transform:rotate(0)}
.faq details p{padding:0 0 24px;color:var(--muted);max-width:62ch}
/* cta */
.cta{padding-block:clamp(72px,11vw,150px)}
.cta-band{background:var(--brand);color:var(--on-brand)}
.cta-band h2{font-size:var(--s5);max-width:18ch}
.cta-band .lede{color:inherit;opacity:.85;margin-top:1rem}
.cta-band .btns{margin-top:2rem}
.cta-card .wrap{background:var(--deep);color:var(--on-deep);border-radius:var(--r-card);padding:clamp(40px,7vw,96px) var(--gut);text-align:center;max-width:1100px}
.cta-card h2{font-size:var(--s5);margin-inline:auto;max-width:18ch}.cta-card .lede{margin:1rem auto 0;color:inherit;opacity:.8}.cta-card .btns{justify-content:center;margin-top:2rem}
.cta-card .btn-invert{background:var(--brand);color:var(--on-brand)}
/* footer */
.foot{padding-block:56px 120px;border-top:1px solid var(--line);font-size:var(--s-1)}
.foot .wrap{display:grid;gap:28px}
@media(min-width:900px){.foot .wrap{grid-template-columns:1fr 1fr;align-items:start}.foot{padding-bottom:56px}}
.foot ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.foot li{display:flex;gap:10px;align-items:flex-start}.foot li svg{width:18px;height:18px;flex:none;color:var(--brand-ink);margin-top:2px}
.foot .fine{grid-column:1/-1;color:var(--muted)}
.foot a{text-decoration:none}.foot a:hover{text-decoration:underline}
/* contact bar (phones) + floating WhatsApp (desktop) */
.bar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line)}
.bar a{display:flex;align-items:center;justify-content:center;gap:.45em;min-height:48px;border-radius:var(--r-btn);text-decoration:none;font-weight:600;font-size:.95rem;border:1.5px solid var(--line);color:var(--ink);background:var(--bg)}
.bar a svg{width:20px;height:20px}
.bar .b-wa{background:#1FA855;border-color:#1FA855;color:#fff;grid-column:span 2}
.float-wa{display:none}
@media(min-width:900px){.bar{display:none}.float-wa{display:grid;place-items:center;position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;background:#1FA855;color:#fff;box-shadow:0 12px 28px -10px rgba(0,0,0,.45);z-index:40;transition:transform .25s var(--ease)}.float-wa:hover{transform:scale(1.06)}.float-wa svg{width:30px;height:30px}}
/* reveal */
.js .rv{opacity:0;transform:translateY(18px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
.js .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}html{scroll-behavior:auto}}
`.replace(/\n/g, '');
}
