import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const requiredFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfig = {
  ...requiredFirebaseConfig,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseReady = Object.values(requiredFirebaseConfig).every(Boolean);

export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, 'asia-southeast1') : null;

let analyticsPromise = null;

export function getFirebaseAnalytics() {
  if (app == null || firebaseConfig.measurementId == null) return Promise.resolve(null);

  if (analyticsPromise == null) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(app) : null))
      .catch(() => null);
  }

  return analyticsPromise;
}

void getFirebaseAnalytics();

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export async function isAllowedAdmin(user) {
  if (!db || !user?.email) return false;
  try {
    const userSnapshot = await getDoc(doc(db, 'users', user.uid));
    if (userSnapshot.exists()) {
      const profile = userSnapshot.data();
      return profile.role === 'admin' && profile.active === true;
    }
  } catch {
    // Fall back to the legacy allowlist while rules/functions roll out.
  }
  try {
    const adminRef = doc(db, 'admins', user.email.toLowerCase());
    const snapshot = await getDoc(adminRef);
    return snapshot.exists();
  } catch {
    return false;
  }
}

export async function fetchGameMasterProfile(user) {
  if (db == null) return null;
  if (user?.uid == null) return null;
  try {
    const userSnapshot = await getDoc(doc(db, 'users', user.uid));
    if (userSnapshot.exists()) {
      const profile = userSnapshot.data();
      if (profile.role !== 'gm') return null;
      return {
        id: userSnapshot.id,
        ...profile,
      };
    }
  } catch {
    // Fall back to the compatibility profile until every deployment includes users/{uid}.
  }
  const gameMasterSnapshot = await getDoc(doc(db, 'gameMasters', user.uid));
  if (gameMasterSnapshot.exists() === false) return null;
  return {
    id: gameMasterSnapshot.id,
    ...gameMasterSnapshot.data(),
    role: 'gm',
  };
}

export const callFunction = (name) => httpsCallable(functions, name);
