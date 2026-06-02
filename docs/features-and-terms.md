# Chronocodex Features And Terms

This README describes the current product surface of Chronocodex: what each role can do, where the main screens live, and what common terms mean in the app.

## App Surfaces

### Public calendar (/)

The public calendar is the first screen for visitors. It shows published events in Malaysia time as date-grouped 24-hour timelines.

Current features:

- View published ongoing and upcoming events.
- Scroll and pan across calendar days.
- Open event details from a timeline bar.
- See event time, date, Game Master, game, location, and description.
- Copy a shared event link.
- Add an event to Google Calendar.
- See joined-player counts for invite-enabled events.
- Navigate to GM login.

### Shared event page (/event/:eventId)

The shared event page is the direct link for one published event.

Current features:

- View event details for a published event.
- Add the event to Google Calendar.
- Join an invite-enabled event with a player name and 6-digit PIN.
- View joined players when invites are enabled.
- Let signed-in admins or the event owner edit or remove joined players.

Unpublished, deleted, or unavailable events are not shown to public visitors from this page.

### Admin dashboard (/admin)

The admin dashboard is the control area for site administrators.

Current features:

- Sign in with an admin email and password.
- Create, edit, publish, unpublish, and delete events.
- Filter events by title, Game Master, and date range.
- Assign event fields including Game Master, game, location, description, time, published state, and invite-enabled state.
- Manage the game list used by event forms.
- Create, edit, activate, deactivate, and remove Game Master login accounts.
- Navigate back to the public calendar.

Current invite limitation:

- The admin dashboard currently exposes the Invite enabled toggle for events.
- The admin dashboard does not currently expose the full invite workflow inline.
- Admins can manage joined players from a shared event page when signed in.

### Game Master dashboard (/gm)

The Game Master dashboard is the event workspace for signed-in active Game Masters.

Current features:

- Sign in with a Game Master email and password.
- View events created by the signed-in Game Master.
- Create, edit, and delete events owned by the signed-in Game Master.
- Set event fields including title, game, location, description, time, published state, and invite-enabled state.
- Enable invites for an event.
- Set or randomize a 6-digit invite PIN.
- View the invite link for an existing event.
- See invite PIN and invite link summaries in the event list.
- View, edit, and remove joined players for the selected event.
- Navigate back to the public calendar.

## Role Capabilities

### Public visitor

A public visitor is anyone using the public calendar or a shared event link without signing in.

Current capabilities:

- View published events.
- Open event details.
- Copy or share event links.
- Add events to Google Calendar.
- Join invite-enabled events with a player name and valid 6-digit PIN.
- View joined players for invite-enabled events.

### Admin

An admin is a signed-in Firebase Auth user whose lowercase email has a matching document in the admin allowlist.

Current capabilities:

- Manage events across the app.
- Publish and unpublish events.
- Delete events.
- Filter admin event lists.
- Manage games.
- Manage Game Master accounts.
- Manage joined players from shared event pages when signed in.

The admin dashboard does not currently expose invite PINs, invite links, or joined-player management inline.

### Game Master

A Game Master is a signed-in Firebase Auth user with an active Game Master profile.

Current capabilities:

- Manage their own events.
- Publish or draft their own events.
- Enable event invites.
- Set and randomize invite PINs.
- See invite links.
- Manage joined players for their own events.

## Invite Flow

Invites are controlled at the event level.

- When Invite enabled is off, the event does not accept public joins.
- When Invite enabled is on, the shared event page shows the join form.
- A visitor joins by entering a player name and the event 6-digit PIN.
- Successful joins add the player to the event joined-player list.
- Joined players are visible on the shared event page for invite-enabled events.
- Admins and the event owner can edit or remove joined players when signed in.

The Game Master dashboard currently exposes invite PINs, invite links, and joined-player management inline. The admin dashboard currently does not expose the full invite workflow inline.

## Terms

**Admin**: A signed-in user allowed to manage the app through /admin.

**Draft**: An event whose published state is off. Draft events are not shown to public visitors.

**Ended**: An event whose end time is in the past.

**Event**: A scheduled game session with a title, Game Master, game, location, description, start time, end time, published state, and invite-enabled state.

**Game**: A reusable game name and color option used when creating or editing events.

**Game Master**: A signed-in active user who can manage their own events from /gm.

**Invite enabled**: An event setting that allows public visitors to join from the shared event page if they have the correct 6-digit PIN.

**Invite link**: The shared event page URL for an event, using /event/:eventId.

**Joined player**: A player name submitted through the invite join form.

**Malaysia time**: The app display and input timezone. Event dates and times are shown in Malaysia time.

**Ongoing**: An event whose start time has passed and whose end time has not passed yet.

**Public calendar**: The main visitor-facing timeline at /.

**Published**: An event whose published state is on. Published events can appear on the public calendar and shared event page.

**Shared event page**: The public detail page for one event at /event/:eventId.

**Upcoming**: An event whose start time is in the future.

**6-digit PIN**: A numeric invite code required for public visitors to join an invite-enabled event.
