// Company details shown on public pages (quotes, booking, credit applications …).
// Set them in frontend/.env for each deployment — see frontend/.env.example and SETUP.md.
const env = import.meta.env;

export const COMPANY_NAME: string = env.VITE_COMPANY_NAME || 'Jaslow IoT';
/** Main phone number shown to customers when a store has none. Empty hides it. */
export const COMPANY_PHONE: string = env.VITE_COMPANY_PHONE || '';
export const COMPANY_WEBSITE: string = env.VITE_COMPANY_WEBSITE || 'https://jaslowiot.com';
export const SUPPORT_EMAIL: string = env.VITE_SUPPORT_EMAIL || 'support@jaslowdigital.com';
/**
 * Google service account the Cloud Functions run as (Google Sheets / Analytics sharing).
 * Defaults to the project's Compute Engine default account: <project number>-compute@developer.gserviceaccount.com.
 */
export const GCP_SERVICE_ACCOUNT: string = env.VITE_GCP_SERVICE_ACCOUNT ||
  (env.VITE_FIREBASE_MESSAGING_SENDER_ID ? `${env.VITE_FIREBASE_MESSAGING_SENDER_ID}-compute@developer.gserviceaccount.com` : '');
