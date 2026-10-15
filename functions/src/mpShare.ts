// Growth release — "Share everywhere" functions.
//   mpLink           GET /l/:code                 tracked short-link redirect (Hosting rewrite)
//   mpStorefrontApi  GET /api/storefront/:slug[/:cartId]  public storefront JSON (Hosting rewrite)
//   mpStorefrontPage GET /s/**                    the storefront SPA with per-page/per-cart share tags injected
//                                                 (og:title/description/image, canonical) so Facebook, iMessage
//                                                 and Google see them — a plain single-page app serves none.
//   mpSitemap        GET /sitemap.xml             storefront + every in-stock cart (SEO-friendly URLs)
// All run in us-central1 to match the rewrites in firebase.json.
import * as logger from 'firebase-functions/logger';
import {onRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import {loadSalesSettings, type DayHours, type WeekDay} from './sales/settings';

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://jaslowiot.com';
const PHOTO_BASE = process.env.PHOTO_BASE || '';
const LINKS = 'mp_links';
const CLICKS = 'mp_clicks';
const CARTS = 'mp_carts';
const STOREFRONTS = 'mp_storefronts';
const SETTINGS = 'mp_settings/general';
const REGION = 'us-central1';

type Json = Record<string, any>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'Yes' || v === 'yes';
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c]!));

/** SEO-friendly URL slug, e.g. "2024-evolution-d5-ranger-4-black". Keeps the cart id for lookup; this is the readable tail. */
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const cartSeoSlug = (c: PublicCart) => slugify([c.year, c.make, c.model, c.color, c.isUsed ? 'used' : ''].filter(Boolean).join(' ')) || 'golf-cart';

/** Link-preview fetchers and crawlers: redirected, but not counted as clicks. */
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|preview|whatsapp\/|telegram|discord|embedly|skype|curl|wget|python-requests|headless/i;
const isBot = (ua: string) => !ua || BOT_RE.test(ua);

// ---------------------------------------------------------------------------
// Store info (copy of the essentials of frontend/src/mp/constants.ts DEALERSHIPS)
// ---------------------------------------------------------------------------

export interface Store {id: string; name: string; cityState: string; phone: string; address: string; maps: string}

export const STORES: Store[] = [
  {id: 'T0', name: 'JASLOW IOT', cityState: '', phone: process.env.COMPANY_PHONE || '', address: '', maps: ''},
];
export const STORE_BY_ID: Record<string, Store> = Object.fromEntries(STORES.map((s) => [s.id, s]));
const NATIONAL_PHONE = STORE_BY_ID.T0.phone;
const city = (id: string) => (STORE_BY_ID[id]?.cityState || '').split(',')[0];
const locName = (id: string) => STORE_BY_ID[id]?.cityState || STORE_BY_ID[id]?.name || id || 'Other';

// ---------------------------------------------------------------------------
// Public cart mapper (DMS payload → public fields only; no serial/VIN/invoice)
// ---------------------------------------------------------------------------

/** Public cart as returned by mpStorefrontApi (mirrors frontend/src/storefront/api.ts PublicCart). */
export interface PublicCart {
  id: string;
  title: string;
  year: string;
  make: string;
  model: string;
  color: string;
  price: number;
  isUsed: boolean;
  isElectric: boolean;
  passengers: number;
  lifted: boolean;
  streetLegal: boolean;
  battery: string;
  locationId: string;
  location: string;
  photos: string[];
  features: string[];
  description: string;
  /** Walk-around videos (Firebase Storage download URLs). */
  videos: string[];
  /** Storefront filters. */
  utility: boolean;
  allTerrain: boolean;
  /** True when `photos` are stock images for the model, not photos of this cart. */
  stockPhotos: boolean;
  /** General product (Products section), not a golf cart. */
  isProduct?: boolean;
  category?: string;
}

/** DMS fill-ins that aren't a real make/model ("Other", "N/A", ...). Same rule as frontend cartLogic.isPlaceholder. */
const isPlaceholder = (v: string) => /^(other|others|n\/?a|none|unknown|tbd|-+|\.)$/i.test(v.trim());

/** Words about the cart used in place of a model of "Other" (same rule as frontend cartLogic.cartKind). */
function cartKind(lifted: boolean, passengers: number, streetLegal: boolean, isElectric: boolean, lithium: boolean): string {
  const parts = [lifted ? 'Lifted' : '', passengers ? `${passengers} Passenger` : ''].filter(Boolean);
  if (parts.length) return `${parts.join(' ')} Cart`;
  if (streetLegal) return 'Street Legal Golf Cart';
  if (!isElectric) return 'Gas Golf Cart';
  return lithium ? 'Lithium Golf Cart' : 'Golf Cart';
}

/** Storefronts only show carts with at least this many pictures. */
const MIN_PHOTOS = 2;

const photoUrl = (f: string) => (/^https?:\/\//i.test(f) ? f : PHOTO_BASE + f);
const cleanList = (a: unknown) => (Array.isArray(a) ? a : []).map(str).filter((s) => s && !/^null$/i.test(s));

function isUsedPayload(p: Json): boolean {
  if (typeof p.isUsed === 'boolean') return p.isUsed;
  if (typeof p.isNew === 'boolean') return !p.isNew;
  const cond = str(p.condition || p.cartCondition);
  return cond ? !/^new/i.test(cond) : true;
}

function featureLines(p: Json, isUsed: boolean, isElectric: boolean): string[] {
  const attrs = obj(p.cartAttributes);
  const batt = obj(p.battery);
  const out: string[] = [isUsed ? 'Pre-owned' : 'Brand new'];
  if (bool(obj(p.title).isStreetLegal)) out.push('Street legal');
  if (bool(attrs.isLifted)) out.push('Lifted');
  const pass = parseInt(str(attrs.passengers).match(/\d+/)?.[0] || '0', 10);
  if (pass) out.push(`${pass} passenger`);
  if (isElectric) {
    const v = str(batt.packVoltage).replace(/\s*v(olt)?s?$/i, '');
    const type = str(batt.type);
    if (type || v) out.push([v && `${v}V`, /lith|lifepo|li-ion/i.test(type) ? 'lithium battery' : type ? `${type.toLowerCase()} battery` : 'battery'].filter(Boolean).join(' '));
    else out.push('Electric');
  } else {
    out.push(`Gas${str(obj(p.engine).make) ? ` · ${str(obj(p.engine).make)} engine` : ''}`);
  }
  const color = str(attrs.cartColor);
  const seat = str(attrs.seatColor);
  if (color) out.push(`${color} paint${seat ? ` with ${seat.toLowerCase()} seats` : ''}`);
  const rim = str(attrs.tireRimSize).replace(/"/g, '');
  if (rim) out.push(`${rim}" wheels${str(attrs.tireType) ? ` · ${str(attrs.tireType).toLowerCase()} tires` : ''}`);
  if (bool(attrs.hasExtendedTop)) out.push('Extended roof');
  if (bool(attrs.hasSoundSystem)) out.push('Sound system');
  if (bool(attrs.hasHitch)) out.push('Trailer hitch');
  out.push('Financing available');
  return out;
}

function parsePayload(data: Json): Json {
  try {
    const p = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
    return obj(p);
  } catch {
    return {};
  }
}

/** Maps an mp_carts doc to its public shape, or null when it must not be shown publicly. */
export function publicCart(id: string, data: Json): PublicCart | null {
  if (data.soldLocally === true) return null;
  // "Do not post" on the cart page (wrong photos, not ready…) also keeps it off the public storefront.
  if (data.doNotPost) return null;
  const p = parsePayload(data);
  if (p.isInStock === false || str(p.status).toLowerCase() === 'sold' || bool(p.isDraft)) return null;
  // DMS "delete" flags (not for products, whose free-text description may contain the word).
  if (p._mpKind !== 'product' && /delete/i.test(str(data.payload))) return null;
  const type = obj(p.cartType);
  const attrs = obj(p.cartAttributes);
  const batt = obj(p.battery);
  const loc = obj(p.cartLocation);
  const isUsed = isUsedPayload(p);
  const isElectric = p.isElectric !== false;
  const locationId = str(loc.locationId) || str(loc.latestStoreId) || str(data.locationId) || 'Other';
  let photos = cleanList(p.imageUrls);
  if (!photos.length) photos = cleanList(p.internalCartImageUrls);
  if (!photos.length) photos = cleanList(data.photoUrls);
  // Stock web images for the model/color, only when the cart doesn't have enough photos of its own.
  const stockPhotos = photos.length < MIN_PHOTOS && cleanList(p._mpDefaultImages).length >= MIN_PHOTOS;
  if (stockPhotos) photos = cleanList(p._mpDefaultImages);
  if (p._mpKind === 'product') return publicProduct(id, data, p, photos, locationId, isUsed);
  const passengers = parseInt(str(attrs.passengers).match(/\d+/)?.[0] || '0', 10);
  const lifted = bool(attrs.isLifted);
  const streetLegal = bool(obj(p.title).isStreetLegal);
  const make = isPlaceholder(str(type.make)) ? '' : str(type.make);
  const model = isPlaceholder(str(type.model)) ?
    cartKind(lifted, passengers, streetLegal, isElectric, /lith|lifepo|li-ion/i.test(str(batt.type))) : str(type.model);
  const color = str(attrs.cartColor);
  const year = str(type.year);
  const features = featureLines(p, isUsed, isElectric);
  const name = [year, make, model].filter(Boolean).join(' ') || 'Golf cart';
  const description = `${isUsed ? 'Pre-owned' : 'New'} ${name}${color ? ` in ${color.toLowerCase()}` : ''}. ` +
    `${features.slice(1, -1).map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join(', ')}. Available at Jaslow Digital ${locName(locationId)}. Financing and delivery available.`;
  return {
    id,
    title: [make, model, color, city(locationId)].filter(Boolean).join(' ') || name,
    year, make, model, color,
    price: Number(p.retailPrice) || 0,
    isUsed,
    isElectric,
    passengers,
    lifted,
    streetLegal,
    battery: isElectric ? [str(batt.packVoltage), str(batt.type)].filter(Boolean).join(' ') : '',
    locationId,
    location: locName(locationId),
    photos: photos.map(photoUrl),
    features,
    description: description.replace(/\.\s*\./g, '.').replace(/\s+/g, ' '),
    videos: cleanList(data.videos).filter((u) => /^https:\/\//i.test(u)),
    utility: str(p._mpCategory) === 'utility' || /\b(utility|utv|hauler|cargo)\b/i.test(`${make} ${model}`),
    stockPhotos,
    allTerrain: /all[\s-]?terrain|off[\s-]?road|\bA\/?T\b/i.test(str(attrs.tireType)),
  };
}

const CONDITION_LABELS: Record<string, string> = {
  new: 'New', used_like_new: 'Used - like new', used_good: 'Used - good', used_fair: 'Used - fair',
};

/** A general product (Products section) for the storefront. Internal fields (cost, quantity) are not exposed. */
function publicProduct(id: string, data: Json, p: Json, photos: string[], locationId: string, isUsed: boolean): PublicCart {
  const pr = obj(p._mpProduct);
  const name = str(pr.name) || str(obj(p.cartType).model) || 'Item';
  const brand = str(pr.brand);
  const specs = (Array.isArray(pr.specs) ? pr.specs : [])
    .map((x) => ({label: str(obj(x).label), value: str(obj(x).value)}))
    .filter((x) => x.label && x.value);
  const features = [
    CONDITION_LABELS[str(pr.condition)] || (isUsed ? 'Used' : 'New'),
    brand ? `Brand: ${brand}` : '',
    str(pr.sku) ? `SKU: ${str(pr.sku)}` : '',
    ...specs.map((x) => `${x.label}: ${x.value}`),
  ].filter(Boolean);
  return {
    id,
    title: name,
    year: '', make: brand, model: name, color: str(obj(p.cartAttributes).cartColor),
    price: Number(p.retailPrice) || 0,
    isUsed,
    isElectric: false,
    passengers: 0,
    lifted: false,
    streetLegal: false,
    battery: '',
    locationId,
    location: locName(locationId),
    photos: photos.map(photoUrl),
    features,
    description: str(p._mpDescription) || `${name}${brand ? ` by ${brand}` : ''}.`,
    videos: cleanList(data.videos).filter((u) => /^https:\/\//i.test(u)),
    utility: false,
    stockPhotos: false,
    allTerrain: false,
    isProduct: true,
    category: str(pr.category),
  };
}

// Mapped in-stock carts are cached per instance for a couple of minutes (Hosting's CDN caches responses too).
let cartCache: {at: number; carts: PublicCart[]} | null = null;

export async function allPublicCarts(): Promise<PublicCart[]> {
  if (cartCache && Date.now() - cartCache.at < 120_000) return cartCache.carts;
  const snap = await admin.firestore().collection(CARTS).get();
  const carts: PublicCart[] = [];
  snap.forEach((d) => {
    const c = publicCart(d.id, d.data());
    if (c) carts.push(c);
  });
  // A cart's own photo that also shows up on several other carts is a placeholder, not a photo of this cart.
  const uses = new Map<string, number>();
  for (const c of carts) if (!c.stockPhotos) for (const u of new Set(c.photos)) uses.set(u, (uses.get(u) || 0) + 1);
  for (const c of carts) if (!c.stockPhotos) c.photos = c.photos.filter((u) => (uses.get(u) || 0) < 3);
  cartCache = {at: Date.now(), carts};
  return carts;
}

// ---------------------------------------------------------------------------
// mpLink — tracked short-link redirect
// ---------------------------------------------------------------------------

function ogHtml(target: string, c: PublicCart): string {
  const title = esc(`${c.year ? c.year + ' ' : ''}${c.title}${c.price ? ` — $${c.price.toLocaleString('en-US')}` : ''}`);
  const desc = esc(c.description.slice(0, 280));
  const img = c.photos[0] ? `<meta property="og:image" content="${esc(c.photos[0])}">` : '';
  const t = esc(target);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta property="og:type" content="product"><meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${desc}">${img}<meta property="og:url" content="${t}">` +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<meta http-equiv="refresh" content="0;url=${t}"></head><body><a href="${t}">${title}</a></body></html>`;
}

/** GET /l/:code → counts the click (humans only) and 302-redirects to the link's target. */
export const mpLink = onRequest({region: REGION, maxInstances: 20}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = str(req.path.split('/').filter(Boolean).pop());
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) {
    res.redirect(302, PUBLIC_ORIGIN);
    return;
  }
  const db = admin.firestore();
  try {
    const ref = db.collection(LINKS).doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      res.redirect(302, PUBLIC_ORIGIN);
      return;
    }
    const link = snap.data() as Json;
    // Only redirect within the public site (no open redirects).
    const target = str(link.target).startsWith(`${PUBLIC_ORIGIN}/`) ? str(link.target) : PUBLIC_ORIGIN;
    const ua = str(req.get('user-agent'));
    if (isBot(ua) || req.method !== 'GET') {
      // Link previews (Facebook, X, iMessage…) get Open Graph tags for the cart, then the redirect.
      const cartDoc = link.cartId ? await db.collection(CARTS).doc(str(link.cartId)).get() : null;
      const c = cartDoc?.exists ? publicCart(cartDoc.id, cartDoc.data() || {}) : null;
      if (c) {
        res.status(200).type('html').send(ogHtml(target, c));
        return;
      }
      res.redirect(302, target);
      return;
    }
    const click: Json = {
      code,
      cartId: str(link.cartId),
      userId: str(link.userId),
      deviceId: str(link.deviceId),
      platform: str(link.platform) || 'other',
      ts: Date.now(),
      referrer: str(req.get('referer')).slice(0, 300),
      userAgent: ua.slice(0, 200),
    };
    if (link.variant) click.variant = link.variant;
    if (link.abTestId) click.abTestId = link.abTestId;
    const batch = db.batch();
    batch.update(ref, {clicks: FieldValue.increment(1), lastClickAt: Date.now()});
    batch.set(db.collection(CLICKS).doc(), click);
    await batch.commit().catch((e) => logger.warn('mpLink: count failed', code, e));
    res.redirect(302, target);
  } catch (e) {
    logger.error('mpLink failed', code, e);
    res.redirect(302, PUBLIC_ORIGIN);
  }
});

// ---------------------------------------------------------------------------
// mpStorefrontApi — public storefront JSON
// ---------------------------------------------------------------------------

interface PublicStorefront {
  slug: string;
  title: string;
  tagline: string;
  phone: string;
  locationIds: string[];
  pinnedCartIds: string[];
  showNew: boolean;
  showUsed: boolean;
}

const DEFAULT_STOREFRONT: PublicStorefront = {
  slug: 'jaslow',
  title: 'Jaslow Digital',
  tagline: 'New & pre-owned golf carts · financing & delivery available',
  phone: NATIONAL_PHONE,
  locationIds: [],
  pinnedCartIds: [],
  showNew: true,
  showUsed: true,
};

async function loadStorefront(slug: string): Promise<PublicStorefront | null> {
  const db = admin.firestore();
  const snap = await db.collection(STOREFRONTS).doc(slug).get();
  if (!snap.exists) return slug === 'jaslow' ? DEFAULT_STOREFRONT : null;
  const d = snap.data() as Json;
  if (d.published !== true) return slug === 'jaslow' ? DEFAULT_STOREFRONT : null;
  const locationIds = (Array.isArray(d.locationIds) ? d.locationIds : []).map(str).filter(Boolean);
  let phone = str(d.phone);
  if (!phone) {
    const settings = await db.doc(SETTINGS).get().catch(() => null);
    phone = str(settings?.get('defaultPhone')) || (locationIds.length === 1 ? STORE_BY_ID[locationIds[0]]?.phone || '' : '') || NATIONAL_PHONE;
  }
  return {
    slug,
    title: str(d.title) || 'Jaslow Digital',
    tagline: str(d.tagline),
    phone,
    locationIds,
    pinnedCartIds: (Array.isArray(d.pinnedCartIds) ? d.pinnedCartIds : []).map(str).filter(Boolean),
    showNew: d.showNew !== false,
    showUsed: d.showUsed !== false,
  };
}

/** 0 = the cart's own photos, 1 = stock images, 2 = no picture (lower shows first). */
const photoRank = (c: PublicCart) => (!c.photos.length ? 2 : c.stockPhotos ? 1 : 0);

function storefrontCarts(sf: PublicStorefront, carts: PublicCart[]): PublicCart[] {
  const pinned = new Map(sf.pinnedCartIds.map((id, i) => [id, i]));
  return carts
    // Only carts with at least two pictures (the page also hides any whose pictures don't load).
    .filter((c) => c.photos.length >= MIN_PHOTOS)
    .filter((c) => pinned.has(c.id) || (
      (!sf.locationIds.length || sf.locationIds.includes(c.locationId)) &&
      (c.isUsed ? sf.showUsed : sf.showNew)))
    .sort((a, b) => {
      const pa = pinned.get(a.id) ?? Infinity;
      const pb = pinned.get(b.id) ?? Infinity;
      if (pa !== pb) return pa - pb;
      // Carts with their own photos first, then stock images, then no picture.
      if (photoRank(a) !== photoRank(b)) return photoRank(a) - photoRank(b);
      if (a.isUsed !== b.isUsed) return a.isUsed ? -1 : 1;
      return b.price - a.price;
    });
}

const storesFor = (ids: string[]) => ids.map((id) => STORE_BY_ID[id]).filter(Boolean);

/** Store hours shown on storefronts: the team's visit hours (Sell more → booking settings). */
async function storeHours(): Promise<Record<WeekDay, DayHours> | null> {
  return (await loadSalesSettings().catch(() => null))?.booking.hours || null;
}

/** GET /api/storefront/:slug → storefront + carts; GET /api/storefront/:slug/:cartId → one cart. */
export const mpStorefrontApi = onRequest({region: REGION, maxInstances: 20}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({error: 'GET only'});
    return;
  }
  const parts = req.path.split('/').filter(Boolean);
  const i = parts.indexOf('storefront');
  const slug = str(parts[i >= 0 ? i + 1 : 0]).toLowerCase();
  const cartId = str(parts[i >= 0 ? i + 2 : 1]);
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || (cartId && !/^[A-Za-z0-9_-]{1,128}$/.test(cartId))) {
    res.set('Cache-Control', 'public, max-age=60');
    res.status(404).json({error: 'Not found'});
    return;
  }
  try {
    const sf = await loadStorefront(slug);
    if (!sf) {
      res.set('Cache-Control', 'public, max-age=60');
      res.status(404).json({error: 'Storefront not found'});
      return;
    }
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    const {pinnedCartIds: _pinned, ...storefront} = sf;
    void _pinned;
    if (cartId) {
      const snap = await admin.firestore().collection(CARTS).doc(cartId).get();
      const cart = snap.exists ? publicCart(snap.id, snap.data() || {}) : null;
      if (!cart) {
        res.set('Cache-Control', 'public, max-age=60');
        res.status(404).json({error: 'This cart is no longer available', storefront});
        return;
      }
      res.json({storefront, dealership: STORE_BY_ID[cart.locationId] || null, cart, hours: await storeHours()});
      return;
    }
    const carts = storefrontCarts(sf, await allPublicCarts());
    const locIds = sf.locationIds.length ? sf.locationIds : [...new Set(carts.map((c) => c.locationId))];
    res.json({storefront, dealerships: storesFor(locIds), carts, hours: await storeHours()});
  } catch (e) {
    logger.error('mpStorefrontApi failed', slug, e);
    res.set('Cache-Control', 'no-store');
    res.status(500).json({error: 'Something went wrong'});
  }
});

// ---------------------------------------------------------------------------
// mpStorefrontPage — the storefront SPA with share tags injected (so crawlers see them)
// ---------------------------------------------------------------------------

// The built index.html (the single-page app shell), fetched from Hosting once and kept a few minutes. The app
// still boots and renders for people; we only add the <head> tags that a crawler reads without running JavaScript.
let shellCache: {at: number; html: string} | null = null;
const SHELL_TTL = 5 * 60_000;
async function appShell(): Promise<string> {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL) return shellCache.html;
  const res = await fetch(`${PUBLIC_ORIGIN}/index.html`, {headers: {'user-agent': 'jaslow-og'}});
  if (!res.ok) throw new Error(`shell ${res.status}`);
  const html = await res.text();
  shellCache = {at: Date.now(), html};
  return html;
}

interface PageMeta {title: string; description: string; image: string; url: string; type: 'website' | 'product'}

/** Replaces the shell's <title> and adds Open Graph / Twitter / description / canonical tags. */
function injectMeta(shell: string, m: PageMeta): string {
  const t = esc(m.title);
  const d = esc(m.description.replace(/\s+/g, ' ').trim().slice(0, 300));
  const tags = [
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    `<meta property="og:site_name" content="Jaslow Digital">`,
    `<meta property="og:type" content="${m.type}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}">` : '',
  ].filter(Boolean).join('');
  const withTitle = /<title>[\s\S]*?<\/title>/i.test(shell)
    ? shell.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
    : shell.replace(/<head(\s[^>]*)?>/i, (h) => `${h}<title>${t}</title>`);
  // Drop any <meta property="og:..."> already in the shell, then add ours before </head>.
  return withTitle.replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>/gi, '')
    .replace(/<\/head>/i, `${tags}</head>`);
}

const DEFAULT_DESC = 'New & pre-owned golf carts from Jaslow Digital — financing, trade-ins and delivery available.';

/** GET /s/:slug and /s/:slug/:cartId[/:seo] — the storefront app with the right share tags for the page. */
export const mpStorefrontPage = onRequest({region: REGION, maxInstances: 20}, async (req, res) => {
  const parts = req.path.split('/').filter(Boolean); // ['s', slug, cartId?, seo?]
  const slug = str(parts[1]).toLowerCase();
  const cartId = str(parts[2]);
  const host = str(req.get('x-forwarded-host')) || str(req.hostname) || 'jaslowiot.com';
  const canonical = `https://${host}${req.path}`.replace(/\/+$/, '');
  const fallback: PageMeta = {title: 'Jaslow Digital', description: DEFAULT_DESC, image: '', url: canonical, type: 'website'};

  try {
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).type('html').send(injectMeta(await appShell(), fallback));
      return;
    }
    const sf = await loadStorefront(slug);
    let meta = fallback;
    if (sf && cartId && /^[A-Za-z0-9_-]{1,128}$/.test(cartId)) {
      const snap = await admin.firestore().collection(CARTS).doc(cartId).get();
      const c = snap.exists ? publicCart(snap.id, snap.data() || {}) : null;
      if (c) {
        meta = {
          title: `${c.year ? c.year + ' ' : ''}${c.title}${c.price ? ` — $${c.price.toLocaleString('en-US')}` : ''}`,
          description: c.description, image: c.photos[0] || '',
          url: `https://${host}/s/${slug}/${encodeURIComponent(c.id)}/${cartSeoSlug(c)}`, type: 'product',
        };
      }
    } else if (sf) {
      const carts = storefrontCarts(sf, await allPublicCarts());
      meta = {
        title: sf.title || 'Jaslow Digital',
        description: sf.tagline || DEFAULT_DESC,
        image: carts.find((c) => c.photos[0] && !c.stockPhotos)?.photos[0] || carts.find((c) => c.photos[0])?.photos[0] || '',
        url: `https://${host}/s/${slug}`, type: 'website',
      };
    }
    res.set('Cache-Control', 'public, max-age=120, s-maxage=300');
    res.status(200).type('html').send(injectMeta(await appShell(), meta));
  } catch (e) {
    logger.error('mpStorefrontPage failed', req.path, e);
    // Last resort: still give crawlers the tags; the inline script sends people on to the app.
    res.set('Cache-Control', 'no-store');
    res.status(200).type('html').send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<title>${esc(fallback.title)}</title><meta name="description" content="${esc(DEFAULT_DESC)}">` +
      `<meta property="og:title" content="${esc(fallback.title)}"><meta property="og:description" content="${esc(DEFAULT_DESC)}">` +
      `<meta property="og:url" content="${esc(canonical)}"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `</head><body><p>Loading Jaslow Digital… <a href="${esc(canonical)}">Tap here if it doesn't open.</a></p>` +
      `<script>setTimeout(function(){location.reload();},1200);</script></body></html>`,
    );
  }
});

// ---------------------------------------------------------------------------
// mpSitemap — /sitemap.xml: the storefront and every in-stock cart (SEO-friendly URLs)
// ---------------------------------------------------------------------------

export const mpSitemap = onRequest({region: REGION, maxInstances: 5}, async (req, res) => {
  const host = str(req.get('x-forwarded-host')) || str(req.hostname) || 'jaslowiot.com';
  const origin = `https://${host}`;
  try {
    const sf = (await loadStorefront('jaslow')) || DEFAULT_STOREFRONT;
    const carts = storefrontCarts(sf, await allPublicCarts());
    const url = (loc: string, img?: string) =>
      `<url><loc>${esc(loc)}</loc><changefreq>daily</changefreq>${img ? `<image:image><image:loc>${esc(img)}</image:loc></image:image>` : ''}</url>`;
    const urls = [url(`${origin}/s/jaslow`)]
      .concat(carts.map((c) => url(`${origin}/s/jaslow/${encodeURIComponent(c.id)}/${cartSeoSlug(c)}`, c.photos[0])));
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">` +
      `${urls.join('')}</urlset>`,
    );
  } catch (e) {
    logger.error('mpSitemap failed', e);
    res.set('Cache-Control', 'no-store');
    res.status(200).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/s/jaslow</loc></url></urlset>`);
  }
});
