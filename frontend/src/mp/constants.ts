// Shared configuration for the Jaslow MP Assistant module.

// Inventory (DMS) feed and photo hosting — set these in frontend/.env for each new deployment.
// Empty means "not connected": inventory sync and photo downloads stay off until configured.
// `|| {}` keeps this safe when bundled for the Chrome extension (npm run build:mp-ext), where import.meta.env is undefined.
const env = (import.meta.env || {}) as ImportMetaEnv;
export const DMS_API_BASE: string = env.VITE_DMS_API_BASE || '';
export const PHOTO_BASE: string = env.VITE_PHOTO_BASE || '';
export const WINDOW_STICKER_BASE: string = env.VITE_WINDOW_STICKER_BASE || '';
export const DEFAULT_IMAGE_BASE: string = env.VITE_DEFAULT_IMAGE_BASE || '';
export const PHOTO_WORKER: string = env.VITE_PHOTO_WORKER_URL || '';
export const PAGE_SIZE = 50;
export const FETCH_BATCH = 200;

// Optional one-time migration from an older standalone MP Assistant Firebase project.
// Leave empty (the default) to hide the import button.
export const LEGACY_PROJECT_ID: string = env.VITE_LEGACY_PROJECT_ID || '';
export const LEGACY_API_KEY: string = env.VITE_LEGACY_API_KEY || '';

export const COLLECTIONS = {
  carts: 'mp_carts',
  accounts: 'mp_accounts',
  users: 'mp_users',
  queue: 'mp_queue',
  events: 'mp_events',
  deviceDays: 'mp_device_days',
  alerts: 'mp_alerts',
  audit: 'mp_audit',
  templates: 'mp_templates',
  integrations: 'mp_integrations',
  integrationSecrets: 'mp_integration_secrets',
  links: 'mp_links',
  clicks: 'mp_clicks',
  storefronts: 'mp_storefronts',
  leads: 'mp_leads',
  customers: 'mp_customers',
  goals: 'mp_goals',
  assets: 'mp_assets',
  settings: 'mp_settings',
} as const;

/** Public site origin used in short links, storefronts, QR codes. */
export const PUBLIC_ORIGIN: string = env.VITE_PUBLIC_ORIGIN || 'https://jaslowiot.com';
export const shortLinkUrl = (code: string) => `${PUBLIC_ORIGIN}/l/${code}`;
export const storefrontUrl = (slug: string) => `${PUBLIC_ORIGIN}/s/${slug}`;

/** A phone counts as online if its last heartbeat is newer than this. */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;
/** Heartbeat interval while the app is open. */
export const HEARTBEAT_MS = 5 * 60 * 1000;

// Team levels, highest to lowest. 'sales' is the old base role (existing data) — shown as In-sales.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', 'in-sales': 'In-sales', 'out-sales': 'Out-sales', pr: 'PR', member: 'Member', sales: 'In-sales',
};
/** Roles an admin can assign, highest level first. */
export const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'in-sales', label: 'In-sales' },
  { value: 'out-sales', label: 'Out-sales' },
  { value: 'pr', label: 'PR' },
  { value: 'member', label: 'Member' },
];

export const MARKETPLACE_CREATE_URL = 'https://www.facebook.com/marketplace/create/vehicle';
/** Marketplace "Item for sale" form, used for general products. */
export const MARKETPLACE_ITEM_URL = 'https://www.facebook.com/marketplace/create/item';
/** The Marketplace form for this listing: the vehicle form for golf carts, the item form for products. */
export const marketplaceCreateUrl = (cart: { product?: unknown }) => (cart.product ? MARKETPLACE_ITEM_URL : MARKETPLACE_CREATE_URL);

export const LOCATION_ORDER = ['T0', 'Other'];

export interface Dealership {
  id: string;
  name: string;
  /** "City, ST" — used in listings. */
  cityState: string;
  phone: string;
  address: string;
  lat?: number;
  lng?: number;
  maps: string;
  facebook: string;
  youtube: string;
  website: string;
  pinterest: string;
  review: string;
}

// Store locations (source of truth for store info). T0 is the company-wide / main entry.
// Add your stores here as T1, T2, … (and add the same ids to LOCATION_ORDER and ACCOUNT_GROUPS),
// then mirror them in functions/src/mpShare.ts, functions/src/mpPresence.ts and mp-assistant/*/cart-logic.js.
export const DEALERSHIPS: Dealership[] = [
  { id: 'T0', name: 'JASLOW IOT', cityState: '', phone: '', address: '', maps: '', facebook: '', youtube: '', website: 'https://jaslowiot.com', pinterest: '', review: '' },
];

export const DEALERSHIP_BY_ID: Record<string, Dealership> = Object.fromEntries(DEALERSHIPS.map((d) => [d.id, d]));

export const ACCOUNT_GROUPS = ['T0', 'Other'];

// Legacy identities from the standalone app (postedBy keys). A signed-in user can
// claim one so their historical "posted" state carries over.
export const LEGACY_USERS: Array<{ id: string; name: string }> = [];

export const SEED_ACCOUNTS: Record<string, string[]> = {};

/** "City, ST" for stores, "JASLOW National" for T0, else the raw id. */
export function locationName(id: string): string {
  const d = DEALERSHIP_BY_ID[id];
  return d ? d.cityState || d.name : id || 'Other';
}

/** City only, for cart names ("Springfield"). */
export function locationCity(id: string): string {
  const d = DEALERSHIP_BY_ID[id];
  return d?.cityState ? d.cityState.split(',')[0] : '';
}

export function locationRank(id: string): number {
  const i = LOCATION_ORDER.indexOf(id);
  return i === -1 ? LOCATION_ORDER.length : i;
}
