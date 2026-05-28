# Game Calendar

A Firebase-hosted React + Vite calendar for game events. The public view shows ongoing and upcoming events as date-grouped 24-hour timelines. The admin view at `/admin` uses Firebase Auth and Firestore to manage events.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Firebase web app config.
3. Set `VITE_ADMIN_EMAILS` to a comma-separated list of admin emails.
4. Update `firestore.rules` with the same admin emails before deploying rules.

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Firebase

Enable these Firebase products:

- Firebase Hosting
- Cloud Firestore
- Firebase Authentication with Google and Email/Password providers

Deploy hosting with:

```bash
firebase deploy --only hosting
```

Deploy Firestore rules with:

```bash
firebase deploy --only firestore:rules
```
