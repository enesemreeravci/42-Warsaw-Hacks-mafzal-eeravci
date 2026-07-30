# Limitations & Assumptions

Written for the hackathon judges and for whoever picks this project up next. Nothing here is
hidden inside code comments only - if it affects correctness or trust in a number on screen,
it's listed here.

## Proof-of-concept scope

- **In-memory cache only.** `TtlCache` lives in the Node process's memory. Restarting the
  backend clears everything; running multiple backend replicas behind a load balancer would
  give each replica its own independent cache (and independent 42 API load) rather than
  sharing one. See `docs/ARCHITECTURE.md` → Production evolution plan for the Redis path.
- **No persistent historical database.** Every dashboard view is computed from whatever the
  42 API currently returns for `cursus_users` / `projects_users`, filtered client-side (in
  the backend) into time windows. There is no independent record of "what did the dashboard
  say yesterday" - if the 42 API's own data changes retroactively (a mark correction, a
  record deletion), historical trend charts silently reflect the new state, not what was
  actually shown at the time.
- **No authentication on the public TV dashboard.** Every `/api/*` route is unauthenticated
  by design (it's meant for a shared display in a semi-public space, and it only ever serves
  data students can already see about each other). This is appropriate for the hackathon
  demo and the intended physical deployment (Social Space TV), but **not** appropriate if
  this were ever exposed on the open internet - see Production security recommendations
  below.

## 42 API pagination and rate limits

- Bulk endpoints (`cursus_users`, `projects_users`) are paginated with a **hard safety cap**
  (50 and 100 pages respectively, at 100 records/page). For a campus with more than ~5,000
  active cursus enrollments or ~10,000 project-completion records, the dataset would be
  silently truncated rather than growing the request count unboundedly. Warsaw's campus size
  is well within this range today.
- **Filter attribute names are not consistent across endpoints, and this bit us during
  development.** `cursus_users` accepts `filter[campus_id]`/`filter[cursus_id]`, but
  `projects_users` rejects those outright with a `400 Filter Error` - it requires the
  un-suffixed `filter[campus]`/`filter[cursus]` instead. This was masked for the entire
  MOCK_MODE era of this project (mock mode never called the live API at all) and only
  surfaced once mock mode was removed and every dashboard endpoint started failing against
  real credentials. Fixed in `server/src/services/dataService.ts`
  (`loadLiveCoreDataset`), verified against live data before and after. This is the single
  riskiest assumption in the integration - filter names are **not** something the official
  API documentation exhaustively guarantees per endpoint, and a future 42 API change could
  silently reintroduce a similar failure (see `docs/API_RESEARCH.md` for the full detail and
  the general lesson: a `200 OK` with plausible-looking data is not proof a filter worked
  either - see the coalitions entry below).
- Retry/backoff is bounded (3 attempts, capped exponential backoff) - a sustained 42 API
  outage or rate-limit period longer than that will surface as a "stale data" state on the
  dashboard rather than retrying indefinitely.

## API data completeness

- `final_mark` can be `null` on finished records; those records are excluded from average-mark
  math (see `docs/METRICS.md`) rather than counted as zero, which slightly changes the
  denominator compared to "average over all finished attempts."
- `marked_at` is frequently absent on older records; the fallback to `updated_at` then
  `created_at` is a best-effort approximation of "when this was actually completed," which
  can be off by hours to days for older data, and a record with **no** date at all is dropped
  from the dataset entirely (see below).
- Records with no usable completion date (all three date fields null) are **excluded** from
  recent completions, the trend chart, and the celebration carousel. This means
  `totalValidatedCompletions` on the summary card can be marginally higher than the number of
  completions that could ever appear in the timeline/trend views.

## Completion-date assumptions

- The trend chart buckets by **UTC calendar day** using the server's clock. A completion
  timestamped at 23:50 UTC and one at 00:10 UTC the next day land in different buckets even
  if they happened 20 minutes apart in the same Warsaw evening (Warsaw is UTC+1/+2).
- "Last 7 days" / "Last 30 days" are rolling windows computed at request time, not
  calendar-aligned weeks/months.

## 42 API access token lifetime

- Access tokens issued by `POST /oauth/token` currently expire after `expires_in` seconds
  (7200 / 2 hours as returned by the 42 API today). `TokenManager` caches the token in
  backend memory only and automatically requests a new one ~60 seconds before it expires -
  there is no manual renewal step and no restart required.
- This is unrelated to the 42 API application's **client secret** expiry, which you control
  from the 42 Intranet (Settings → API) and which this project has no visibility into beyond
  "token requests started failing" (see Production security recommendations below for the
  rotation procedure).

## TV mode "gamified" data (Hive / XP race / black hole)

- **"Weekly XP" is a proxy metric, not official 42 XP.** `XpLeaderboardEntry.weeklyXp` is the
  sum of `final_mark` on validated completions in the trailing 7 days. Real 42 XP comes from
  the `transactions` endpoint/scope, which this project does not request. The bar-chart race
  is directional (who's been validating the most, and for how much), not a ranking against
  each student's actual XP total.
- **"The Hive" (who's currently on campus) requires 42 API location read access.** It's
  populated via a best-effort call to `GET /v2/campus/:id/locations?filter[active]=true`. If
  the configured 42 API application doesn't have that scope, or the endpoint is temporarily
  unavailable, this degrades silently to an empty "no live sessions" state - it never fails
  the rest of the dashboard.
- **Black hole dates come straight from `cursus_users.blackholed_at`.** This field's exact
  semantics (e.g. whether it's cleared on a break/extension) aren't exhaustively documented
  publicly; a non-null future date is treated at face value as "days remaining."

## Coalition leaderboard and live evaluations

- **Coalitions come from `GET /v2/blocs?filter[campus_id]=`, not `/v2/coalitions?filter[campus_id]=`.**
  The latter returns `HTTP 200` with coalitions from every campus - the filter is silently
  ignored rather than erroring, which is easy to miss if you only check the status code. This
  was caught by noticing the returned coalition names didn't match Warsaw. `blocs` is
  genuinely campus/cursus-scoped and embeds exactly that campus's coalitions, each already
  carrying `score` - no separate aggregate call needed.
- **`scale_teams`'s `filter[campus_id]` scoping is not verified to the same standard as the
  other filters above.** It returns `HTTP 200` with plausible-looking data for
  `filter[campus_id]=67`, but - unlike `cursus_users`/`projects_users`/`blocs` - this was not
  cross-checked against a known Warsaw login before shipping (later verification calls were
  intentionally held back to avoid compounding the rate-limit pressure from the day's
  testing). Given `coalitions` turned out to silently ignore an identical-looking filter, this
  should be treated as unconfirmed rather than assumed correct until someone checks a
  `correcteds[].login` from a live response against a known Warsaw roster.
- **Evaluation `comment`/`feedback` text is never fetched, by design.** A live `scale_teams`
  record inspected during development carries free-text peer-review commentary written by
  the corrector about the corrected student - not the kind of "already publicly visible on a
  profile" data this dashboard otherwise limits itself to. The raw type
  (`RawScaleTeam` in `server/src/models/types.ts`) simply doesn't declare those fields, so
  there's no code path that could surface them, intentionally or by mistake. Only structured,
  low-sensitivity fields are shown: corrected student, project (best-effort), pass/fail
  `flag`, and `final_mark`.
- **Evaluation `projectName` resolution is best-effort.** `scale_teams` doesn't return a
  clean top-level project name the way `projects_users` does; it may come back `null` if the
  record's nested `team`/scale data doesn't resolve cleanly. The UI shows "Evaluation" as a
  fallback label in that case rather than guessing.

## Production security recommendations

If this dashboard were deployed beyond the hackathon demo:

- Put it behind the campus network/VPN, or add a lightweight reverse-proxy auth layer, since
  currently **no** route requires authentication.
- Rotate the 42 API Client Secret via the 42 Intranet app settings if it is ever suspected of
  leaking, and confirm it never appears in CI logs, container registries, or crash reporting
  tools (this codebase never logs it, but that guarantee doesn't extend to infrastructure
  outside this repo).
- Rate-limit `POST /api/dashboard/refresh` (currently only guarded against *concurrent*
  refreshes, not against being called very frequently by a misbehaving client).
- Serve the frontend over HTTPS and set `Strict-Transport-Security` / a real CSP (Helmet's
  defaults are a reasonable starting point but were not hardened for a specific production
  domain).

## Production observability recommendations

- Add structured request tracing (a request ID propagated through logs) so a single failed
  dashboard load can be correlated across the discovery → cache → 42 API call chain.
- Track and alert on: cache hit rate, 42 API error rate/latency, token refresh failures, and
  time-since-last-successful-refresh (so a silently-stale TV display gets noticed quickly).
- Emit a metric on every `cacheStatus: 'stale'` response served to the frontend, since that's
  the clearest signal that the 42 API is degraded from the dashboard's point of view.
