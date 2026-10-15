/**
 * The one app menu. Every signed-in page is listed here once, with ONE label (one i18n key).
 * The left drawer (DashboardLayout), the phone bottom bar's "More" and global search all read it.
 * Each feature area registers its page components in its own routes.tsx.
 * `min` = minimum level to see the item: 'member' (everyone on the team), 'manager', 'admin'.
 * `label` is the English text and the fallback when a translation is missing.
 */
export type MinRole = 'member' | 'manager' | 'admin';

export interface NavItem {
  label: string;
  path: string;
  min: MinRole;
  /** i18n key (one per path). */
  key: string;
  /** Extra words people may search for (English). */
  keywords?: string;
  /** Not shown in the menu (reached from another page), but searchable and highlighted. */
  hidden?: boolean;
}

export interface NavGroup {
  label: string;
  key: string;
  items: NavItem[];
}

export const MP_NAV: NavGroup[] = [
  {
    label: 'Today', key: 'nav.groupToday', items: [
      { label: 'Today', path: '/mp/today', min: 'member', key: 'nav.today', keywords: 'home start call list to do follow up' },
    ],
  },
  {
    label: 'Inventory', key: 'nav.inventory', items: [
      { label: 'Find a cart', path: '/mp/find', min: 'member', key: 'nav.find', keywords: 'search stock inventory' },
      { label: 'Browse', path: '/mp/browse', min: 'member', key: 'nav.browse', keywords: 'carts inventory' },
      { label: 'Locations', path: '/mp/locations', min: 'member', key: 'nav.locations', keywords: 'stores lots' },
      { label: 'Aged inventory', path: '/mp/aged', min: 'member', key: 'nav.aged', keywords: 'old days on lot price drop' },
      { label: 'New listing', path: '/mp/new', min: 'member', key: 'nav.new', keywords: 'add cart photo create' },
    ],
  },
  {
    label: 'Leads & customers', key: 'nav.leadsCustomers', items: [
      { label: 'Leads', path: '/mp/leads', min: 'member', key: 'nav.leads', keywords: 'crm prospects buyers inbox' },
      { label: 'Customers', path: '/mp/customers', min: 'member', key: 'nav.customerList', keywords: 'buyers contacts broadcast' },
      { label: 'Texts inbox', path: '/mp/inbox', min: 'member', key: 'nav.inbox', keywords: 'sms messages reply conversation chat' },
      { label: 'Texts', path: '/mp/texts', min: 'member', key: 'nav.texts', keywords: 'sms messages log sent failed opt out' },
      { label: 'Customer history', path: '/mp/customer', min: 'member', key: 'nav.customerHistory', keywords: 'timeline phone number lookup' },
      { label: 'Appointments', path: '/mp/appointments', min: 'member', key: 'nav.appointments', keywords: 'test drive booking' },
      { label: 'Quotes', path: '/mp/quotes', min: 'member', key: 'nav.quotes', keywords: 'price offer' },
      { label: 'Pre-qualification', path: '/mp/prequal', min: 'member', key: 'nav.prequal', keywords: 'credit finance' },
      { label: 'Credit applications', path: '/mp/credit-app', min: 'member', key: 'nav.creditApps', keywords: 'credit finance application lender' },
      { label: 'Financing calculator', path: '/financing-calculator', min: 'member', key: 'nav.financingCalculator', keywords: 'payment monthly loan delivery quote calculator' },
      { label: 'Referrals', path: '/mp/referrals', min: 'member', key: 'nav.referrals', keywords: 'refer friend' },
    ],
  },
  {
    label: 'Post & share', key: 'nav.post', items: [
      { label: 'Suggested to post', path: '/mp', min: 'member', key: 'nav.suggested', keywords: 'mp assistant marketplace facebook home repost' },
      { label: 'Posted', path: '/mp/posted', min: 'member', key: 'nav.posted', keywords: 'posted carts accounts who posted facebook marketplace listed' },
      { label: 'Queue', path: '/mp/queue', min: 'member', key: 'nav.queue', keywords: 'posting facebook marketplace' },
      { label: 'Calendar', path: '/mp/calendar', min: 'member', key: 'nav.calendar', keywords: 'schedule' },
      { label: 'Storefront', path: '/mp/storefront', min: 'member', key: 'nav.storefront', keywords: 'website shop page' },
      { label: 'Links & A/B', path: '/mp/links', min: 'member', key: 'nav.links', keywords: 'clicks short link' },
      { label: 'Templates', path: '/mp/templates', min: 'member', key: 'nav.templates', keywords: 'listing text wording' },
      { label: 'Brand assets', path: '/mp/assets', min: 'member', key: 'nav.assets', keywords: 'logos photos' },
    ],
  },
  {
    label: 'Tools', key: 'nav.tools', items: [
      { label: 'Help center', path: '/mp/help', min: 'member', key: 'nav.help', keywords: 'how to guide faq' },
      { label: 'Setup guide', path: '/mp/welcome', min: 'member', key: 'nav.welcome', keywords: 'onboarding start', hidden: true },
      { label: 'Download app', path: '/download', min: 'member', key: 'nav.download', keywords: 'android install phone app' },
      { label: 'Request a change', path: '/requests', min: 'member', key: 'nav.requestChange', keywords: 'bug idea feature feedback' },
    ],
  },
  {
    label: 'Reports', key: 'nav.reports', items: [
      { label: 'Analytics', path: '/mp/analytics', min: 'member', key: 'nav.analytics', keywords: 'posts stats charts' },
      { label: 'Insights', path: '/mp/insights', min: 'member', key: 'nav.insights', keywords: 'best time price guidance relist digest' },
      { label: 'Goals & badges', path: '/mp/team', min: 'member', key: 'nav.goals', keywords: 'leaderboard team' },
      { label: 'Live board', path: '/mp/live', min: 'manager', key: 'nav.liveBoard', keywords: 'tv office waiting leads today' },
      { label: 'Sales funnel', path: '/mp/funnel', min: 'manager', key: 'nav.funnel', keywords: 'conversion' },
      { label: 'Google reviews', path: '/mp/reviews', min: 'manager', key: 'nav.reviews', keywords: 'stars rating' },
      { label: 'Phone alerts dashboard', path: '/dashboard', min: 'member', key: 'nav.dashboard', keywords: 'notifications facebook messages iot handled' },
    ],
  },
  {
    label: 'Website forms', key: 'nav.websiteForms', items: [
      { label: 'Overview', path: '/wh', min: 'manager', key: 'nav.whOverview', keywords: 'website forms webhook flows' },
      { label: 'Websites', path: '/wh/websites', min: 'manager', key: 'nav.whWebsites', keywords: 'domains sites' },
      { label: 'Add website', path: '/wh/new', min: 'manager', key: 'nav.whAddWebsite', keywords: 'new site', hidden: true },
      { label: 'Forms (webhooks)', path: '/wh/webhooks', min: 'manager', key: 'nav.whForms', keywords: 'webhook form' },
      { label: 'Automations (flows)', path: '/wh/flows', min: 'manager', key: 'nav.whFlows', keywords: 'flow email sheets dms' },
      { label: 'Form inbox', path: '/wh/submissions', min: 'manager', key: 'nav.whInbox', keywords: 'submissions website leads spam' },
      { label: 'Email templates', path: '/wh/templates', min: 'manager', key: 'nav.whTemplates', keywords: 'email' },
      { label: 'Problems', path: '/wh/triage', min: 'manager', key: 'nav.whProblems', keywords: 'triage errors failed' },
      { label: 'Settings', path: '/wh/settings', min: 'admin', key: 'nav.whSettings', keywords: 'website forms settings' },
    ],
  },
  {
    label: 'Team & admin', key: 'nav.teamAdmin', items: [
      { label: 'Users', path: '/users', min: 'manager', key: 'nav.users', keywords: 'people team profiles roles online hours' },
      { label: 'Phones', path: '/devices', min: 'member', key: 'nav.phones', keywords: 'devices pair phone' },
      { label: 'Accounts', path: '/mp/accounts', min: 'admin', key: 'nav.accounts', keywords: 'facebook profiles roles' },
      { label: 'Trade-ins', path: '/mp/trade-ins', min: 'admin', key: 'nav.tradeIns', keywords: 'trade in value appraisal' },
      { label: 'Import', path: '/mp/import', min: 'manager', key: 'nav.import', keywords: 'csv upload connectors' },
      { label: 'System health', path: '/mp/status', min: 'manager', key: 'nav.systemHealth', keywords: 'status triage problems backup sync' },
      { label: 'Exports', path: '/mp/exports', min: 'manager', key: 'nav.exports', keywords: 'download report csv' },
      { label: 'Settings', path: '/settings', min: 'member', key: 'nav.settings', keywords: 'account password language dark mode alerts' },
      { label: 'MP Assistant settings', path: '/mp/settings', min: 'admin', key: 'nav.mpSettings', keywords: 'approval relist', hidden: true },
      { label: 'Sell more settings', path: '/mp/sales-settings', min: 'admin', key: 'nav.salesSettings', keywords: 'texting routing reviews', hidden: true },
    ],
  },
];

/** Phone bottom bar (the 5th button, More, opens the full menu). */
export const BOTTOM_NAV: Array<{ path: string; key: string; label: string }> = [
  { path: '/mp/today', key: 'nav.today', label: 'Today' },
  { path: '/mp/leads', key: 'nav.leads', label: 'Leads' },
  { path: '/mp/find', key: 'nav.find', label: 'Find a cart' },
  { path: '/mp/queue', key: 'nav.queue', label: 'Queue' },
];

/** Where people land after signing in. */
export const HOME_PATH = '/mp/today';

// Team levels, low to high. 'sales' is the legacy base role (= in-sales). 'member' is the new lowest level
// and also the base menu threshold (everyone approved sees those items).
const RANK: Record<string, number> = { member: 0, pr: 1, 'out-sales': 2, 'in-sales': 3, sales: 3, manager: 4, admin: 5 };
export const canSee = (role: string | undefined, min: MinRole) => (RANK[role || 'member'] ?? 0) >= (RANK[min] ?? 0);
