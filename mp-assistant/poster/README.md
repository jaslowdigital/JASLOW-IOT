# Jaslow Poster (IoT)

Assistive Facebook Marketplace autofill. Pulls carts from the JASLOW IOT MP Assistant (`mp_carts`).
**It never clicks Post / Publish / Next — you review and post yourself.**

## Configure (before loading)
In `jaslow-auth.js` set `API_KEY` (replace the placeholder `YOUR_FIREBASE_WEB_API_KEY` with your
`VITE_FIREBASE_API_KEY`) and `PROJECT_ID`. In `cart-logic.js` set `PHOTO_BASE`, `WINDOW_STICKER_BASE` and
`PHOTO_WORKER` (same values as `VITE_PHOTO_BASE`, `VITE_WINDOW_STICKER_BASE`, `VITE_PHOTO_WORKER_URL`).
See `SETUP.md` at the repo root.

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the unzipped `jaslow-poster` folder (the one with `manifest.json` directly inside).
2. To update: the popup says **Update available** when jaslowiot.com has a newer version
   (`/downloads/poster-version.json`). Download the new zip, unzip it over the old folder, click the reload arrow
   on `chrome://extensions`, then refresh any open Facebook tab.

## Releasing a new version
Bump `version` in `manifest.json` with every change — the deploy publishes the zip and writes that version to
`poster-version.json`, which is what tells people to update. The published zip drops the `http://localhost`
match (local testing only). `https://*.amazonaws.com/*` stays: cart photo URLs can come from the DMS as full
S3 links, not only the configured `PHOTO_BASE` host.

## Use
1. Open the popup and sign in with your JASLOW IOT account (`@jaslowdigital.com`).
2. Search / pick a cart, choose one of the 5 listing variations, click **SEND TO FACEBOOK FORM**.
3. Open the Facebook vehicle form (button in the popup, or facebook.com/marketplace/create/vehicle).
   The **JASLOW MP Autofill** panel appears bottom-right → click **Fill Facebook form**.
4. Price, Description (and Title if present) fill reliably. Vehicle type/Year/Make/Model dropdowns are
   attempted; the panel says which ones to check or pick by hand. Add photos, review, click Post.

## Lender credit applications (2.3.0+)
JASLOW IOT → **Credit applications** → open an application → a lender card → **Apply & fill in**. The lender's form
opens in its own window and `lender-autofill.js` fills the customer's details (name, phone, email, address, housing,
job, income, down payment) by matching each field's label. It only fills empty fields, outlines them in green, skips
SSN / date of birth / co-applicant / reference sections and **never clicks Submit or Next**. Multi-step forms fill
as each step appears; **Alt+Shift+F** or **Fill again** in the JASLOW box fills again. The customer's details are
kept 30 minutes for that one lender only; **Done — forget customer** deletes them right away.
Lender sites: Sheffield, Heartland (blirentals.com), DLL, Roadrunner (octane.co), Univest (Jotform), Dealer Direct
(apptraker.com) — the list is `content_scripts` in `manifest.json` and `LENDER_LINKS` in
`frontend/src/mp/insights/credit/lenderLinks.ts`; add a lender in both places.

**Copy form structure** copies a JSON dump of the form fields for debugging when Facebook changes its layout.

`cart-logic.js` is generated from `frontend/src/mp/cartLogic.ts` — don't edit it here.
`jaslow-auth.js` is a copy of `../shared/jaslow-auth.js`.
