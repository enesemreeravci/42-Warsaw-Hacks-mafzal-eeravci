# 42 API Research

This document records how the backend talks to the official 42 API: authentication, the
endpoints used, pagination/rate-limit handling, discovery logic, and the mapping from raw
API responses to this project's normalized domain models.

## OAuth: Client Credentials flow

The 42 API exposes an OAuth2 **Client Credentials** grant, which is appropriate here because
this application acts on its own behalf (no individual user logs in) to read public campus
data.

```
POST https://api.intra.42.fr/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<FT42_CLIENT_ID>&client_secret=<FT42_CLIENT_SECRET>
```

Example (placeholders only - never a real secret):

```bash
curl -s -X POST https://api.intra.42.fr/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET
```

Response shape (fields used are validated with Zod in `server/src/services/tokenManager.ts`):

```json
{
  "access_token": "…",
  "token_type": "bearer",
  "expires_in": 7200,
  "scope": "public"
}
```

### Token lifetime handling (`TokenManager`)

- The token and its expiry are held **only in backend process memory** - never written to
  disk, logs, or returned to the frontend.
- **Access tokens currently expire after `expires_in` seconds - 7200 (2 hours) as returned
  by the 42 API today.** This value is never hardcoded; it's read from each token response,
  so if 42 changes it, `TokenManager` adapts automatically.
- The token is reused until **60 seconds before** `expires_in` elapses, then transparently
  refreshed on the next request - no restart, no manual re-authentication, and no refresh
  token involved (Client Credentials re-requests a new access token using the same client
  ID/secret). See `server/src/__tests__/tokenManager.test.ts` for the time-based renewal test.
- This is a separate expiry from the 42 API application's **client secret** itself, which is
  managed in the 42 Intranet (Settings → API) and only changes when you regenerate it there;
  `TokenManager` has no visibility into that expiry and will simply start failing token
  requests if the secret is rotated or revoked (surfaced via `GET /api/status/42`).
- Concurrent callers share a single in-flight refresh `Promise` so a burst of requests never
  triggers duplicate token requests (a "thundering herd" guard).
- If any 42 API call returns `401`, the cached token is invalidated and the request is
  retried **exactly once** with a freshly acquired token.
- Malformed token responses (missing `access_token`/`expires_in`) are rejected via a Zod
  schema before being cached.
- `GET /api/status/42` exposes only a sanitized `authenticated: boolean` plus timing/error
  summary - the token value itself is never serialized anywhere.

## Why `/v2/me` is not used

`/v2/me` requires a **user-context** OAuth flow (authorization code, or client credentials
scoped to a specific user token) - it identifies "the currently authenticated student."
Because this project authenticates as an **application** via Client Credentials, there is no
"current user." The featured-student profile therefore uses the public, read-only
`GET /v2/users/:id_or_login` endpoint (e.g. `/v2/users/mafzal`), which works identically for
any login and requires no user session.

## Endpoint inventory

| Purpose | Endpoint | Notes |
|---|---|---|
| Token | `POST /oauth/token` | Client Credentials grant |
| Campus discovery | `GET /v2/campus` | Paginated; matched by name |
| Campus detail | `GET /v2/campus/:id` | Used when `FT42_CAMPUS_ID` is preset |
| Cursus discovery | `GET /v2/cursus` | Paginated; matched by name/slug |
| Cursus detail | `GET /v2/cursus/:id` | Used when `FT42_CURSUS_ID` is preset |
| Campus + cursus enrollment (bulk) | `GET /v2/cursus_users?filter[campus_id]=&filter[cursus_id]=` | Primary source of `StudentSummary` base data (login, level, image, active) |
| Project completions (bulk) | `GET /v2/projects_users?filter[campus_id]=&filter[cursus_id]=` | Primary source of `ProjectCompletion` records |
| Projects for a cursus | `GET /v2/cursus/:cursus_id/projects` | Powers the Projects page listing |
| Individual profile | `GET /v2/users/:login` | Used only as a status probe target (`/v2/campus?page[size]=1` in practice) and documented here for completeness |
| Active campus locations (bulk) | `GET /v2/campus/:id/locations?filter[active]=true` | Powers "The Hive" live node map (`ActiveSessionEntry.activeSince`); fetched best-effort - a missing scope, 403, or transient failure is caught and logged, and the dataset falls back to an empty active-sessions list rather than failing the dashboard |

This project deliberately uses the **bulk, filterable** endpoints (`cursus_users`,
`projects_users`) rather than iterating `GET /v2/campus/:id/users` and then calling
`GET /v2/users/:id/projects_users` per student, which would be an N+1 pattern against a
rate-limited API. The `filter[campus_id]` + `filter[cursus_id]` combination on
`cursus_users`/`projects_users` is a common pattern used by community 42 dashboards; it is
**not guaranteed by official documentation** to be exhaustive for every campus/cursus
combination, so this is recorded as a known assumption (see `docs/LIMITATIONS.md`).

Endpoints listed in the original hackathon brief that are **not currently wired up** (stretch
scope): `/v2/achievements`, `/v2/coalitions`, `/v2/users/:id/titles`. The domain models and
route structure are intentionally left open to add these without breaking existing consumers.

## Pagination strategy

Implemented in `server/src/services/ft42ApiClient.ts` (`Ft42ApiClient.paginate`):

- Uses the 42 API's documented `page[size]` / `page[number]` query parameters.
- Default page size: 100 (the API's practical maximum for most collections).
- Stops when: a page returns fewer than `pageSize` items (last page), a configured
  `maxPages` safety limit is hit, or (when configured) all items on a page are older than a
  `stopBeforeDate` cutoff.
- `maxPages` is always set per call site (e.g. 50 pages for `cursus_users`, 100 pages for
  `projects_users`) so a runaway loop can never occur even if the API's pagination contract
  changes unexpectedly.
- Bulk, filtered calls (`cursus_users`, `projects_users`) are preferred over per-student
  calls specifically to avoid N+1 request patterns.

## Rate-limit and retry strategy

- **429 Too Many Requests**: if the response includes a `Retry-After` header, that value is
  honored exactly; otherwise falls back to exponential backoff.
- **5xx server errors**: retried with bounded exponential backoff (`500ms * 2^attempt`,
  capped at 8s), up to 3 attempts.
- **400 / 404**: never retried - these represent a genuine client-side error (bad filter,
  unknown resource) that a retry cannot fix.
- **401**: not part of the retry/backoff path - handled separately by `TokenManager`
  invalidation plus a single retry (see above).
- Every outbound request has a 15s timeout (10s for the token endpoint).
- All upstream errors are translated into a small, sanitized `Ft42ApiError` before reaching
  route handlers - raw response bodies and headers are never forwarded to the browser.

## Campus and cursus discovery

Implemented in `server/src/services/discoveryService.ts`:

1. **Campus**: if `FT42_CAMPUS_ID` is set, fetch `GET /v2/campus/:id` directly. Otherwise,
   page through `GET /v2/campus`, compare `name` case-insensitively against
   `FT42_CAMPUS_NAME` (default `Warsaw`), and prefer an exact-case match if multiple
   case-insensitive matches exist. If no match is found, a `DiscoveryError` is thrown with a
   clear message; close matches are logged server-side (never exposing secrets) to help
   debugging.
2. **Cursus**: same pattern against `GET /v2/cursus`, matching `FT42_CURSUS_NAME` (default
   `42cursus`) against both `name` and `slug`. An unrelated cursus is never silently chosen -
   if there's no exact match, discovery fails loudly.
3. The discovered `{ campusId, campusName, cursusId, cursusName }` is cached (TTL from
   `CACHE_TTL_SECONDS`) and exposed read-only via `GET /api/config`.

## Raw → normalized data mapping

Raw 42 API objects are never passed to Angular. `server/src/services/normalize.ts` converts
them into the domain models defined in `server/src/models/types.ts`:

| Domain field | Raw source | Notes |
|---|---|---|
| `StudentSummary.displayName` | `user.displayname` → `user.usual_full_name` → `user.login` | First non-empty value wins |
| `StudentSummary.imageUrl` | `user.image.versions.medium` → `.small` → `user.image.link` | Nullable if none present |
| `StudentSummary.active` | `cursus_user.end_at == null` | See Metrics doc |
| `ProjectCompletion.validated` | `project_user.status === 'finished' && project_user['validated?'] === true` | `validated?` is not a legal TS identifier, so it's renamed to `validated` at the normalization boundary |
| `ProjectCompletion.completedAt` | `marked_at` → `updated_at` → `created_at` | First non-null wins; a record with none of these is dropped rather than guessing |
| `StudentSummary.blackholedAt` | `cursus_user.blackholed_at` | Passed through as-is; `null` means not blackholed/not applicable |
| `StudentSummary.activeSince` | `GET /v2/campus/:id/locations` (`begin_at` where `end_at == null`) | Resolved separately from `cursus_users`/`projects_users`, see the locations row above |
| `AchievementEntry.isTakeover` | Derived: `finalMark >= 100` on a validated completion | Not a raw API field - triggers the full-screen "Level Up" takeover overlay in TV mode |
| `XpLeaderboardEntry.weeklyXp` | Derived: sum of `final_mark` on validated completions in the trailing 7 days | A proxy metric, **not** official 42 XP/transactions data - see `docs/LIMITATIONS.md` |

## Metric definitions

See `docs/METRICS.md` for exact formulas (active student, validated completion, current
project, average level, success rate).

## Known uncertainties in 42 API response fields

- `final_mark` can be `null` even on a `finished` record (e.g. some legacy or admin-marked
  records) - average-mark calculations only include records with a non-null mark.
- `marked_at` is frequently `null` for older records; the fallback chain to `updated_at` /
  `created_at` is an approximation of "when this was actually completed," not a guarantee.
- `cursus_users[].end_at` semantics (cursus ended vs. student removed vs. blackholed) are not
  fully documented publicly; this project treats any non-null `end_at` as "not active" for
  simplicity (see Limitations).
- The `filter[campus_id]` / `filter[cursus_id]` combination on `cursus_users` and
  `projects_users` is not exhaustively documented and may behave differently across API
  versions - this is the single biggest "works as observed, not as formally guaranteed"
  assumption in this project.

## Read-only scope and privacy approach

- This project requests **no write scopes** and issues **no write requests** (no `POST`,
  `PATCH`, or `DELETE` calls against `/v2/*`).
- Only fields already public via the 42 API (login, display name, avatar, level, project
  completions) are surfaced. No private fields (email, phone, staff notes) are requested or
  stored.
- The dashboard is intended for a physical, semi-public campus display (the 42 Warsaw Social
  Space), showing the same kind of information students can already see about each other
  inside the Intranet.
