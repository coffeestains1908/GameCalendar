import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
setGlobalOptions({ region: "asia-southeast1" });

const db = getFirestore();
const auth = getAuth();
const recaptchaSecret = defineSecret("RECAPTCHA_SECRET_KEY");
const callableOptions = { cors: true };
const userRoles = new Set(["admin", "gm"]);

function assertString(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return trimmed;
}

function assertRole(value) {
  const role = assertString(value, "Role", 20).toLowerCase();
  if (!userRoles.has(role)) {
    throw new HttpsError("invalid-argument", "Role is invalid.");
  }
  return role;
}

function toActive(value) {
  return value !== false;
}

function userProfile(uid, payload, adminUid, existing = {}) {
  return {
    uid,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    active: payload.active,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: existing.createdBy || adminUid,
    updatedBy: adminUid,
  };
}

function gameMasterProfile(uid, payload, adminUid, existing = {}) {
  return {
    uid,
    name: payload.name,
    email: payload.email,
    active: payload.active,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: existing.createdBy || adminUid,
  };
}

function adminProfile(uid, payload, adminUid, existing = {}) {
  return {
    uid,
    name: payload.name,
    email: payload.email,
    role: "admin",
    active: payload.active,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: existing.createdBy || adminUid,
  };
}

async function requireAdmin(request) {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email;
  if (!uid || !email) throw new HttpsError("unauthenticated", "Sign in is required.");

  const userSnapshot = await db.doc(`users/${uid}`).get();
  if (userSnapshot.exists) {
    const profile = userSnapshot.data();
    if (profile.role === "admin" && profile.active === true) return request.auth;
    throw new HttpsError("permission-denied", "Admin access is required.");
  }

  const adminSnapshot = await db.doc(`admins/${email.toLowerCase()}`).get();
  if (!adminSnapshot.exists) throw new HttpsError("permission-denied", "Admin access is required.");
  return request.auth;
}

async function syncRoleDocs(uid, payload, adminUid, previousEmail = "") {
  const batch = db.batch();
  const userRef = db.doc(`users/${uid}`);
  const adminRef = db.doc(`admins/${payload.email}`);
  const gameMasterRef = db.doc(`gameMasters/${uid}`);
  const [userSnapshot, adminSnapshot, gmSnapshot] = await Promise.all([
    userRef.get(),
    adminRef.get(),
    gameMasterRef.get(),
  ]);

  batch.set(userRef, userProfile(uid, payload, adminUid, userSnapshot.data() || {}), { merge: true });

  if (previousEmail && previousEmail !== payload.email) {
    batch.delete(db.doc(`admins/${previousEmail}`));
  }

  if (payload.role === "admin") {
    batch.set(adminRef, adminProfile(uid, payload, adminUid, adminSnapshot.data() || {}), { merge: true });
    batch.delete(gameMasterRef);
  } else {
    batch.set(gameMasterRef, gameMasterProfile(uid, payload, adminUid, gmSnapshot.data() || {}), { merge: true });
    batch.delete(adminRef);
  }

  await batch.commit();
}

function parseUserPayload(data, options = {}) {
  const payload = {
    name: assertString(data?.name, "Name", 120),
    email: assertString(data?.email, "Email", 180).toLowerCase(),
    role: assertRole(data?.role),
    active: toActive(data?.active),
  };
  if (options.requirePassword) {
    payload.password = assertString(data?.password, "Password", 128);
  }
  return payload;
}

async function createUserAccountData(data, adminAuth, roleOverride = null) {
  const payload = parseUserPayload({ ...data, role: roleOverride || data?.role }, { requirePassword: true });
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.name,
      disabled: !payload.active,
    });
  } catch (err) {
    throw new HttpsError("already-exists", err.message || "Could not create Auth user.");
  }

  await syncRoleDocs(userRecord.uid, payload, adminAuth.uid);
  return { uid: userRecord.uid };
}

async function updateUserAccountData(data, adminAuth, roleOverride = null) {
  const uid = assertString(data?.uid, "UID", 128);
  const payload = parseUserPayload({ ...data, role: roleOverride || data?.role });
  if (uid === adminAuth.uid && (payload.active !== true || payload.role !== "admin")) {
    throw new HttpsError("failed-precondition", "You cannot remove your own admin access.");
  }
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const gmSnapshot = await db.doc(`gameMasters/${uid}`).get();
  const previousProfile = userSnapshot.exists ? userSnapshot.data() : gmSnapshot.data() || {};
  const previousEmail = (previousProfile.email || "").toLowerCase();

  try {
    await auth.updateUser(uid, {
      email: payload.email,
      displayName: payload.name,
      disabled: !payload.active,
    });
  } catch (err) {
    throw new HttpsError("not-found", err.message || "Could not update Auth user.");
  }

  await syncRoleDocs(uid, payload, adminAuth.uid, previousEmail);
  return { uid };
}

export const createUserAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  return createUserAccountData(request.data, adminAuth);
});

export const updateUserAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  return updateUserAccountData(request.data, adminAuth);
});

export const setUserDisabled = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  const uid = assertString(request.data?.uid, "UID", 128);
  if (uid === adminAuth.uid) {
    throw new HttpsError("failed-precondition", "You cannot disable your own account.");
  }
  const disabled = request.data?.disabled === true;
  await auth.updateUser(uid, { disabled });
  const active = !disabled;
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const gmSnapshot = await db.doc(`gameMasters/${uid}`).get();
  const profile = userSnapshot.exists ? userSnapshot.data() : gmSnapshot.data() || {};
  const role = profile.role === "admin" ? "admin" : "gm";
  const payload = {
    name: profile.name || profile.email || uid,
    email: assertString(profile.email, "Email", 180).toLowerCase(),
    role,
    active,
  };
  await syncRoleDocs(uid, payload, adminAuth.uid, payload.email);
  return { uid, disabled };
});

export const deleteUserAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  const uid = assertString(request.data?.uid, "UID", 128);
  if (uid === adminAuth.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }

  const [userSnapshot, gmSnapshot] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`gameMasters/${uid}`).get(),
  ]);
  const profile = userSnapshot.exists ? userSnapshot.data() : gmSnapshot.data() || {};
  const email = typeof profile.email === "string" ? profile.email.toLowerCase() : "";

  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw new HttpsError("not-found", err.message || "Could not delete Auth user.");
    }
  }

  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`gameMasters/${uid}`));
  if (email) batch.delete(db.doc(`admins/${email}`));
  await batch.commit();
  return { uid };
});

export const createGameMasterAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  return createUserAccountData(request.data, adminAuth, "gm");
});

export const updateGameMasterAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  return updateUserAccountData(request.data, adminAuth, "gm");
});

export const deleteGameMasterAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  const uid = assertString(request.data?.uid, "UID", 128);
  if (uid === adminAuth.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }
  try {
    await auth.updateUser(uid, { disabled: true });
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw new HttpsError("not-found", err.message || "Could not disable Auth user.");
    }
  }
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`gameMasters/${uid}`));
  await batch.commit();
  return { uid };
});

async function verifyRecaptcha(token, expectedAction) {
  const secret = recaptchaSecret.value();
  if (!secret) throw new HttpsError("failed-precondition", "reCAPTCHA secret is not configured.");

  const params = new URLSearchParams({
    secret,
    response: token,
  });
  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const result = await response.json();
  if (result.success !== true) {
    throw new HttpsError("permission-denied", "reCAPTCHA verification failed.");
  }
  if (result.action !== expectedAction) {
    throw new HttpsError("permission-denied", "reCAPTCHA action mismatch.");
  }
  if (typeof result.score !== "number" || result.score < 0.5) {
    throw new HttpsError("permission-denied", "reCAPTCHA score is too low.");
  }
}

export const verifyRecaptchaToken = onCall({ ...callableOptions, secrets: [recaptchaSecret] }, async (request) => {
  const recaptchaToken = assertString(request.data?.recaptchaToken, "reCAPTCHA token", 4096);
  const action = assertString(request.data?.action, "reCAPTCHA action", 80);
  if (!["admin_login", "gm_login"].includes(action)) {
    throw new HttpsError("invalid-argument", "reCAPTCHA action is not allowed.");
  }
  await verifyRecaptcha(recaptchaToken, action);
  return { ok: true };
});

export const joinEvent = onCall({ ...callableOptions, secrets: [recaptchaSecret] }, async (request) => {
  const eventId = assertString(request.data?.eventId, "Event", 160);
  const name = assertString(request.data?.name, "Player name", 80);
  const pin = assertString(request.data?.pin, "PIN", 6);
  const recaptchaToken = assertString(request.data?.recaptchaToken, "reCAPTCHA token", 4096);
  if (!/^\d{6}$/.test(pin)) throw new HttpsError("invalid-argument", "PIN must be 6 digits.");
  await verifyRecaptcha(recaptchaToken, "join_event");

  const eventRef = db.doc(`events/${eventId}`);
  const secretRef = db.doc(`eventSecrets/${eventId}`);
  const [eventSnapshot, secretSnapshot] = await Promise.all([eventRef.get(), secretRef.get()]);
  if (!eventSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
  const event = eventSnapshot.data();
  if (event.published !== true || event.inviteEnabled !== true) {
    throw new HttpsError("failed-precondition", "This event is not accepting joins.");
  }
  if (!secretSnapshot.exists || secretSnapshot.data().pin !== pin) {
    throw new HttpsError("permission-denied", "Incorrect event PIN.");
  }

  const playerRef = eventRef.collection("players").doc();
  await playerRef.set({
    name,
    joinedAt: FieldValue.serverTimestamp(),
    joinedBy: "invite",
  });

  return { playerId: playerRef.id };
});
