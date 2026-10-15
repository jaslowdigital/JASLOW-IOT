// Jaslow Poster (IoT) — bridge on the JASLOW IOT website.
// "Copy to Marketplace" on the Prepare-listing page posts the listing here (and Credit applications posts a customer for a lender form); it is stored for the Facebook tab,
// which fills the vehicle form and uploads the photos automatically (it still never clicks Post).
/* global chrome */
(function () {
  "use strict";
  const PENDING_KEY = "jaslowPosterPending";
  const version = chrome.runtime.getManifest().version;

  // Let the page know the extension is installed.
  document.documentElement.setAttribute("data-jaslow-poster", version);
  window.postMessage({ source: "jaslow-poster", type: "JASLOW_POSTER_READY", version }, window.location.origin);

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (!d || d.source !== "jaslow-iot") return;
    if (d.type === "JASLOW_POSTER_PING") {
      window.postMessage({ source: "jaslow-poster", type: "JASLOW_POSTER_READY", version }, window.location.origin);
      return;
    }
    // Credit applications → a lender card → "Apply & fill in": the customer for that lender's form (lender-autofill.js).
    if (d.type === "JASLOW_SEND_CREDIT" && d.payload && d.payload.fields) {
      const p = d.payload;
      const pending = { host: String(p.host || ""), lender: String(p.lender || ""), name: String(p.name || ""), fields: p.fields, ts: Date.now() };
      chrome.storage.local.set({ jaslowCreditPending: pending }, () => {
        window.postMessage({ source: "jaslow-poster", type: "JASLOW_CREDIT_RECEIVED", id: d.id }, window.location.origin);
      });
      return;
    }
    if (d.type !== "JASLOW_SEND_LISTING" || !d.payload || !d.payload.cart) return;
    const pending = { cart: d.payload.cart, listing: d.payload.listing || {}, ts: Date.now(), autoFill: true, from: "website" };
    chrome.storage.local.set({ [PENDING_KEY]: pending }, () => {
      window.postMessage({ source: "jaslow-poster", type: "JASLOW_LISTING_RECEIVED", id: d.id }, window.location.origin);
    });
  });
})();
