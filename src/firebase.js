import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Object.values(firebaseConfig).every(Boolean);

export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, 'asia-southeast1') : null;

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export async function isAllowedAdmin(user) {
  if (!db || !user?.email) return false;
  const adminRef = doc(db, 'admins', user.email.toLowerCase());
  const snapshot = await getDoc(adminRef);
  return snapshot.exists();
}

export async function fetchGameMasterProfile(user) {
  if (db == null) return null;
  if (user?.uid == null) return null;
  const snapshot = await getDoc(doc(db, 'gameMasters', user.uid));
  if (snapshot.exists() === false) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export const callFunction = (name) => httpsCallable(functions, name);
