import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Firebase web config comes from frontend/.env (see frontend/.env.example and SETUP.md).
// Nothing is hard-coded: create a new Firebase project and paste its web-app config there.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase is not configured: copy frontend/.env.example to frontend/.env and fill it in.');
}
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = createDb();
export const storage = getStorage(app);
export const functions = getFunctions(app);

/**
 * Firestore with an offline cache (IndexedDB, shared by all open tabs): reads come from the cache when
 * offline and writes are queued and sent when the connection comes back. Falls back to a memory cache
 * where IndexedDB isn't available (some private-browsing modes).
 */
function createDb(): Firestore {
  if (typeof indexedDB !== 'undefined') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (e) {
      console.warn('Offline cache unavailable, using memory cache', e);
    }
  }
  return initializeFirestore(app, { localCache: memoryLocalCache() });
}

export default app;
