# JASLOW IOT — New server setup

This repo ships with **no keys, no server settings and no store data**. Everything below has to be created
fresh for the Jaslow IoT deployment. Work through it top to bottom; each step says where the value goes.

Defaults used in this repo (change them if yours differ):

| Thing | Default |
|---|---|
| Website | `https://jaslowiot.com` |
| Firebase project id | `jaslow-iot` (`.firebaserc`) |
| Staff login domain | `@jaslowdigital.com` (`firestore.rules`, `storage.rules`, `functions/src/mpPresence.ts`, `mp-assistant/*/jaslow-auth.js`) |
| Android / iOS app id | `iot.jaslowdigital.com` |
| GitHub repo | `jaslowdigital/JASLOW-IOT` |

---

## 1. Firebase project

1. <https://console.firebase.google.com> → **Add project** → id `jaslow-iot` (if taken, pick another id and put it in
   `.firebaserc` and the `FIREBASE_PROJECT_ID` repo variable).
2. Upgrade to the **Blaze** plan (Cloud Functions and scheduled jobs need it).
3. **Authentication** → enable **Email/Password** (and Google if you use it). Add `jaslowiot.com` under
   Authentication → Settings → Authorized domains.
4. **Firestore Database** → create (production mode, region `us-central1` / `nam5`).
5. **Storage** → create the default bucket.
6. **Project settings → Your apps → Add app → Web**. Copy the SDK config values; they go into the
   `VITE_FIREBASE_*` settings below.
7. **Hosting** → add custom domain `jaslowiot.com` (and `www`) and add the DNS records it shows at your registrar.
8. Optional: a Cloud Storage bucket `jaslow-iot-backups` for nightly backups (or set `BACKUP_BUCKET`).

## 2. Local settings files

```sh
cp frontend/.env.example frontend/.env      # fill in the Firebase web config + company details
cp functions/.env.example functions/.env    # only needed for manual deploys
```

`frontend/.env` and `functions/.env` are git-ignored — never commit them.

## 3. GitHub repo settings (`jaslowdigital/JASLOW-IOT` → Settings → Secrets and variables → Actions)

**Variables** (public values):

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `jaslow-iot` |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` | from step 1.6 |
| `PUBLIC_ORIGIN` | `https://jaslowiot.com` |
| `COMPANY_PHONE` | main customer phone (optional) |
| `VITE_COMPANY_NAME`, `VITE_COMPANY_WEBSITE`, `VITE_SUPPORT_EMAIL` | optional, defaults: Jaslow IoT / jaslowiot.com / support@jaslowdigital.com |
| `DMS_API_BASE`, `PHOTO_BASE`, `WINDOW_STICKER_BASE`, `DEFAULT_IMAGE_BASE` | inventory feed + photo host (leave empty until you have one) |
| `PHOTO_WORKER_URL` | your photo worker URL (step 6) |
| `ENABLE_AI_WRITER`, `WH_REALTIME` | optional, `true` to turn on |

**Secrets**:

| Secret | What |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **Required.** Google Cloud console → IAM → Service accounts → create one with *Firebase Admin*, *Cloud Functions Admin*, *Service Account User*, *Cloud Scheduler Admin*, *Secret Manager Viewer* roles → Keys → JSON. Paste the whole JSON. |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` | A **new** Android signing key (step 5). |
| `GOOGLE_SERVICES_JSON` | Android push: Firebase → Add app → Android, package `iot.jaslowdigital.com` → download `google-services.json`, paste contents. |
| `GOOGLE_SERVICE_INFO_PLIST` | iOS push: Firebase → Add app → iOS, bundle id `iot.jaslowdigital.com` → `GoogleService-Info.plist` contents. |
| `GOOGLE_PLACES_KEY` | Optional: Google reviews (Places API key from your new Google Cloud project). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Optional: texting, from a new Twilio account. |

Server-only secrets kept in Firebase Secret Manager (not GitHub):

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY --project jaslow-iot   # only if ENABLE_AI_WRITER=true
```

## 4. First deploy

Push to `main` (or Actions → **Deploy to Firebase** → Run workflow, tick **build_android**). It builds the website,
the Android app and the Chrome extension, then deploys hosting, rules and functions.
Check `https://jaslowiot.com/build-info.json`.

Manual alternative:

```sh
npm i -g firebase-tools && firebase login
cd frontend && npm ci && npm run build && cd ..
rm -rf dist && cp -r frontend/dist dist
cd functions && npm ci && npm run build --if-present && cd ..
firebase deploy --project jaslow-iot
```

Then sign in once with your `@jaslowdigital.com` account and make yourself admin: Firestore →
`systemConfig/mpAssistant` → `adminEmails: ["you@jaslowdigital.com"]`.

## 5. New Android signing key

```sh
keytool -genkeypair -v -keystore jaslow-release.keystore -alias jaslow -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 jaslow-release.keystore    # → ANDROID_KEYSTORE_BASE64
```

Keep the keystore and password somewhere safe (password manager). Losing it means phones can't install updates.

## 6. Photo worker (Cloudflare) — only if you use inventory photos

1. Cloudflare → Workers → Create → paste `mp-assistant/photo-worker/worker.js` → deploy as `jaslow-photos`.
2. Settings → Variables → `PHOTO_BASE` = your photo bucket URL.
3. Put the worker URL in `PHOTO_WORKER_URL` (GitHub variable) / `VITE_PHOTO_WORKER_URL` (frontend/.env).

## 7. Chrome extension (Jaslow Poster)

Before packaging/loading, edit `mp-assistant/shared/jaslow-auth.js` **and** `mp-assistant/poster/jaslow-auth.js`:
`API_KEY` (your new Firebase web API key) and `PROJECT_ID`. If you use photos, also set `PHOTO_BASE`,
`WINDOW_STICKER_BASE` and `PHOTO_WORKER` at the top of both `cart-logic.js` files.

## 8. Your stores

Only one entry ships: `T0` "JASLOW IOT". Add stores as `T1`, `T2`, … in `DEALERSHIPS`
(`frontend/src/mp/constants.ts`, plus `LOCATION_ORDER` and `ACCOUNT_GROUPS`) and mirror them in
`functions/src/mpShare.ts`, `functions/src/mpPresence.ts` and `mp-assistant/*/cart-logic.js`.

## 9. Optional extras

- **Google Sheets / Analytics** in Webhook Flows: share sheets with `<project number>-compute@developer.gserviceaccount.com`
  (shown in the app once `VITE_FIREBASE_MESSAGING_SENDER_ID` is set).
- **Cloudflare Turnstile** on public pages: set `TURNSTILE_SECRET` in `functions/.env`.
- **Email** (alerts, reports): set up the sender account in the app under Webhook Flows → Integrations.

Day-to-day operations: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
