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
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { callFunction, db } from './firebase.js';

const eventsCollection = () => collection(db, 'events');
const gamesCollection = () => collection(db, 'games');
const gameMastersCollection = () => collection(db, 'gameMasters');
const eventSecretDoc = (eventId) => doc(db, 'eventSecrets', eventId);
const eventPlayersCollection = (eventId) => collection(db, 'events', eventId, 'players');
const eventPlayerDoc = (eventId, playerId) => doc(db, 'events', eventId, 'players', playerId);

function toDate(value) {
  if (value?.toDate) return value.toDate();
  if (value) return new Date(value);
  return null;
}

function normalizeDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    startAt: toDate(data.startAt),
    endAt: toDate(data.endAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function normalizePlayerDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    joinedAt: toDate(data.joinedAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function withEventTimestamps(payload) {
  return {
    ...payload,
    startAt: Timestamp.fromDate(payload.startAt),
    endAt: Timestamp.fromDate(payload.endAt),
  };
}

export function generateInvitePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

  const events = snapshot.docs
    .map(normalizeDoc)
    .filter((event) => event.startAt <= sixtyDays)
    .sort((a, b) => a.startAt - b.startAt);

  return Promise.all(events.map(async (event) => {
    if (event.inviteEnabled !== true) return { ...event, playerCount: 0 };
    const players = await fetchEventPlayers(event.id);
    return { ...event, playerCount: players.length };
  }));
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

export async function fetchGameMasterEvents(uid, now = new Date()) {
  const recentWindow = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const snapshot = await getDocs(
    query(
      eventsCollection(),
      where('createdBy', '==', uid),
      where('endAt', '>=', Timestamp.fromDate(recentWindow)),
      orderBy('endAt', 'asc'),
      limit(200),
    ),
  );
  return snapshot.docs
    .map(normalizeDoc)
    .sort((a, b) => a.startAt - b.startAt);
}

export async function fetchEvent(id) {
  const snapshot = await getDoc(doc(db, 'events', id));
  if (snapshot.exists() === false) return null;
  return normalizeDoc(snapshot);
}

export async function fetchEventSecret(id) {
  const snapshot = await getDoc(eventSecretDoc(id));
  if (snapshot.exists() === false) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function createEvent(payload, options = {}) {
  const eventRef = await addDoc(eventsCollection(), {
    ...withEventTimestamps(payload),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (options.invitePin) {
    await setDoc(eventSecretDoc(eventRef.id), {
      pin: options.invitePin,
      createdBy: payload.createdBy ?? payload.gameMasterUid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return eventRef;
}

export async function updateEvent(id, payload, options = {}) {
  await updateDoc(doc(db, 'events', id), {
    ...withEventTimestamps(payload),
    updatedAt: serverTimestamp(),
  });

  if (options.invitePin) {
    await setDoc(eventSecretDoc(id), {
      pin: options.invitePin,
      createdBy: payload.createdBy ?? payload.gameMasterUid ?? null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function deleteEventSecret(id) {
  return deleteDoc(eventSecretDoc(id));
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

export async function fetchEventPlayers(eventId) {
  const snapshot = await getDocs(query(eventPlayersCollection(eventId), orderBy('joinedAt', 'asc'), limit(200)));
  return snapshot.docs.map(normalizePlayerDoc);
}

export async function updateEventPlayer(eventId, playerId, payload) {
  return updateDoc(eventPlayerDoc(eventId, playerId), {
    name: payload.name,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEventPlayer(eventId, playerId) {
  return deleteDoc(eventPlayerDoc(eventId, playerId));
}

export async function joinEventWithPin(payload) {
  const joinEvent = callFunction('joinEvent');
  return joinEvent(payload);
}

export async function verifyRecaptchaToken(payload) {
  const verifyToken = callFunction("verifyRecaptchaToken");
  return verifyToken(payload);
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

export async function createGameMasterAccount(payload) {
  const createAccount = callFunction('createGameMasterAccount');
  return createAccount(payload);
}

export async function updateGameMasterAccount(payload) {
  const updateAccount = callFunction('updateGameMasterAccount');
  return updateAccount(payload);
}

export async function deleteGameMasterAccount(payload) {
  const deleteAccount = callFunction('deleteGameMasterAccount');
  return deleteAccount(payload);
}
