# Post creation → match → notify pipeline

```mermaid
sequenceDiagram
  autonumber
  actor U1 as Poster
  actor U2 as Subscriber
  participant B as Browser
  participant A as Flask API
  participant OAI as OpenAI Vision
  participant NOM as Nominatim
  participant DB as SQLite

  U1->>B: Snap flyer photo
  B->>A: POST /api/posts/scan (image)
  A->>OAI: chat.completions (vision + JSON)
  OAI-->>A: { title, location, minutes, tag }
  A-->>B: parsed fields
  U1->>B: Confirm + submit
  B->>A: POST /api/posts (multipart: fields + image)
  A->>A: save image to /data/uploads
  A->>NOM: geocode(location)
  NOM-->>A: (lat, lng) or null
  A->>DB: INSERT food_posts
  A->>DB: find_matches(post) — haversine + keyword
  A->>DB: INSERT notifications (one per match)
  A-->>B: 201 created post
  U2->>B: GET /api/notifications (poll)
  B-->>U2: unread badge on bell
```

Matching is synchronous inside `POST /api/posts` — adequate for MVP scale. Notification inserts are wrapped in a SAVEPOINT so a matching bug can't roll back the post itself.
