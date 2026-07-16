# Badminton Match Grouping App — MVP Plan

## Overview

A cross-platform (iOS + Android) mobile app for discovering and joining pickup
badminton events grouped by geographic area, with skill-based matchmaking so
games stay balanced and enjoyable for all levels.

## Core Product

### Discovery & area
- Primary use case: browse/join pickup games happening nearby (like a
  "Meetup for badminton"), layered with skill-based matchmaking.
- Area is determined by GPS radius + adjustable distance filter, with a
  manual fallback where users can enter a country/city instead of using
  location services.
- Discovery UI: sortable/filterable list (distance, time, skill range) with
  an optional map view toggle.

### Skill system
- Self-reported skill tier at signup (e.g. Beginner / Intermediate /
  Advanced / Pro). No dynamic rating/ELO system in v1.

### Events
- Any user can create an event: venue, time window, total headcount, and a
  skill range.
- Format is a flexible open session — the app fills the headcount, players
  self-organize into courts on-site. No fixed team/slot assignment.
- One-off events only. No recurring/repeat-rule events in v1 (organizers
  running weekly sessions can duplicate a past event as a shortcut).

### Joining
- Join requests **auto-accept** if the requester's skill tier falls within
  the event's posted skill range.
- Requests outside the skill range go to the organizer for manual
  approve/decline.

### Venues
- Crowdsourced hybrid venue list: organizers pick from existing venues or
  add a new one (address + map pin) if theirs isn't listed. Venues persist
  and become reusable/searchable for future events.

### Trust & safety
- Basic user profile: name, photo, self-reported skill, join history.
- Post-event ratings and reporting (no-show, poor sportsmanship) between
  participants.
- No ID/phone verification gate to join or create events at launch.

### Coordination
- Each event auto-creates a group chat for joined participants, archived
  after the event concludes.

### Notifications (push)
Core transactional only:
- Join request accepted/declined
- Event updated or cancelled
- New chat message
- Pre-event reminder

No proactive/discovery push notifications (e.g. "new event near you") in v1.

### Auth
- Sign in with Apple + Sign in with Google (Apple sign-in is required by
  App Store policy since a third-party login option — Google — is offered).

### Monetization
- Free, no monetization at launch. Revisit once there's real usage data.

## Technical Architecture

- **Framework**: React Native with Expo — single codebase for iOS and
  Android, strong ecosystem support for maps, push notifications, and auth.
- **Backend**: Supabase (Postgres + PostGIS)
  - PostGIS enables accurate radius/distance geo-queries combined with
    other relational filters (skill range, open slots, time window) in a
    single query — a better fit than NoSQL geohash-based approaches given
    area-based discovery is the core feature.
  - Built-in Auth (Apple/Google sign-in), Realtime (drives per-event chat
    and live join-status updates), and Storage (profile photos, venue
    images) cover the app's needs without separate infra.
  - Standard Postgres underneath avoids proprietary-format lock-in.
- **Cost model**: Launch on Supabase's Free tier (500 MB DB, 5 GB
  bandwidth, 50k MAU, 1 GB storage, 200 realtime connections — ample for
  MVP validation). Upgrade to Pro ($25/mo) once nearing a cap or when
  production reliability (no auto-pause, daily backups) is needed.
  Compress/resize images client-side before upload to conserve the 1 GB
  storage allowance.

## V1 Scope

Everything above is in scope for v1 — it was deliberately kept to a single
coherent MVP rather than sliced further, since the whole loop (discover →
join → chat → rate) needs to exist for the product to be testable at all.

### Explicitly deferred (not in v1)
- Recurring/repeating events
- Dynamic ELO-style skill ratings (peer/admin skill verification also
  deferred)
- ID/phone verification
- Monetization (freemium, ads, or booking-fee split)
- Proactive/discovery push notifications
- Map-first discovery UI (map is secondary to the list view for now)
