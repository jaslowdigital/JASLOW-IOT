# JASLOW IOT — New server setup

This repo ships with **no keys, no server settings and no store data**. Almost all of the setup is done **automatically
by the deploy** (GitHub Actions → *Deploy to Firebase*) using **one** secret: a Google service-account key. You only
do the few steps below that need your own Google/GitHub login.

| Thing | Value |
|---|---|
| Website | `https://jaslowiot.com` |
| Firebase project | `jaslow-iot` (project number 496963711273) |
| Staff login domain | `@jaslowdigital.com` |
| First admin | `info@jaslowdigital.com` — change in [`config/admin-emails.txt`](config/admin-emails.txt) |
| Android / iOS app id | `iot.jaslowdigital.com` |
| GitHub repo | `jaslowdigital/JASLOW-IOT` |

---

## What you do (about 10 minutes)

### 1. Firebase console (<https://console.firebase.google.com/project/jaslow-iot>)

- **Upgrade to Blaze** (pay-as-you-go) — Cloud Functions need it.
- **Firestore Database** → *Create database* (production mode, `nam5` / `us-central1`).
- **Storage** → *Get started*.
- **Authentication** → *Get started* (the deploy then switches on Email/Password and adds your domain).

### 2. Create the deploy key (the only secret)

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts?project=jaslow-iot> → **Create service account**,
   name it `github-deploy` → **Create and continue**.
2. Give it these roles (one per "Add another role"):
   **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**, **Cloud Scheduler Admin**,
   **Secret Manager Admin**, **Service Usage Admin**, **Artifact Registry Administrator**, **Storage Admin** → **Done**.
3. Click the new account → **Keys** → **Add key** → **Create new key** → **JSON**. A `.json` file downloads.

### 3. Put it in GitHub

<https://github.com/jaslowdigital/JASLOW-IOT/settings/secrets/actions> → **New repository secret**

- Name: `FIREBASE_SERVICE_ACCOUNT`
- Secret: open the downloaded `.json` file in Notepad/TextEdit, copy **everything**, paste.

Then delete the downloaded file from your computer (GitHub keeps it encrypted).

### 4. Run the deploy

<https://github.com/jaslowdigital/JASLOW-IOT/actions/workflows/firebase-deploy.yml> → **Run workflow** → tick
**build_android** → **Run workflow**. It takes about 10–15 minutes. Every later push to `main` deploys by itself.

### 5. Your domain

Firebase console → **Hosting** → **Add custom domain** → `jaslowiot.com` (and `www.jaslowiot.com`) → add the DNS
records it shows at your domain registrar. Until DNS is live the app also works at `https://jaslow-iot.web.app`.

### 6. Sign in

Open the site → **Register** with `info@jaslowdigital.com` → click the link in the verification email → sign in.
You are the admin; approve or invite the rest of the team from the app.

---

## What the deploy does for you

Every run of *Deploy to Firebase* (step "Set up Firebase (automatic)", [`scripts/ci-firebase-setup.sh`](scripts/ci-firebase-setup.sh))
checks and, only where something is missing, creates:

- the Firebase **Web app** and **Android app** (`iot.jaslowdigital.com`) and reads their config — no API keys to copy;
- `frontend/.env` and `functions/.env` for the build;
- the Google Cloud **APIs** the system uses;
- **Authentication**: Email/Password sign-in on, `jaslowiot.com` + `localhost` in authorized domains;
- the **first admin** from `config/admin-emails.txt` (only while no admin list exists — later changes are made in the app);
- the **Android signing key** — created once and kept in Google Secret Manager (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`). It must never change; it stays there;
- the **backup bucket** `gs://jaslow-iot-backups`;
- the Chrome extension zip with your Firebase key and project baked in.

Then it builds and deploys the website, the Android app, Cloud Functions and the security rules.

If a step can't do its part, the run shows a yellow **warning** that says what is missing (usually a role in step 2).

---

## Optional settings

All optional; add them under GitHub → Settings → Secrets and variables → Actions, then run the deploy again.

**Variables** tab:

| Variable | What |
|---|---|
| `COMPANY_PHONE` | Main customer phone shown on public pages |
| `VITE_COMPANY_NAME`, `VITE_COMPANY_WEBSITE`, `VITE_SUPPORT_EMAIL` | Defaults: Jaslow IoT / jaslowiot.com / support@jaslowdigital.com |
| `PUBLIC_ORIGIN` | Only if the site isn't `https://jaslowiot.com` |
| `DMS_API_BASE`, `PHOTO_BASE`, `WINDOW_STICKER_BASE`, `DEFAULT_IMAGE_BASE` | An inventory (DMS) feed and its photo host |
| `PHOTO_WORKER_URL` | Photo download worker (below) |
| `ENABLE_AI_WRITER` | `true` for AI listing text (also run `firebase functions:secrets:set ANTHROPIC_API_KEY --project jaslow-iot`) |
| `WH_REALTIME` | `true` to process website form submissions instantly |

**Secrets** tab:

| Secret | What |
|---|---|
| `GOOGLE_PLACES_KEY` | Google reviews (Places API key) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Texting, from a Twilio account |
| `GOOGLE_SERVICE_INFO_PLIST` | iOS push alerts: Firebase → Add app → iOS, bundle id `iot.jaslowdigital.com` |

### Photo worker (Cloudflare) — only with an inventory feed

1. Cloudflare → Workers → Create → paste `mp-assistant/photo-worker/worker.js` → deploy as `jaslow-photos`.
2. Settings → Variables → `PHOTO_BASE` = your photo bucket URL.
3. Put the worker URL in the `PHOTO_WORKER_URL` variable.

### Your stores

Only one entry ships: `T0` "JASLOW IOT". Add stores as `T1`, `T2`, … in `DEALERSHIPS`
(`frontend/src/mp/constants.ts`, plus `LOCATION_ORDER` and `ACCOUNT_GROUPS`) and mirror them in
`functions/src/mpShare.ts`, `functions/src/mpPresence.ts`; then run `cd frontend && npm run build:mp-ext`.

---

## Working on your own computer (optional)

```sh
cp frontend/.env.example frontend/.env    # fill in from Firebase → Project settings → Your apps → Web app
cd frontend && npm ci && npm run dev      # http://localhost:5173
```

Loading the Chrome extension unpacked from the repo: set `API_KEY` / `PROJECT_ID` in
`mp-assistant/poster/jaslow-auth.js` first (the zip on the app's Download page already has them).

Day-to-day operations: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
