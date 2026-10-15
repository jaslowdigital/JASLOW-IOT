# Jaslow MP Assistant — inside JASLOW IOT

The Facebook Marketplace posting workflow, running as a
**parallel module** of JASLOW IOT: same Firebase project (`jaslow-iot`), same login, same dashboard, and its
own data (`mp_*` collections) that never touches the IoT device/notification data.

| Piece | Where | What it does |
|---|---|---|
| MP Assistant web app | `frontend/src/mp/` → routes `/mp/*` | Home queue, Find a Cart, Locations, Browse, Profiles, Accounts, cart detail (photos, 5 listings, Posted On tracker) |
| DMS sync (`mpSyncInventory` hourly, `mpSyncNow` on demand) | `functions/src/mpAssistant.ts` | Pulls active inventory from the **production** DMS API, keeps in-stock carts, removes sold ones, resolves default images for new carts |
| Jaslow Poster | `mp-assistant/poster/` | Chrome extension — picks a cart and autofills the Facebook vehicle form (never clicks Post) |
| Photo worker | `mp-assistant/photo-worker/worker.js` | Cloudflare Worker that proxies inventory photos as downloads (reads its `PHOTO_BASE` environment variable; its URL goes in `VITE_PHOTO_WORKER_URL`) |

## What changed from the standalone version

- **Login instead of "Who am I?"** — users sign in with their JASLOW IOT (`@jaslowdigital.com`) account. The
  first visit to MP Assistant asks for a display name and, optionally, which old identity you were, so your
  old "posted" history carries over. The identity list (`LEGACY_USERS` in `frontend/src/mp/constants.ts`) is
  empty by default, so this only appears if you configure it.
- **Roles are enforced by Firestore rules** — `admin` (mark posted, Posted On, Accounts page, imports) or
  `sales` (view + copy listings). New users start as `sales`; admins promote people on **Accounts → Team**.
- **No public read/write.** The old database allowed anyone to write; now only signed-in MP members can read
  and only admins can write.
- **No more scraping.** The old Grabber extension (Chrome debugger capture of the DMS web app) is replaced by a
  server-side sync from the DMS website API.
- **Posted state** is keyed by Firebase uid (`postedBy.{uid}`); legacy keys (from `LEGACY_USERS`, if any)
  still count for whoever claimed them.

## Configuration

Nothing deployment-specific is hard-coded; see [`SETUP.md`](../SETUP.md) at the repo root for the full new-server setup.

| Where | Values |
|---|---|
| `frontend/.env` (and GitHub Variables/Secrets of the same names) | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_PUBLIC_ORIGIN`, `VITE_COMPANY_NAME`, `VITE_COMPANY_PHONE`, `VITE_COMPANY_WEBSITE`, `VITE_SUPPORT_EMAIL`, `VITE_DMS_API_BASE`, `VITE_PHOTO_BASE`, `VITE_WINDOW_STICKER_BASE`, `VITE_DEFAULT_IMAGE_BASE`, `VITE_PHOTO_WORKER_URL`, `VITE_GCP_SERVICE_ACCOUNT`, `VITE_LEGACY_PROJECT_ID`, `VITE_LEGACY_API_KEY` |
| `functions/.env` (and GitHub Variables/Secrets) | `PUBLIC_ORIGIN`, `COMPANY_PHONE`, `DMS_API_BASE`, `PHOTO_BASE`, `DEFAULT_IMAGE_BASE`, `GCP_PROJECT_NUMBER` or `GCP_SERVICE_ACCOUNT`; optional `GOOGLE_PLACES_KEY`, `TWILIO_*` |
| Chrome extension | `jaslow-auth.js`: `API_KEY` (placeholder `YOUR_FIREBASE_WEB_API_KEY`), `PROJECT_ID`; `cart-logic.js`: `PHOTO_BASE`, `WINDOW_STICKER_BASE`, `PHOTO_WORKER` |
| Cloudflare photo worker | `PHOTO_BASE` environment variable |

## DMS API sync (production only)

- Base URL: `DMS_API_BASE` (e.g. `https://your-dms.example.com/api`; the test API is never used).
  **When it's empty, the sync is skipped.**
- `POST /get-carts` with `{pageNumber, pageSize: 100, isAllCarts: true}`, paging until an empty page.
- Carts with `isInStock: false` (or status `sold`) are sold: they're skipped, and any dashboard copy is removed.
  As a safety net, removals are skipped if DMS returns nothing or fewer than half the current inventory.
- Photos: `imageUrls` → `${PHOTO_BASE}<file>`.
- New carts with no photos get default web images from
  `${DEFAULT_IMAGE_BASE}<color>-<make>-<model>-in-<location>-<1..4>.jpg`,
  using the location set if it exists, otherwise `-in-national-`. The first image is the thumbnail.
- Window stickers: `${VITE_WINDOW_STICKER_BASE}<file>` (shown on the cart page when present).
- Cart name shown in the app: **Make + Model + Cart Color + Location** (e.g. "Evolution Turfman 200 Mineral White Springfield").
- Unchanged carts aren't rewritten (a payload hash is compared), so hourly syncs are cheap.
- Last run status is in `mp_meta/sync` and shown in the app header; admins can run **Accounts → Sync from DMS now**.

Store details (phone, address, map, Facebook, YouTube, website, Pinterest, review links) live in
`frontend/src/mp/constants.ts` (`DEALERSHIPS`) and appear on the Locations pages and each cart page. Only T0
"JASLOW IOT" (the main / company-wide entry) ships by default; add T1, T2, … there and mirror them in
`functions/src/mpShare.ts`, `functions/src/mpPresence.ts` and `mp-assistant/*/cart-logic.js`.

## Firestore collections

| Collection | Doc | Written by |
|---|---|---|
| `mp_carts/{dmsId}` | `payload` (raw DMS JSON string), `payloadHash`, `savedAt`, `dmsId`, `serial`, `locationId`, `isUsed`, `postedBy{uid: ts}`, `postedAccounts{acctId: {by, ts}}` | DMS sync (inventory), admins (posting) |
| `mp_meta/sync` | last sync result / error | DMS sync |
| `mp_accounts/{id}` | `name`, `group` (T-location), `owner`, `order` | admins (`SEED_ACCOUNTS` is empty by default, so nothing is pre-seeded) |
| `mp_users/{uid}` | `name`, `email`, `role`, `legacyId` | the user (create/name), admins (role) |
| `systemConfig/mpAssistant` | `adminEmails: string[]` | Firebase console only — bootstrap admins |

## Automatic deploys (GitHub Actions)

`.github/workflows/firebase-deploy.yml` builds and deploys the web app, Cloud Functions and Firestore rules
to `jaslow-iot` on every push/merge to `main` (or by hand: GitHub → **Actions → Deploy to Firebase → Run workflow**).

One-time setup:
1. Google Cloud console → **IAM & Admin → Service Accounts** (project `jaslow-iot`) → **Create service account**
   named `github-deploy`, with roles: **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**,
   **Cloud Scheduler Admin**, **Artifact Registry Administrator**, **Cloud Build Editor**.
2. Open that account → **Keys → Add key → Create new key → JSON** (a file downloads).
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   name `FIREBASE_SERVICE_ACCOUNT`, value = the whole contents of the JSON file. Then delete the file.

## First-time setup

1. **Deploy** rules, functions and hosting from the repo root:
   ```bash
   cd frontend && npm ci && npm run build && cd ..
   rm -rf dist && cp -r frontend/dist dist
   cd functions && npm ci && npm run build && cd ..
   firebase deploy --only firestore:rules,functions,hosting
   ```
2. **Bootstrap the first admin**: in the Firebase console → Firestore, create document
   `systemConfig/mpAssistant` with field `adminEmails` (array) containing the admin emails,
   e.g. `admin@jaslowdigital.com`. Those users get `admin` when they first open MP Assistant.
3. **Migrate old data (optional)**: only if you're moving from an older standalone MP Assistant project, set
   `VITE_LEGACY_PROJECT_ID` / `VITE_LEGACY_API_KEY` (otherwise the button is hidden), then as an admin open
   **MP Assistant → Accounts → Import from legacy MP Assistant**. It copies accounts and posting history and is
   safe to run again. Then click **Sync from DMS now** (needs `DMS_API_BASE`); carts that are no longer in stock
   are removed on that sync.
4. Everyone else opens **MP Assistant** from the sidebar once to create their profile (starts as `sales`).
5. Optional: install the Poster extension (see `poster/README.md`) and sign in with a JASLOW IOT account.

## Daily workflow (unchanged)

1. Nothing to import — inventory syncs from the DMS API every hour (or **Sync from DMS now**).
2. Phone → JASLOW IOT → **MP Assistant → Home** → pick a cart → copy a listing → post on Facebook.
3. In **Posted on**, tick the account(s) → **Done** (auto-marks the cart posted for you).

## Development

- Listing logic lives in `frontend/src/mp/cartLogic.ts`. After changing it, run
  `cd frontend && npm run build:mp-ext` to regenerate `cart-logic.js` for the Poster.
- `shared/jaslow-auth.js` is copied into `poster/` (MV3 can't load files outside the extension folder); keep the copies identical.
- The server keeps its own copy of the image location slugs (`IMAGE_LOCATION_SLUGS` in `functions/src/mpAssistant.ts`).
