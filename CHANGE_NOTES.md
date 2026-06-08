
## v1.0.4 Manage Users

Version `1.0.4` introduces a planned Manage Users release for Firebase Authentication users. Admins manage authentication users separately from event and game data, then assign each user an app role.

New user-management capabilities:

- Create an Admin or GM Firebase Auth user from `/admin > Users`.
- Require a temporary password when creating a user.
- Send a Firebase Authentication password reset email.
- Disable or enable a user without deleting the account.
- Hard-delete a user when the account should be removed.
- Store canonical user profiles in `users/{uid}`.
- Keep compatibility documents synchronized with `admins/{lowercaseEmail}` and `gameMasters/{uid}`.

### What Might Break

- Existing admin access may fail if Firestore rules or functions are deployed without hosting or function changes that understand `users/{uid}`.
- Existing GM access may fail if `gameMasters/{uid}` compatibility writes are removed before the GM dashboard and event ownership checks are migrated.
- Password reset emails require valid Firebase Authentication email templates, sender settings, and authorized domains.
- Deleting a user is destructive: the Firebase Auth account is removed, but historical events keep saved `createdBy`, `gameMasterUid`, and GM display names.
- Admins could lock themselves out if self-disable or self-delete protections are missing. The implementation must block those actions.

### Backwards Compatibility

- Keep `admins/{lowercaseEmail}` working as the admin allowlist during the transition.
- Keep `gameMasters/{uid}` working for GM profile lookup and existing event ownership.
- New user-management functions should write `users/{uid}` plus the compatibility document required by the selected role.
- Existing GM account callable names can remain as wrappers until all frontend callers move to the user-management callables.
- No migration is required before deployment. Existing admins and GMs continue to work, and edited or newly-created accounts gain `users/{uid}` records.

### v1.0.4 Deployment Notes

Deploy hosting when the `/admin` user-management UI changes:

```bash
npm run build
firebase deploy --only hosting
```

Deploy Firestore rules when role checks add `users/{uid}` support:

```bash
firebase deploy --only firestore:rules
```

Deploy functions when user-management callables are added or changed:

```bash
firebase deploy --only functions
```

For the full `1.0.4` release, deploy hosting, Firestore rules, and functions together:

```bash
npm run build
firebase deploy --only hosting,firestore:rules,functions
```

Validation checklist:

- Run `npm run build`.
- Run `node --check functions/index.js`.
- Confirm an existing manual `admins/{lowercaseEmail}` account can still sign in.
- Confirm a newly-created Admin can sign in at `/admin`.
- Confirm a newly-created GM can sign in at `/gm`.
- Confirm reset email, disable, enable, and hard delete work from `/admin > Users`.
