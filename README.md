# Game Calendar

A Firebase-hosted React + Vite calendar for game events. The public view shows ongoing and upcoming events as date-grouped 24-hour timelines. The admin view at `/admin` uses Firebase Auth and Firestore to manage events.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Firebase web app config.
3. Enable Firebase Auth sign-in providers.
4. Create the first admin document manually in Firestore:

```text
admins/your-email@example.com
```

The document can be empty. The document ID must exactly match the Firebase Auth email.

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
- Firebase Authentication with Email/Password provider

Deploy hosting with:

```bash
firebase deploy --only hosting
```

Deploy Firestore rules with:

```bash
firebase deploy --only firestore:rules
```
