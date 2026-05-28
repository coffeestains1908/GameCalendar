import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase.js';

const eventsCollection = () => collection(db, 'events');
const gamesCollection = () => collection(db, 'games');
const gameMastersCollection = () => collection(db, 'gameMasters');

function normalizeDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    startAt: data.startAt?.toDate ? data.startAt.toDate() : new Date(data.startAt),
    endAt: data.endAt?.toDate ? data.endAt.toDate() : new Date(data.endAt),
  };
}

export async function fetchPublicEvents(now = new Date()) {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const snapshot = await getDocs(
    query(
      eventsCollection(),
      where('published', '==', true),
      where('endAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
      orderBy('endAt', 'asc'),
      limit(200),
    ),
  );

  return snapshot.docs
    .map(normalizeDoc)
    .filter((event) => event.startAt <= sixtyDays)
    .sort((a, b) => a.startAt - b.startAt);
}

export async function fetchAdminEvents(now = new Date()) {
  const recentWindow = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const snapshot = await getDocs(
    query(
      eventsCollection(),
      where('endAt', '>=', Timestamp.fromDate(recentWindow)),
      orderBy('endAt', 'asc'),
      limit(300),
    ),
  );
  return snapshot.docs
    .map(normalizeDoc)
    .sort((a, b) => a.startAt - b.startAt);
}

export async function fetchEvent(id) {
  const snapshot = await getDoc(doc(db, 'events', id));
  if (!snapshot.exists()) return null;
  return normalizeDoc(snapshot);
}

export async function createEvent(payload) {
  return addDoc(eventsCollection(), {
    ...payload,
    startAt: Timestamp.fromDate(payload.startAt),
    endAt: Timestamp.fromDate(payload.endAt),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEvent(id, payload) {
  return updateDoc(doc(db, 'events', id), {
    ...payload,
    startAt: Timestamp.fromDate(payload.startAt),
    endAt: Timestamp.fromDate(payload.endAt),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEventPublished(id, published) {
  return updateDoc(doc(db, 'events', id), {
    published,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvent(id) {
  return deleteDoc(doc(db, 'events', id));
}

export async function fetchGames() {
  const snapshot = await getDocs(query(gamesCollection(), orderBy('name', 'asc'), limit(200)));
  return snapshot.docs.map((snapshotDoc) => ({
    id: snapshotDoc.id,
    ...snapshotDoc.data(),
  }));
}

export async function createGame(payload) {
  return addDoc(gamesCollection(), {
    name: payload.name,
    color: payload.color,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGame(id) {
  return deleteDoc(doc(db, 'games', id));
}

export async function fetchGameMasters() {
  const snapshot = await getDocs(query(gameMastersCollection(), orderBy('name', 'asc'), limit(200)));
  return snapshot.docs.map((snapshotDoc) => ({
    id: snapshotDoc.id,
    ...snapshotDoc.data(),
  }));
}

export async function createGameMaster(payload) {
  return addDoc(gameMastersCollection(), {
    name: payload.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
