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

async function requireAdmin(request) {
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError("unauthenticated", "Sign in is required.");
  const snapshot = await db.doc(`admins/${email.toLowerCase()}`).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Admin access is required.");
  return request.auth;
}

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

export const createGameMasterAccount = onCall(callableOptions, async (request) => {
  const adminAuth = await requireAdmin(request);
  const name = assertString(request.data?.name, "Name", 120);
  const email = assertString(request.data?.email, "Email", 180).toLowerCase();
  const password = assertString(request.data?.password, "Password", 128);
  const active = request.data?.active !== false;

  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password, displayName: name, disabled: !active });
  } catch (err) {
    throw new HttpsError("already-exists", err.message || "Could not create Auth user.");
  }

  await db.doc(`gameMasters/${userRecord.uid}`).set({
    uid: userRecord.uid,
    name,
    email,
    active,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: adminAuth.uid,
  });

  return { uid: userRecord.uid };
});

export const updateGameMasterAccount = onCall(callableOptions, async (request) => {
  await requireAdmin(request);
  const uid = assertString(request.data?.uid, "UID", 128);
  const name = assertString(request.data?.name, "Name", 120);
  const email = assertString(request.data?.email, "Email", 180).toLowerCase();
  const active = request.data?.active !== false;

  await auth.updateUser(uid, { email, displayName: name, disabled: !active });
  await db.doc(`gameMasters/${uid}`).update({
    name,
    email,
    active,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { uid };
});

export const deleteGameMasterAccount = onCall(callableOptions, async (request) => {
  await requireAdmin(request);
  const uid = assertString(request.data?.uid, "UID", 128);
  await auth.updateUser(uid, { disabled: true });
  await db.doc(`gameMasters/${uid}`).delete();
  return { uid };
});

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
