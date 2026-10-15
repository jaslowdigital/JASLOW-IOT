// General products (Products section): form model <-> mp_carts payload.
// Products are stored in mp_carts next to golf carts (source 'manual', `_mpKind: 'product'`), so they appear in
// inventory, on the public storefront and in the Marketplace posting flow. The payload keeps the DMS-like shape
// (cartType, cartLocation, retailPrice, imageUrls…) that the rest of the app reads.
import type { ProductCondition } from '../types';
import { parsePrice } from '../create/listingModel';
import { productInfo } from '../cartLogic';

type Json = Record<string, unknown>;

export interface SpecRow {
  label: string;
  value: string;
}

/** Everything the Add product form edits. */
export interface ProductForm {
  name: string;
  category: string;
  brand: string;
  sku: string;
  price: string;
  cost: string;
  quantity: string;
  condition: ProductCondition;
  color: string;
  locationId: string;
  description: string;
  specs: SpecRow[];
  /** Listed (in stock). Off = hidden from storefront and posting. */
  active: boolean;
}

export const EMPTY_PRODUCT: ProductForm = {
  name: '', category: '', brand: '', sku: '', price: '', cost: '', quantity: '', condition: 'new', color: '',
  locationId: '', description: '', specs: [], active: true,
};

/** Suggested categories (the field also accepts anything typed). */
export const PRODUCT_CATEGORIES = [
  'Accessories', 'Parts', 'Batteries', 'Chargers', 'Wheels & tires', 'Lights', 'Seats & covers', 'Audio',
  'Enclosures', 'Lift kits', 'Apparel', 'Tools', 'Electronics', 'Other',
];

/** Product photos: the storefront shows items with at least this many. */
export const STOREFRONT_MIN_PHOTOS = 2;
export const MAX_PRODUCT_PHOTOS = 20;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

function parseQuantity(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

/** Problems that block saving (empty list = OK). */
export function validateProduct(form: ProductForm): string[] {
  const out: string[] = [];
  if (!form.name.trim()) out.push('Add a product name.');
  if (!parsePrice(form.price)) out.push('Add a price.');
  if (form.quantity.trim() && parseQuantity(form.quantity) === null) out.push('Quantity must be a number.');
  if (form.cost.trim() && !parsePrice(form.cost)) out.push('Cost must be a number.');
  return out;
}

/** mp_carts payload for a product. `prev` (the stored payload when editing) is kept underneath. */
export function buildProductPayload(form: ProductForm, docId: string, photoUrls: string[], prev: Json = {}): Json {
  const quantity = parseQuantity(form.quantity);
  return {
    ...prev,
    _id: docId,
    _mpKind: 'product',
    cartType: { ...obj(prev.cartType), make: form.brand.trim(), model: form.name.trim(), year: '' },
    cartAttributes: { ...obj(prev.cartAttributes), cartColor: form.color.trim() },
    cartLocation: { ...obj(prev.cartLocation), locationId: form.locationId || 'Other' },
    retailPrice: parsePrice(form.price),
    isUsed: form.condition !== 'new',
    serialNo: form.sku.trim(),
    imageUrls: photoUrls,
    // Out of stock (quantity 0) or switched off → not listed.
    isInStock: form.active && quantity !== 0,
    _mpDescription: form.description.trim(),
    _mpCategory: 'other',
    _mpProduct: {
      name: form.name.trim(),
      category: form.category.trim(),
      brand: form.brand.trim(),
      sku: form.sku.trim(),
      quantity,
      cost: parsePrice(form.cost),
      condition: form.condition,
      listed: form.active,
      specs: form.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value),
    },
  };
}

/** mp_carts fields shared by create and update. */
export function productDocFields(form: ProductForm, docId: string, photoUrls: string[], prev: Json = {}) {
  const payload = buildProductPayload(form, docId, photoUrls, prev);
  return {
    payload: JSON.stringify(payload),
    savedAt: Date.now(),
    serial: form.sku.trim(),
    locationId: form.locationId || 'Other',
    isUsed: form.condition !== 'new',
    photoUrls,
    active: payload.isInStock === true,
    kind: 'product' as const,
  };
}

/** Form values from a stored product payload. */
export function formFromProductPayload(raw: Json): ProductForm {
  const p = productInfo(raw);
  const loc = String(obj(raw.cartLocation).locationId || '');
  return {
    name: p.name, category: p.category, brand: p.brand, sku: p.sku,
    price: Number(raw.retailPrice) > 0 ? String(raw.retailPrice) : '',
    cost: p.cost ? String(p.cost) : '',
    quantity: p.quantity === null ? '' : String(p.quantity),
    condition: p.condition,
    color: String(obj(raw.cartAttributes).cartColor || ''),
    locationId: loc === 'Other' ? '' : loc,
    description: p.description,
    specs: p.specs.length ? p.specs : [],
    active: obj(raw._mpProduct).listed !== false,
  };
}
