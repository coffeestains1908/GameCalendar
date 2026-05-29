const INDEX_URL_PATTERN = /(https:\/\/console\.firebase\.google\.com\/[^\s]+)/;

const FIREBASE_MESSAGES = {
  'permission-denied': {
    title: 'Permission denied',
    detail:
      'Firestore rules blocked this request. Check that the user is signed in as an allowed admin, or that public event queries include only published events.',
  },
  'failed-precondition': {
    title: 'Firestore index needed',
    detail:
      'Firestore needs an index for this query before it can run. Create the suggested index in Firebase, then try again after it finishes building.',
  },
  unavailable: {
    title: 'Firestore is unavailable',
    detail: 'The database could not be reached. Check your internet connection and try again.',
  },
  unauthenticated: {
    title: 'Sign-in required',
    detail: 'Please sign in again before loading or changing admin events.',
  },
  'not-found': {
    title: 'Event not found',
    detail: 'This event may have been deleted or moved. Refresh the list and try again.',
  },
  'resource-exhausted': {
    title: 'Firebase quota reached',
    detail: 'Firebase rejected the request because a quota or rate limit was reached. Try again later.',
  },
  invalid_argument: {
    title: 'Invalid event data',
    detail: 'One or more event fields are not valid. Check the form values and try again.',
  },
  'invalid-argument': {
    title: 'Invalid event data',
    detail: 'One or more event fields are not valid. Check the form values and try again.',
  },
};

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/user-not-found': 'No account exists for that email.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/email-already-in-use': 'An account already exists for that email.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/unauthorized-domain':
    'This domain is not authorized in Firebase Authentication settings.',
};

function extractFirebaseConsoleUrl(error) {
  const message = error?.message || '';
  return message.match(INDEX_URL_PATTERN)?.[1] || '';
}

export function toUserError(error, fallbackTitle = 'Something went wrong') {
  const code = error?.code || '';
  if (AUTH_MESSAGES[code]) {
    return {
      title: 'Sign-in failed',
      detail: AUTH_MESSAGES[code],
      actionUrl: '',
    };
  }

  const known = FIREBASE_MESSAGES[code];
  if (known) {
    return {
      ...known,
      actionUrl: code === 'failed-precondition' ? extractFirebaseConsoleUrl(error) : '',
    };
  }

  return {
    title: fallbackTitle,
    detail:
      'The request failed unexpectedly. Refresh and try again. If it keeps happening, check the Firebase project configuration and browser console.',
    actionUrl: '',
  };
}

export function toInlineError(error, fallback = 'The request failed. Please try again.') {
  return toUserError(error, fallback).detail || fallback;
}
