#!/usr/bin/env bash
# Automatic Firebase setup for GitHub Actions. Everything here only needs ONE repository secret:
# FIREBASE_SERVICE_ACCOUNT (a service-account JSON key, see SETUP.md). Each step is skipped when its value is already
# provided by a repo Variable/Secret, and every change is "create if missing", so running it on every deploy is safe.
#
# Usage: scripts/ci-firebase-setup.sh config   → only reads: writes frontend/.env + functions/.env (PR checks, app builds)
#        scripts/ci-firebase-setup.sh full     → also sets the project up (deploys):
#          - creates the Firebase Web app / Android app when missing and reads their config
#          - turns on the Google Cloud APIs the system uses
#          - Authentication: Email/Password sign-in on, website domain added to authorized domains
#          - first admin(s) from config/admin-emails.txt (only when no admin list exists yet)
#          - Android signing key: generated once and kept in Google Secret Manager (when no GitHub secrets for it)
#          - backup bucket <project>-backups
#
# Inputs (env): FIREBASE_PROJECT_ID, FIREBASE_TOOLS, FIREBASE_SA (secret JSON, optional in "config" mode),
#   CFG_<NAME> repo Variables (see the workflow), ANDROID_KEYSTORE_BASE64 / GOOGLE_SERVICES_JSON (optional secrets).
# Outputs: frontend/.env, functions/.env, $RUNNER_TEMP/jaslow-android.env (Android key + google-services.json).
set -uo pipefail
MODE="${1:-config}"
cd "$(dirname "$0")/.."
P="${FIREBASE_PROJECT_ID:-jaslow-iot}"
TMP="${RUNNER_TEMP:-$(mktemp -d)}"
FT=(npx --yes "${FIREBASE_TOOLS:-firebase-tools}")
note() { echo "::notice::$*"; }
warn() { echo "::warning::$*"; }
# Reads a JSON value from stdin: jget 'expr on the parsed object `j`' (prints '' on any error).
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const i=s.indexOf("{"),a=s.indexOf("[");const k=(i<0?a:a<0?i:Math.min(i,a));const j=JSON.parse(s.slice(k));const v=('"$1"');process.stdout.write(v==null?"":typeof v==="string"?v:JSON.stringify(v))}catch(e){}})'; }

HAVE_SA=false
if [ -n "${FIREBASE_SA:-}" ]; then
  printf '%s' "$FIREBASE_SA" > "$TMP/sa.json"
  export GOOGLE_APPLICATION_CREDENTIALS="$TMP/sa.json"
  HAVE_SA=true
fi

# --- Firebase Web app config ----------------------------------------------------------------------------------------
API_KEY="${CFG_FIREBASE_API_KEY:-}"; AUTH_DOMAIN="${CFG_FIREBASE_AUTH_DOMAIN:-}"; BUCKET="${CFG_FIREBASE_STORAGE_BUCKET:-}"
SENDER="${CFG_FIREBASE_MESSAGING_SENDER_ID:-}"; APP_ID="${CFG_FIREBASE_APP_ID:-}"; MEASURE="${CFG_FIREBASE_MEASUREMENT_ID:-}"
if [ -z "$API_KEY" ] && $HAVE_SA; then
  web_id="$("${FT[@]}" apps:list WEB --project "$P" --json 2>/dev/null | jget '(j.result||[]).find(a=>a.platform==="WEB")?.appId')"
  if [ -z "$web_id" ] && [ "$MODE" = full ]; then
    note "Creating the Firebase Web app \"Jaslow IoT\"."
    "${FT[@]}" apps:create WEB "Jaslow IoT" --project "$P" --json >/dev/null 2>&1 || warn "Could not create the Web app."
    web_id="$("${FT[@]}" apps:list WEB --project "$P" --json 2>/dev/null | jget '(j.result||[]).find(a=>a.platform==="WEB")?.appId')"
  fi
  if [ -n "$web_id" ]; then
    cfg="$("${FT[@]}" apps:sdkconfig WEB "$web_id" --project "$P" --json 2>/dev/null)"
    API_KEY="$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.apiKey')"
    AUTH_DOMAIN="$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.authDomain')"
    BUCKET="$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.storageBucket')"
    SENDER="$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.messagingSenderId')"
    APP_ID="$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.appId')"
    MEASURE="${MEASURE:-$(printf '%s' "$cfg" | jget 'j.result.sdkConfig.measurementId')}"
    [ -n "$API_KEY" ] && note "Firebase web config read from project $P (app $web_id)." || warn "Could not read the Web app config."
  else
    warn "No Firebase Web app found in $P."
  fi
fi
[ -n "$API_KEY" ] || warn "Firebase web config is missing: the website will not connect. Add the FIREBASE_SERVICE_ACCOUNT secret (SETUP.md)."
AUTH_DOMAIN="${AUTH_DOMAIN:-$P.firebaseapp.com}"; BUCKET="${BUCKET:-$P.firebasestorage.app}"
ORIGIN="${CFG_PUBLIC_ORIGIN:-https://jaslowiot.com}"

cat > frontend/.env <<EOF
VITE_FIREBASE_API_KEY=$API_KEY
VITE_FIREBASE_AUTH_DOMAIN=$AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=$P
VITE_FIREBASE_STORAGE_BUCKET=$BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=$SENDER
VITE_FIREBASE_APP_ID=$APP_ID
VITE_FIREBASE_MEASUREMENT_ID=$MEASURE
VITE_PUBLIC_ORIGIN=$ORIGIN
VITE_COMPANY_NAME=${CFG_COMPANY_NAME:-}
VITE_COMPANY_PHONE=${CFG_COMPANY_PHONE:-}
VITE_COMPANY_WEBSITE=${CFG_COMPANY_WEBSITE:-}
VITE_SUPPORT_EMAIL=${CFG_SUPPORT_EMAIL:-}
VITE_DMS_API_BASE=${CFG_DMS_API_BASE:-}
VITE_PHOTO_BASE=${CFG_PHOTO_BASE:-}
VITE_WINDOW_STICKER_BASE=${CFG_WINDOW_STICKER_BASE:-}
VITE_DEFAULT_IMAGE_BASE=${CFG_DEFAULT_IMAGE_BASE:-}
VITE_PHOTO_WORKER_URL=${CFG_PHOTO_WORKER_URL:-}
EOF
cat > functions/.env <<EOF
PUBLIC_ORIGIN=$ORIGIN
COMPANY_PHONE=${CFG_COMPANY_PHONE:-}
GCP_PROJECT_NUMBER=$SENDER
DMS_API_BASE=${CFG_DMS_API_BASE:-}
PHOTO_BASE=${CFG_PHOTO_BASE:-}
DEFAULT_IMAGE_BASE=${CFG_DEFAULT_IMAGE_BASE:-}
EOF

# --- Android: google-services.json (push alerts) ------------------------------------------------------------------
ANDROID_ENV="$TMP/jaslow-android.env"
: > "$ANDROID_ENV"
PKG="iot.jaslowdigital.com"
if [ -z "${GOOGLE_SERVICES_JSON:-}" ] && $HAVE_SA; then
  and_id="$("${FT[@]}" apps:list ANDROID --project "$P" --json 2>/dev/null | jget "(j.result||[]).find(a=>a.packageName===\"$PKG\")?.appId")"
  if [ -z "$and_id" ] && [ "$MODE" = full ]; then
    note "Creating the Firebase Android app ($PKG)."
    "${FT[@]}" apps:create ANDROID "Jaslow IoT" --package-name "$PKG" --project "$P" --json >/dev/null 2>&1 || warn "Could not create the Android app."
    and_id="$("${FT[@]}" apps:list ANDROID --project "$P" --json 2>/dev/null | jget "(j.result||[]).find(a=>a.packageName===\"$PKG\")?.appId")"
  fi
  if [ -n "$and_id" ]; then
    gs="$("${FT[@]}" apps:sdkconfig ANDROID "$and_id" --project "$P" --json 2>/dev/null | jget 'j.result.fileContents')"
    if [ -n "$gs" ]; then printf 'export GOOGLE_SERVICES_JSON=%q\n' "$gs" >> "$ANDROID_ENV"; fi
  fi
fi

# --- Android signing key (kept in Secret Manager when there are no GitHub secrets for it) ---------------------------
# android_key create|read
android_key() {
  [ -z "${ANDROID_KEYSTORE_BASE64:-}" ] || return 0
  gcloud auth activate-service-account --key-file="$TMP/sa.json" --quiet >/dev/null 2>&1 || return 0
  local ks pw
  ks="$(gcloud secrets versions access latest --secret=ANDROID_KEYSTORE_BASE64 --project "$P" 2>/dev/null || true)"
  pw="$(gcloud secrets versions access latest --secret=ANDROID_KEYSTORE_PASSWORD --project "$P" 2>/dev/null || true)"
  if [ -z "$ks" ] && [ "$1" = create ] && command -v keytool >/dev/null 2>&1; then
    note "Creating the Android signing key (stored in Google Secret Manager: ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD)."
    pw="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 28)"
    keytool -genkeypair -keystore "$TMP/release.keystore" -alias jaslow -keyalg RSA -keysize 2048 -validity 10000 \
      -storepass "$pw" -keypass "$pw" -dname "CN=Jaslow IoT, O=Jaslow Digital, C=US" >/dev/null 2>&1
    ks="$(base64 -w0 "$TMP/release.keystore")"; rm -f "$TMP/release.keystore"
    if gcloud secrets create ANDROID_KEYSTORE_BASE64 --project "$P" --replication-policy=automatic --quiet >/dev/null 2>&1 \
       && printf '%s' "$ks" | gcloud secrets versions add ANDROID_KEYSTORE_BASE64 --project "$P" --data-file=- --quiet >/dev/null 2>&1 \
       && gcloud secrets create ANDROID_KEYSTORE_PASSWORD --project "$P" --replication-policy=automatic --quiet >/dev/null 2>&1 \
       && printf '%s' "$pw" | gcloud secrets versions add ANDROID_KEYSTORE_PASSWORD --project "$P" --data-file=- --quiet >/dev/null 2>&1; then
      note "Android signing key saved in Secret Manager. It must never change - it is kept there for good."
    else
      warn "Could not save the Android key in Secret Manager (role 'Secret Manager Admin' needed) - the Android app is skipped."
      ks=""; pw=""
    fi
  fi
  if [ -n "$ks" ] && [ -n "$pw" ]; then
    echo "::add-mask::$pw"
    { printf 'export ANDROID_KEYSTORE_BASE64=%q\n' "$ks"; printf 'export ANDROID_KEYSTORE_PASSWORD=%q\n' "$pw"; echo 'export ANDROID_KEY_ALIAS=jaslow'; } >> "$ANDROID_ENV"
  fi
}

if [ "$MODE" != full ]; then
  if $HAVE_SA; then android_key read; fi
  echo "Config written (mode: config)."
  exit 0
fi
if ! $HAVE_SA; then
  echo "::error::Add the FIREBASE_SERVICE_ACCOUNT repository secret (SETUP.md step 2) - it is the only one needed."
  exit 1
fi

# --- Google Cloud access (gcloud is preinstalled on GitHub's Ubuntu runners) ----------------------------------------
gcloud auth activate-service-account --key-file="$TMP/sa.json" --quiet >/dev/null 2>&1 || warn "gcloud could not use the service account."
TOKEN="$(gcloud auth print-access-token 2>/dev/null || true)"
api() { curl -sS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" -H "Content-Type: application/json" "$@"; }

# --- APIs -----------------------------------------------------------------------------------------------------------
gcloud services enable --project "$P" --quiet \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com \
  firestore.googleapis.com firebasestorage.googleapis.com identitytoolkit.googleapis.com \
  analyticsadmin.googleapis.com sheets.googleapis.com >/dev/null 2>&1 \
  && note "Google Cloud APIs are on." \
  || warn "Could not turn on all APIs (give the service account the 'Service Usage Admin' role, or turn them on in Google Cloud)."

# --- Backup bucket (nightly Firestore exports, see functions/src/mpTeam.ts) -------------------------------------------
if ! gcloud storage buckets describe "gs://$P-backups" --project "$P" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$P-backups" --project "$P" --location=US --uniform-bucket-level-access --quiet >/dev/null 2>&1 \
    && note "Backup bucket gs://$P-backups created." || warn "Could not create the backup bucket gs://$P-backups (nightly backups will fail until it exists)."
fi

# --- Authentication: Email/Password + authorized domains ------------------------------------------------------------
if [ -n "$TOKEN" ]; then
  conf="$(api "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config")"
  host="$(printf '%s' "$ORIGIN" | sed -E 's#^https?://##; s#/.*$##')"
  body="$(printf '%s' "$conf" | HOST="$host" node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let c={};try{c=JSON.parse(s)}catch(e){}
      const doms=new Set(c.authorizedDomains||[]);
      for (const d of [process.env.HOST, "www."+process.env.HOST, "localhost"]) if (d && !/^www\.www\./.test(d)) doms.add(d);
      process.stdout.write(JSON.stringify({signIn:{email:{enabled:true,passwordRequired:true}},authorizedDomains:[...doms]}));
    })')"
  res="$(api -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains" -d "$body")"
  if printf '%s' "$res" | grep -q '"error"'; then
    warn "Authentication settings not changed ($(printf '%s' "$res" | jget 'j.error.message')). In Firebase: Authentication → Get started → Email/Password."
  else
    note "Authentication: Email/Password on; authorized domains include $host."
  fi
fi

# --- First admin(s) --------------------------------------------------------------------------------------------------
ADMINS="$(grep -vE '^\s*(#|$)' config/admin-emails.txt 2>/dev/null | tr -d ' \r' | paste -sd, -)"
if [ -n "$ADMINS" ] && [ -n "$TOKEN" ]; then
  doc="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents/systemConfig/mpAssistant"
  body="$(ADMINS="$ADMINS" node -e 'process.stdout.write(JSON.stringify({fields:{adminEmails:{arrayValue:{values:process.env.ADMINS.split(",").map(v=>({stringValue:v.toLowerCase()}))}}}}))')"
  # currentDocument.exists=false: only when no admin list exists yet (never overwrites changes made in the app).
  res="$(api -X PATCH "$doc?currentDocument.exists=false&updateMask.fieldPaths=adminEmails" -d "$body")"
  if printf '%s' "$res" | grep -q '"name"'; then note "Admins set: $ADMINS"
  elif printf '%s' "$res" | grep -qi 'already exists\|ALREADY_EXISTS\|FAILED_PRECONDITION'; then echo "Admin list already exists - left as is."
  else warn "Could not set the first admins ($(printf '%s' "$res" | jget 'j.error.message'))."; fi
fi

android_key create
echo "Firebase setup done."
