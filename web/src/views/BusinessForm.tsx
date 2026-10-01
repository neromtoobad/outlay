'use client';
// The business form: who you are, how customers reach you, what you sell (with your own photos), and how
// you want it to look. Four short steps, saved as a draft on this device so nothing is typed twice.
// Photos are shrunk in the browser before upload, so it stays quick on mobile data.
import { useEffect, useRef, useState } from 'react';

export type Details = {
  name: string; kind: string; offer: string; area: string; city: string;
  whatsapp: string; phone: string; email: string; address: string; maps: string;
  instagram: string; tiktok: string; facebook: string; website: string;
  menu: string; story: string; style: string; colour: string; sections: string[]; notes: string;
  logo?: string; photos: string[];
};

const KINDS: [string, string][] = [['food', 'Food & drinks'], ['beauty', 'Beauty & wellness'], ['creative', 'Photography & creative'], ['events', 'Events & weddings'], ['retail', 'Shop & products'], ['health', 'Health & clinics'], ['professional', 'Professional services'], ['other', 'Something else']];
// Mirrors server/src/site/themes.ts (ids must match).
const THEMES: { id: string; name: string; mood: string; font: string; bg: string; ink: string; italic?: boolean; caps?: boolean }[] = [
  { id: 'atelier', name: 'Editorial', mood: 'Warm serif, cream paper', font: "'Fraunces', serif", bg: '#FBF5EC', ink: '#2A1A10', italic: true },
  { id: 'street', name: 'Bold', mood: 'Loud, heavy, youthful', font: "'Archivo', sans-serif", bg: '#FFFFFF', ink: '#111111', caps: true },
  { id: 'salon', name: 'Elegant', mood: 'Fine serif, airy, soft', font: "'Cormorant Garamond', serif", bg: '#FBF8F6', ink: '#2B2320', italic: true },
  { id: 'studio', name: 'Minimal', mood: 'Photo-first, sharp edges', font: "'Space Grotesk', sans-serif", bg: '#F6F6F4', ink: '#141414' },
  { id: 'clinic', name: 'Calm', mood: 'Clear, trustworthy', font: "'Literata', serif", bg: '#F4F8FA', ink: '#14212B' },
  { id: 'market', name: 'Playful', mood: 'Round, bright, friendly', font: "'Unbounded', sans-serif", bg: '#FFF8E8', ink: '#1E1A10' },
  { id: 'lounge', name: 'Dark luxe', mood: 'Night-time, refined', font: "'Fraunces', serif", bg: '#17120F', ink: '#F4EDE4', italic: true },
];
const SECTIONS: [string, string][] = [['offer', 'Menu / prices'], ['gallery', 'Photo gallery'], ['reviews', 'Google reviews'], ['about', 'About us'], ['steps', 'How to order or book'], ['location', 'Map & opening hours'], ['faq', 'Questions & answers']];
const SWATCHES = ['#C0392B', '#D4380D', '#E67E22', '#D4A017', '#2E7D32', '#0F766E', '#1D4ED8', '#6D28D9', '#BE185D', '#111827'];
const EMPTY: Details = { name: '', kind: 'food', offer: '', area: '', city: 'Lagos', whatsapp: '', phone: '', email: '', address: '', maps: '', instagram: '', tiktok: '', facebook: '', website: '', menu: '', story: '', style: 'auto', colour: '', sections: SECTIONS.map(([k]) => k), notes: '', photos: [] };
const KEY = 'syncly:business';

/** Shrink a photo to at most 2000 px and re-encode it as JPEG before upload. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode'))), 'image/jpeg', 0.86));
  } catch { return file; }
}
async function upload(files: File[]): Promise<string[]> {
  const fd = new FormData();
  for (const f of files) fd.append('file', await shrink(f), f.name.replace(/\.\w+$/, '.jpg'));
  const r = await fetch('/api/uploads', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Upload failed');
  return j.uploads.map((u: { id: string }) => u.id);
}

export default function BusinessForm({ onSubmit, busy, email, setEmail, cta }: { onSubmit: (d: Details) => void; busy: boolean; email: string; setEmail: (v: string) => void; cta: string }) {
  const [d, setD] = useState<Details>(EMPTY);
  const [step, setStep] = useState(0);
  const [up, setUp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loaded = useRef(false);
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setD({ ...EMPTY, ...JSON.parse(s) }); } catch {} loaded.current = true; }, []);
  useEffect(() => { if (loaded.current) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d]);
  const set = <K extends keyof Details>(k: K, v: Details[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Details, label: string, ph: string, hint?: string, type = 'text') => (
    <label className="field">{label}{hint && <span className="hint">{hint}</span>}<input type={type} value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} placeholder={ph} /></label>
  );
  async function addPhotos(list: FileList | null, logo = false) {
    if (!list?.length) return;
    setErr(null); setUp(logo ? 'logo' : 'photos');
    try {
      const files = [...list].filter((f) => f.type.startsWith('image/')).slice(0, logo ? 1 : 10 - d.photos.length);
      const ids = await upload(files);
      if (logo) set('logo', ids[0]); else set('photos', [...d.photos, ...ids].slice(0, 10));
    } catch (e: any) { setErr(e.message); } finally { setUp(null); }
  }

  const ok = [d.name.trim() && d.offer.trim(), d.whatsapp.trim() || d.phone.trim() || d.email.trim(), true, email.includes('@')];
  const STEPS = ['Your business', 'Contact & links', 'What you sell', 'The look'];

  return (
    <div className="bform">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,500&family=Archivo:wdth,wght@125,850&family=Cormorant+Garamond:ital,wght@1,500&family=Space+Grotesk:wght@500&family=Literata:wght@600&family=Unbounded:wght@700&display=swap" />
      <ol className="bsteps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><button type="button" onClick={() => setStep(i)}><span>{i + 1}</span>{s}</button></li>)}</ol>

      {step === 0 && (
        <div className="form">
          {text('name', 'Business name', 'Tolu’s Small Chops')}
          <label className="field">What kind of business
            <select value={d.kind} onChange={(e) => set('kind', e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          {text('offer', 'What you sell, in one line', 'Small chops trays and party catering for events across Lagos')}
          <div className="two-up">{text('area', 'Area', 'Surulere')}{text('city', 'City', 'Lagos')}</div>
        </div>
      )}

      {step === 1 && (
        <div className="form">
          <div className="two-up">{text('whatsapp', 'WhatsApp number', '0803 555 0142', undefined, 'tel')}{text('phone', 'Phone (if different)', '', undefined, 'tel')}</div>
          {text('address', 'Address', '14 Adelabu Street, Surulere, Lagos', 'Leave it out if you don’t have a shop or office customers visit.')}
          {text('maps', 'Google Maps link', 'https://maps.app.goo.gl/…', 'If you’re on Google Maps, we pull your hours and real reviews from it.', 'url')}
          <div className="two-up">{text('instagram', 'Instagram', '@yourbusiness')}{text('tiktok', 'TikTok', '@yourbusiness')}</div>
          <div className="two-up">{text('facebook', 'Facebook page', 'yourbusiness')}{text('website', 'Current website', 'yourbusiness.com')}</div>
          {text('email', 'Business email (shown on the site)', 'hello@yourbusiness.com', undefined, 'email')}
        </div>
      )}

      {step === 2 && (
        <div className="form">
          <label className="field">Menu or prices <span className="hint">One per line, like “Party tray (20 guests) – ₦25,000”. A line ending with “:” starts a group. Only what you write here, your posts and your listing will ever show as a price.</span>
            <textarea value={d.menu} onChange={(e) => set('menu', e.target.value)} placeholder={'Trays:\nParty tray (20 guests) – ₦25,000\nParty tray (50 guests) – ₦58,000\nBy the piece:\nPuff-puff (50 pieces) – ₦6,000'} />
          </label>
          <label className="field">Your story <span className="hint">Optional. A few lines in your own words: how you started, what you’re known for.</span>
            <textarea style={{ minHeight: 90 }} value={d.story} onChange={(e) => set('story', e.target.value)} />
          </label>
          <div className="field">Your photos <span className="hint">Up to 10. Your real food, work, shop or team; we never use flyers as photos. If you skip this, we use your Instagram.</span>
            <div className="uploads">
              {d.photos.map((id) => <figure key={id}><img src={`/api/uploads/${id}`} alt="" /><button type="button" aria-label="Remove" onClick={() => set('photos', d.photos.filter((x) => x !== id))}>×</button></figure>)}
              {d.photos.length < 10 && <label className="addph">{up === 'photos' ? 'Uploading…' : '+ Add photos'}<input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} hidden /></label>}
            </div>
          </div>
          <div className="field">Logo <span className="hint">Optional. It goes in the header and sets the colours.</span>
            <div className="uploads">
              {d.logo && <figure className="logo"><img src={`/api/uploads/${d.logo}`} alt="" /><button type="button" aria-label="Remove" onClick={() => set('logo', undefined)}>×</button></figure>}
              {!d.logo && <label className="addph">{up === 'logo' ? 'Uploading…' : '+ Add logo'}<input type="file" accept="image/*" onChange={(e) => addPhotos(e.target.files, true)} hidden /></label>}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="form">
          <div className="field">Style
            <div className="themes">
              <button type="button" className={`theme auto${d.style === 'auto' ? ' on' : ''}`} onClick={() => set('style', 'auto')}><b>Choose for me</b><span>The designer picks what fits your business</span></button>
              {THEMES.map((t) => (
                <button type="button" key={t.id} className={`theme${d.style === t.id ? ' on' : ''}`} onClick={() => set('style', t.id)} style={{ background: t.bg, color: t.ink }}>
                  <i style={{ fontFamily: t.font, fontStyle: t.italic ? 'italic' : 'normal', textTransform: t.caps ? 'uppercase' : 'none', fontStretch: t.caps ? '125%' : undefined }}>Aa</i>
                  <b>{t.name}</b><span>{t.mood}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">Colour
            <div className="swatches">
              <button type="button" className={`sw auto${!d.colour ? ' on' : ''}`} onClick={() => set('colour', '')}>From my photos</button>
              {SWATCHES.map((c) => <button type="button" key={c} className={`sw${d.colour.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => set('colour', c)} />)}
              <label className="sw pick" title="Your exact brand colour"><input type="color" value={d.colour || '#2E7A38'} onChange={(e) => set('colour', e.target.value)} />Pick</label>
            </div>
          </div>
          <div className="field">Sections <span className="hint">We only add a section when we have real content for it.</span>
            <div className="checks">{SECTIONS.map(([k, l]) => <label key={k} className={`chip click${d.sections.includes(k) ? ' on' : ''}`}><input type="checkbox" hidden checked={d.sections.includes(k)} onChange={(e) => set('sections', e.target.checked ? [...d.sections, k] : d.sections.filter((x) => x !== k))} />{l}</label>)}</div>
          </div>
          <label className="field">Anything else <span className="hint">Optional: colours to avoid, words to use, what to highlight.</span>
            <textarea style={{ minHeight: 80 }} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          <label className="field">Your email <span className="hint">We send the finished site here. It’s also your key to accept, revise or reject.</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </label>
        </div>
      )}

      {err && <div className="error">{err}</div>}
      <div className="bnav">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3
          ? <button type="button" className="btn primary" disabled={!ok[step]} onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</button>
          : <button type="button" className="btn primary" disabled={busy || !ok[0] || !ok[1] || !ok[3] || !!up} onClick={() => onSubmit(d)}>{busy ? 'The CFO is pricing it…' : cta}</button>}
      </div>
      {!ok[step] && step < 2 && <p className="muted" style={{ fontSize: 13 }}>{step === 0 ? 'Add the business name and what you sell.' : 'Add at least one way customers can reach you.'}</p>}
    </div>
  );
}
