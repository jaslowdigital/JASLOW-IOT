// Talks to the "Jaslow Poster" Chrome extension (mp-assistant/poster) on computers: the extension fills the
// Facebook Marketplace vehicle form and uploads the photos. Its bridge script marks <html data-jaslow-poster>.
import { displayMake, displayModel, photoUrl } from './cartLogic';
import type { MpCart } from './types';
import { PUBLIC_ORIGIN } from './constants';

export const POSTER_ZIP_URL = `${PUBLIC_ORIGIN}/downloads/jaslow-poster.zip`;

/** Installed extension version, or '' when it isn't installed (or on phones). */
export const posterVersion = () => document.documentElement.getAttribute('data-jaslow-poster') || '';

/** Hands one listing to the extension; the Facebook tab then fills itself in. */
export function sendToPoster(cart: MpCart, photos: string[], listing: { title1?: string; description: string }) {
  window.postMessage({
    source: 'jaslow-iot',
    type: 'JASLOW_SEND_LISTING',
    id: `${cart.docId}-${Date.now()}`,
    payload: {
      cart: {
        docId: cart.docId, year: cart.year, make: displayMake(cart), model: displayModel(cart), price: cart.price,
        locationId: cart.locationId, vin: cart.vin, color: cart.color,
        photos: photos.map((p) => photoUrl(p)),
        // General products fill Facebook's "Item for sale" form instead of the vehicle form.
        product: cart.product ? {
          name: cart.product.name, category: cart.product.category, brand: cart.product.brand,
          condition: cart.product.condition,
        } : null,
      },
      listing: { title1: listing.title1 || '', description: listing.description },
    },
  }, window.location.origin);
}
