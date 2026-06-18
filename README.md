# Chronocodex

<img width="1915" height="939" alt="image" src="https://github.com/user-attachments/assets/603a1d6e-45d1-4273-9c2f-11cb78598cdb" />

A Firebase-hosted React + Vite calendar for game events. The public calendar shows ongoing and upcoming events as date-grouped 24-hour timelines. Admins manage games, events, and users at `/admin`. Managed users can be assigned Admin or GM roles. Game Masters sign in at `/gm`, create their own events, generate invite links with 6-digit PINs, and manage joined players.

For a product-facing overview of current screens, role capabilities, invite behavior, and common terms, see [Chronocodex Features And Terms](docs/features-and-terms.md).

For the proposed dev/live environment split and future D1/Worker migration plan, see [Cloudflare D1 + Worker Feasibility and Migration Plan](docs/d1-worker-feasibility-and-migration.md).

## Requirements

Install these locally:

- Node.js and npm
- Firebase CLI: `npm install -g firebase-tools`

Enable these Firebase products:

- Firebase Hosting
- Cloud Firestore
- Firebase Authentication with Email/Password provider
- Cloud Functions for Firebase
- Google reCAPTCHA v3 site key and secret key

Cloud Functions use Node 20 and deploy to `asia-southeast1`.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Firebase web app config and `VITE_RECAPTCHA_SITE_KEY`.
3. Sign in to Firebase CLI:

```bash
firebase login
```

4. Install app dependencies:

```bash
npm install
```

5. Install Cloud Functions dependencies:

```bash
npm install --prefix functions
```

6. Store the reCAPTCHA secret for Cloud Functions:

```bash
firebase functions:secrets:set RECAPTCHA_SECRET_KEY
```

7. Create the first admin Auth account in Firebase Authentication.
8. Create the first admin document manually in Firestore:

```text
admins/your-email@example.com
```

The document can be empty. The document ID must be the lowercase Firebase Auth email. After this, use `/admin > Users` to create Admin and GM login accounts.

## Local Development

Run the app:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Check the functions file syntax:

```bash
node --check functions/index.js
```

## Deploy Everything

Build first:

```bash
npm run build
```

Deploy hosting, Firestore rules, and functions together:

```bash
firebase deploy --only hosting,firestore:rules,functions
```

## Deploy Only One Part

Hosting only:

```bash
npm run build
firebase deploy --only hosting
```

Firestore rules only:

```bash
firebase deploy --only firestore:rules
```

Validate Firestore rules without deploying:

```bash
firebase deploy --only firestore:rules --dry-run
```

Functions only:

```bash
firebase deploy --only functions
```

Deploy one function:

```bash
firebase deploy --only functions:createUserAccount
firebase deploy --only functions:updateUserAccount
firebase deploy --only functions:setUserDisabled
firebase deploy --only functions:deleteUserAccount
firebase deploy --only functions:createGameMasterAccount
firebase deploy --only functions:updateGameMasterAccount
firebase deploy --only functions:deleteGameMasterAccount
firebase deploy --only functions:joinEvent
firebase deploy --only functions:verifyRecaptchaToken
```

## Updating Functions

Function source lives in `functions/index.js`.

After changing function code:

1. Check syntax:

```bash
node --check functions/index.js
```

2. If dependencies changed, update `functions/package.json` and run:

```bash
npm install --prefix functions
```

3. Deploy functions. On the first deploy after adding reCAPTCHA, make sure `RECAPTCHA_SECRET_KEY` has been set with `firebase functions:secrets:set RECAPTCHA_SECRET_KEY`:


```bash
firebase deploy --only functions
```

4. If the frontend calls a new function name or changed payload shape, rebuild and deploy hosting too:

```bash
npm run build
firebase deploy --only hosting,functions
```

## Current Callable Functions

- `createUserAccount`: admin-only; creates Firebase Auth user, `users/{uid}` profile, and the role compatibility document.
- `updateUserAccount`: admin-only; updates Firebase Auth user, `users/{uid}` profile, and role compatibility documents.
- `setUserDisabled`: admin-only; disables or enables Firebase Auth access and app role access.
- `deleteUserAccount`: admin-only; hard-deletes the Firebase Auth user and removes user/role profile documents.
- `createGameMasterAccount`: admin-only; creates Firebase Auth user and `gameMasters/{uid}` profile.
- `updateGameMasterAccount`: admin-only; updates GM profile and Auth account.
- `deleteGameMasterAccount`: admin-only; disables Auth account and removes the GM profile.
- `joinEvent`: public callable; validates event ID, player name, published/invite state, 6-digit PIN, and reCAPTCHA v3 token before adding a joined player.
- `verifyRecaptchaToken`: public callable; verifies reCAPTCHA v3 tokens for admin and GM login attempts before Firebase email/password sign-in.

## Calling Cloud Functions From The App

These functions are Firebase callable functions, not plain REST endpoints. Call them with the Firebase client SDK so Firebase sends the expected callable request format, auth context, region, and headers.

The app already uses `src/firebase.js`:

```js
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(app, "asia-southeast1");
const joinEvent = httpsCallable(functions, "joinEvent");

await joinEvent({
  eventId,
  playerName,
  pin,
  recaptchaToken,
});
```

Do not call callable functions with a browser `fetch()` to the Google Cloud URL unless you are intentionally implementing the callable protocol yourself. A direct `fetch()` often appears as a CORS failure because the backend rejects the request shape before the browser can read a useful response.

For local development against deployed functions, run the Vite app normally:

```bash
npm run dev
```

The frontend can call the deployed `asia-southeast1` callable functions from `http://localhost:5173` through the Firebase SDK.

To test local functions with the emulator, start the emulator and connect the client with `connectFunctionsEmulator`:

```js
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const functions = getFunctions(app, "asia-southeast1");

if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
```

Then add this to `.env` only when using the emulator:

```text
VITE_USE_FUNCTIONS_EMULATOR=true
```

## Handling 403 Or CORS Errors

Browser console messages can say CORS even when the real problem is a callable/auth validation failure. Check the Network tab response and Firebase Functions logs:

```bash
firebase functions:log
```

Common causes:

- `403 Forbidden` on admin functions: the signed-in user is not listed in `admins/{lowercase-email}`.
- `permission-denied`: the callable function loaded, but your account is not allowed to perform that action.
- `unauthenticated`: the user is not signed in, or the request was made outside the Firebase SDK.
- `invalid-argument`: required payload fields are missing, such as `eventId`, `pin`, `playerName`, or `recaptchaToken`.
- `failed-precondition` on `joinEvent`: the event is unpublished, invite joining is disabled, or the reCAPTCHA secret is not configured.
- CORS-looking failure from localhost: make sure the frontend uses `httpsCallable(...)`, not direct `fetch(...)`, and that `getFunctions(app, "asia-southeast1")` matches the deployed region. The deployed functions use explicit `cors: true`; redeploy functions after changing CORS options.
- Preflight CORS failure with no function log entry: the request did not reach user code. For 2nd gen functions, check the Cloud Run service/function IAM and allow unauthenticated invocation, then rely on the callable function auth/admin checks for app security.
- Authorization header exists but the browser still reports CORS: check whether the response is actually a Google Cloud `403` before the function runs. Redeploy after setting explicit callable `cors: true`, then verify the 2nd gen function/Cloud Run service allows public invocation. Firebase callable functions still enforce app-level admin checks inside the function.
- reCAPTCHA v3 is invisible by design: there is no checkbox challenge in the form. Google may show a small badge after the v3 script loads.
- `ERROR for site owner: Invalid key type`: the frontend is using a v2 checkbox key or old checkbox script with the v3 flow. Create a reCAPTCHA v3 key, put that site key in `VITE_RECAPTCHA_SITE_KEY`, and redeploy hosting.
- reCAPTCHA failure from localhost: add `localhost`, `127.0.0.1`, and the production domain to the allowed domains for the reCAPTCHA v3 site key in the Google reCAPTCHA admin console.

## Firestore Collections

- `users/{uid}`: canonical managed user profiles with Admin or GM role metadata.
- `admins/{email}`: admin allowlist documents.
- `gameMasters/{uid}`: Game Master profiles linked to Firebase Auth users.
- `events/{eventId}`: event documents, including `createdBy`, `gameMasterUid`, and `inviteEnabled`.
- `eventSecrets/{eventId}`: private invite PIN documents.
- `events/{eventId}/players/{playerId}`: joined player names.
- `games/{gameId}`: game dropdown options.
