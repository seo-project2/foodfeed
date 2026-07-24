# Orgs, Reservations, Smart Alerts, Repost — Design

## Context

FoodFeed today: broadcast-only feed of campus food sightings. Users react (`otw / got / late`) and can mark posts `still / gone`. The `organization` field on a post is free text. Alerts are keyword+radius subscriptions. There is no way to reserve food, follow a club, or repost recurring events.

This spec adds four intertwined features that turn the app from a bulletin board into a coordination surface:

1. **Reservations** — soft claim N portions of a post, auto-expires in 15 min.
2. **Repost from past** — one-tap to relist a recurring event with prefilled fields.
3. **Smart alerts** — filter subscriptions by tag whitelist, and follow orgs so their posts fire a notification automatically.
4. **Org karma & leaderboard** — reactions-weighted score per org over a rolling 30-day window; leaderboard + per-post pill + org profile page.

All four ship in a single branch/PR against `main`.

## Non-goals

- No moderation UI for orgs (dedupe/merge is a future admin task).
- No individual-user leaderboards or karma. Karma is org-only.
- No verified-org badge in this scope (future trust & safety pass).
- No push notifications; alerts still fire into the in-app inbox.
- No paid / claimable / gated reservations. Honor-system only.
- No cross-school orgs. An org is bound to one school.

## Data model

Migration `006_orgs_reservations_follows.sql` (mirrored in `schema.sql`).

### New tables

```sql
CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id  TEXT NOT NULL REFERENCES schools(id),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,               -- lowercase, alnum+dashes
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, slug)
);

CREATE TABLE reservations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES food_posts(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id),
    count      INTEGER NOT NULL CHECK (count BETWEEN 1 AND 3),
    status     TEXT NOT NULL CHECK (status IN ('active','picked_up','expired','released')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE (post_id, user_id)
);
CREATE INDEX idx_reservations_post_status ON reservations(post_id, status);
CREATE INDEX idx_reservations_user ON reservations(user_id);

CREATE TABLE org_follows (
    user_id    TEXT NOT NULL REFERENCES users(id),
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, org_id)
);
CREATE INDEX idx_org_follows_org ON org_follows(org_id);

CREATE TABLE subscription_tags (
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    PRIMARY KEY (subscription_id, tag)
);
```

### Modified tables

```sql
ALTER TABLE food_posts ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE food_posts ADD COLUMN portions INTEGER;   -- NULL = "plenty", disables reservations
CREATE INDEX idx_food_posts_org ON food_posts(organization_id);
```

The existing free-text `food_posts.organization` column stays for one release as a display fallback. New writes go to `organization_id`; reads join `organizations` on that id and fall back to the free-text column only if `organization_id IS NULL`.

## API surface

All routes require auth unless noted. Every endpoint that returns a post also returns the enriched shape below.

### Organizations

```
GET  /api/orgs?q=..                    → [{id, name, slug, karma, follower_count, is_following}]
GET  /api/orgs/:id                     → org profile + recent_posts[]
GET  /api/orgs/leaderboard             → top 5 orgs at user's school (30-day karma)
POST /api/orgs                         {name}      → creates org for user's school (idempotent by slug)
POST /api/orgs/:id/follow              → toggle; returns {following: bool, follower_count: int}
```

`GET /api/orgs?q=` doubles as the composer autocomplete source: empty `q` returns the most-recent 20 orgs at the school; non-empty `q` prefix-matches on `slug`.

`POST /api/orgs` behavior: normalize name → slug (lowercase, replace non-alnum with `-`, collapse dashes). If `(school_id, slug)` exists, return that org. Otherwise insert and return the new row. This is the mechanism the composer uses when a user types a name that doesn't match any existing org.

### Reservations

```
POST   /api/posts/:id/reserve                  {count}    → post JSON with my_reservation set
POST   /api/posts/:id/reservation/pickup                  → marks user's reservation picked_up
DELETE /api/posts/:id/reservation                          → releases user's reservation
```

Reserve logic (in a single transaction):

1. Sweep expired reservations for this post (`status='active' AND expires_at < now() → status='expired'`).
2. Compute `portions_left = post.portions - SUM(count) WHERE status IN ('active','picked_up')`. 400 if `post.portions IS NULL` (unbounded post — reservations disabled).
3. If user already has a reservation on this post: return 409 with the existing row (user must release first to change count).
4. If `count > portions_left`: return 409 with `{portions_left}` so the frontend can retry with a smaller count.
5. Insert `(post_id, user_id, count, status='active', expires_at = now() + 15 min)`.

The lazy sweep in step 1 runs on every read-path that surfaces reservations (feed endpoints, org profile, `GET /api/posts/:id`). No cron.

### Subscriptions (existing) — extended

`POST /api/subscriptions` and `PATCH /api/subscriptions/:id` accept an optional `tags: string[]` field. The current keyword+radius match logic extends: a post matches a subscription iff **all** of the following hold:

- Keyword empty OR title/location/tag contains keyword (existing rule)
- Radius: post within `radius_miles` of subscription (existing rule)
- Tag list empty OR post.tag ∈ tags
- Post's organization is not muted by user (no-op v1)

**Org-follow → automatic notification:** a post whose `organization_id` is followed by user U inserts a notification for U at post-create time, regardless of subscriptions. The notification message is `"<Org name> just posted: <title>"`. This is a second, independent channel from subscriptions — deduplication is left to the reader (v1: send both if both match).

### Enriched post shape

Every endpoint that returns a post (or list of posts) now includes:

```jsonc
{
  "id": 42,
  "title": "...",
  // ...existing fields...
  "portions": 20,              // null when unbounded
  "portions_left": 14,         // omitted when portions is null
  "my_reservation": {          // null when user has no active reservation
    "count": 2,
    "status": "active",
    "expires_at": "2026-07-24T18:12:00Z"
  },
  "org": {                     // null when organization_id is null
    "id": 7,
    "name": "CS Club",
    "karma": 47
  }
}
```

The org's karma is computed **once per feed request** (single grouped query across all orgs surfaced in the result set) and denormalized into each post's `org.karma`. Cheap because orgs are ≪ posts.

### Past posts

```
GET /api/me/past-posts    → last 30 posts authored by user, newest first, incl. expired
```

Used by Profile → past posts list. Each item includes the same enriched shape plus a `can_repost: true` marker (always true in v1; kept in case we later restrict).

## Karma computation

Not a stored column. Derived query, run on demand:

```sql
SELECT p.organization_id,
       SUM(CASE r.kind
             WHEN 'got'   THEN 3
             WHEN 'otw'   THEN 1
             WHEN 'still' THEN 1
             WHEN 'late'  THEN -1
             WHEN 'gone'  THEN -1
           END) AS karma
FROM post_reactions r
JOIN food_posts p ON p.id = r.post_id
WHERE r.created_at > datetime('now', '-30 days')
  AND p.organization_id IS NOT NULL
  AND p.school_id = :school_id
GROUP BY p.organization_id
```

Index support: `idx_post_reactions_post` (existing) plus a new `idx_food_posts_org`. Karma per feed request is one grouped query keyed on `organization_id IN (...)` for the orgs present in the response.

## Frontend changes (`frontend/src/App.jsx`)

Additive, following existing patterns:

**Composer (Post screen)**
- Replace the free-text Organization field with an **OrgAutocomplete** component: input + dropdown of matches from `GET /api/orgs?q=`. Empty state shows top-20 school orgs. Free-typing a new name and submitting the post triggers a `POST /api/orgs` first, then attaches the returned id.
- Add a **Portions** integer field, optional, placeholder "leave blank if unlimited."

**PostCard + PostModal**
- Below the title/org row, add:
  - `★ 47` **karma pill** next to the org name when `org.karma > 0`. Clickable → org profile.
  - **Portions indicator** when `portions != null`: `"6 of 20 left"` next to expiry. Red when `portions_left === 0`.
- New **ReservationRow** component below the reaction row when `portions != null`:
  - No reservation: `-` / count / `+` selector (1–3) + `Reserve` button.
  - Active reservation: shows `Reserved 2 · expires in 14 min` with `Picked up` and `Release` buttons.
  - Picked up / expired: passive text `Reservation picked up` or `Reservation expired`.

**Alerts screen**
- Existing subscription form gains a Tag multiselect (chips: current known tags from feed + free-typed).
- New section **Following** — list of orgs the user follows with unfollow buttons. Empty state links to `/orgs`.

**Profile screen**
- New **Past posts** section (paginated 10 at a time) — each row shows title / date / portions used / reactions summary, plus a `Post again` button that navigates to `/post` prefilled with title, location, lat, lng, tag, org_id, portions. Photo intentionally not carried over (users should re-scan a fresh flyer).

**New route `/org/:id` — OrgProfile screen**
- Header: org name, karma score, follower count, `Follow` / `Following` toggle.
- Recent posts list (last 30 days, newest first) using existing `PostCard`.
- Reachable from: post card org pill, right-rail leaderboard, `/orgs` list.

**New route `/orgs` — OrgsBrowse screen**
- Searchable flat list of orgs at the user's school with per-row follow button.
- Sorted by karma desc.

**Right rail (desktop, home screen only)**
- New card **Top orgs this month** — top 5 orgs by karma with karma score and a `View org` link. Card empty-states with `"Post-react to boost your favorite org"` when there are no reactions this month.

**VisitReturnPrompt (existing)** — no changes.

## State management

- `me` gains a `following_org_ids: number[]` field (fetched once on `/api/me`).
- New `orgs` cache keyed by id in `FoodFeedInner`, used by the autocomplete and the org profile page to avoid re-fetching on navigation.
- `reactToPost` unchanged. New `reserveOnPost(post, count)`, `pickupReservation(post)`, `releaseReservation(post)` follow the same optimistic-update + revert-on-error pattern.
- Reservation expiry displayed with an interval-ticker (existing `formatMinutes`); once `expires_at` passes, refetch the post via existing polling or explicit `mergePendingPosts` cycle.

## Error handling

- **Reservation count exceeds portions_left** → toast `"Only N left"` and reset the count selector.
- **Duplicate reservation** → server returns 409 with existing row; UI treats it as authoritative.
- **Org name collision on create** → server returns the existing org; the composer silently uses it. No error.
- **Org profile / leaderboard on a user with no school** → 200 with empty arrays, so the UI can render an empty state instead of an error toast.

## Concurrency

Reservation count is the only race point.

- All reservation writes wrap `BEGIN IMMEDIATE` on the SQLite connection (write lock).
- Portions-left is recomputed inside the same transaction as the insert. Two users clicking `Reserve` simultaneously serialize; the second one sees the updated total and gets 409 with the remaining count.
- No pessimistic locking on the post row — SQLite's write lock is sufficient at this scale.

## Backwards compatibility

- Existing posts have `organization_id = NULL` and `portions = NULL`. The feed renderer already handles `org: null` (falls back to `organization` free-text column for display). Reservations UI is hidden entirely on unbounded posts.
- Existing subscriptions have no `subscription_tags` rows → match rule "tag list empty" is trivially true. No behavior change.
- `dev-seed-user` may or may not have a school; endpoints that require one return empty rather than error.

## Verification

Servers already running (`make serve` :5000, `npm run dev` :5173).

1. **Migration applies cleanly**: `sqlite3 FoodFeed/foodfeed.db < FoodFeed/migrations/006_orgs_reservations_follows.sql` succeeds; all three new tables exist with correct constraints; `food_posts.organization_id` and `food_posts.portions` columns present.
2. **Org autocomplete**: on the composer, typing "cs" shows matching orgs; picking one attaches the id; typing a new name submits successfully and the org appears in `GET /api/orgs`.
3. **Portions cap enforced**: create a post with `portions=5`. User A reserves 3, user B reserves 2 → user B succeeds. User B tries again with 1 → 409, toast "Only 0 left."
4. **Reservation auto-expiry**: reserve, wait 16 minutes (or manually update `expires_at` to the past), refresh the feed → reservation shows as expired, portion count returns to pool.
5. **Follow → notification**: user A follows org X. Any user (including a non-A user) posts to org X → user A's notifications inbox shows the org-post message within one poll cycle.
6. **Tag filter**: create a subscription with tag=`pizza`. Post a `pizza` sighting → notification. Post a `snacks` sighting → no notification.
7. **Karma leaderboard**: react `got` on posts from two different orgs. `GET /api/orgs/leaderboard` returns those orgs with karma ≥ 3, sorted desc. Post-react `late` on the same posts to verify the −1 weight. React on a post older than 30 days (manually backdate `post_reactions.created_at`) → does not contribute.
8. **Karma pill on card**: an org with karma > 0 shows `★ N` next to its name on every card of its posts.
9. **Past posts + repost**: post something, let it expire, open Profile → past posts → tap Post again → composer opens prefilled with everything except the photo and the expiry.
10. **Org profile page** at `/org/:id` shows the header, karma, follower count, follow button, recent posts. Following the org toggles the button label and increments `follower_count`.
11. **Mobile view unchanged at ≤767px**: no new components break the phone-frame layout. Reservation row and karma pill render inside the existing card.

## Staging suggestion

If time is tight, land in this order — each stage is independently demo-able:

1. **Orgs table + composer autocomplete** (unblocks everything else; visible even without karma).
2. **Portions + reservations** (biggest coordination-value feature).
3. **Karma computation + right-rail leaderboard + karma pill** (visual demo pop).
4. **Follow + org profile page** (unlocks the "why do I care about orgs" question).
5. **Tag filter on subscriptions** (small, isolated).
6. **Past posts + repost** (small, isolated).
