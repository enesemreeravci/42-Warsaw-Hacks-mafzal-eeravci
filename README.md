# 42 Warsaw Insight

A TV-friendly dashboard for the 42 Warsaw campus. It shows Common Core learning-progress and
community metrics — completion trends, top students, coalition standings, live campus
activity, evaluations, and more — sourced **live from the official 42 API**, with a full-screen
"TV Mode" designed to rotate unattended on a 1920×1080 display, plus a normal desktop Dashboard
view for day-to-day browsing.

> Built by  (`mafzal`)  (`eeravci`) for the 42 Warsaw Hacks hackathon.

## Screenshots

_Add screenshots here before presenting — e.g. `docs/screenshots/dashboard.png`,
`docs/screenshots/tv-mode.png`, `docs/screenshots/students.png`._

| Dashboard | TV Mode | Students |
|---|---|---|
| _placeholder_ | _placeholder_ | _placeholder_ |

## Software architecture

This is an npm-workspaces monorepo with two apps that only ever talk to each other over HTTP —
they never share code or credentials directly:

```
Browser (TV or desktop)
   │  same-origin /api/* calls only — the frontend never talks to 42 directly
   ▼
frontend/  — Angular 22, standalone components, signals, zoneless change detection
   │  in dev: `ng serve` + proxy.conf.json forwards /api/* to :3000
   │  in prod: `ng build` static output, served by any static file server /
   │           reverse proxy that forwards /api/* to the backend
   ▼
backend/   — Express + TypeScript "backend-for-frontend"
   │  OAuth Client Credentials token management, in-memory TTL caching,
   │  background pre-warming, rate-limited pagination, campus/cursus discovery
   ▼
42 API v2 (https://api.intra.42.fr)
```

- **`frontend/`** — Angular 22 app (`src/app/`) split into `core/` (services: `ApiService`,
  `DashboardStore`, `ThemeService`, `TvModeService`, `AutoLoopService`, ...), `features/`
  (routed pages: dashboard, students, evaluations, black hole, about) and `shared/` (reusable
  UI). State is signal-based (`signal()`/`computed()`/`effect()`), not an NgRx/RxJS store; the
  one polling/caching layer is `DashboardStore`, which the dashboard page and its child
  components read from. Chart.js (via `ng2-charts`) renders all charts; Angular Material
  supplies base UI primitives (buttons, menus, tooltips), heavily re-skinned.
- **`backend/`** — Express app (`src/app.ts`) mounting one router per resource under `/api`
  (`src/routes/*.ts`), each backed by a service (`src/services/*.ts`). `TokenManager` owns the
  42 OAuth Client-Credentials token (fetch, cache, auto-renew before expiry, de-duplicate
  concurrent refreshes). `Ft42ApiClient` wraps `axios` with rate-limit-aware pagination and a
  single 401 retry. `DiscoveryService` resolves the configured campus/cursus **name** (e.g.
  "Warsaw") to the 42 API's internal numeric IDs once at startup. `DataService` owns the "core
  dataset" (students + completions) plus per-feature snapshots (coalitions, evaluations, weekly
  campus activity, black hole, ...), each wrapped in `TtlCache` (stampede protection +
  stale-while-revalidate) and kept warm by `BackgroundRefreshService` on an interval — so a
  normal `GET /api/dashboard/*` request only ever reads from cache and never blocks on a live
  42 API round-trip.
- **Credential boundary**: `FT42_CLIENT_ID`/`FT42_CLIENT_SECRET` exist **only** as backend
  environment variables. The frontend never sees them, never calls `api.intra.42.fr` directly,
  and never stores anything credential-shaped (no `localStorage`/cookies/URL params).

## Prerequisites

- Node.js 24.15.0+ and npm 10+
- A 42 API OAuth application — see below. **Required**; this dashboard runs entirely on
  live 42 API data and has no offline/demo mode.

## Installation

```bash
git clone <this-repo>
cd 42-warsaw-progress-insight
npm install
```

This installs the root, `frontend/`, and `backend/` workspaces in one pass (npm workspaces).

## Environment setup

```bash
cp .env.example .env
```

Then fill in the values you need (see [Environment variables](#environment-variables)
below). **Never commit `.env`** — it's already in `.gitignore`.

### Obtaining 42 API application credentials

1. Log in to the [42 Intranet](https://profile.intra.42.fr).
2. Go to **Settings → API** (`https://profile.intra.42.fr/oauth/applications`) and create a
   new application.
3. Set the scope to read-only public data — this project never writes anything.
4. Copy the generated **UID** into `FT42_CLIENT_ID` and the **Secret** into
   `FT42_CLIENT_SECRET` in your local `.env` file only.

> ⚠️ **Never use your Intra password anywhere in this project.** The 42 API integration uses
> OAuth Client Credentials (an application ID/secret pair), not your personal login. Nothing
> in this codebase asks for or accepts a password.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `FT42_CLIENT_ID` | _(empty)_ | 42 OAuth application UID — **backend only** |
| `FT42_CLIENT_SECRET` | _(empty)_ | 42 OAuth application secret — **backend only** |
| `FT42_API_BASE_URL` | `https://api.intra.42.fr` | 42 API base URL |
| `FT42_CAMPUS_NAME` | `Warsaw` | Campus name used for discovery |
| `FT42_CAMPUS_ID` | _(empty)_ | Optional override to skip name-based discovery |
| `FT42_CURSUS_NAME` | `42cursus` | Cursus name used for discovery |
| `FT42_CURSUS_ID` | _(empty)_ | Optional override to skip name-based discovery |
| `FEATURED_LOGIN` | `mafzal` | Login shown in the "Featured student" card |
| `PORT` | `3000` | Backend port |
| `FRONTEND_ORIGIN` | `http://localhost:4200` | Allowed CORS origin for local dev |
| `CACHE_TTL_SECONDS` | `420` | Backend in-memory cache TTL (7 minutes) |
| `AUTO_REFRESH_SECONDS` | `300` | Frontend auto-refresh interval (served via `/api/config`) |
| `REQUEST_CONCURRENCY` | `4` | Concurrency cap for any fallback per-item 42 API calls |
| `LOG_LEVEL` | `info` | pino log level |

If `FT42_CLIENT_ID`/`FT42_CLIENT_SECRET` are missing, the backend **fails fast at startup**
with a clear message telling you to fill in credentials — there is no demo/offline mode to
fall back to.

## How to run the project

### Local development (recommended)

```bash
npm run dev
```

This runs the backend (`tsx watch`, hot-reloading on save) and `ng serve` (with a dev proxy so
the Angular app's `/api/*` calls reach the backend) concurrently, from the repo root.

- Frontend: **http://localhost:4200**
- Backend: **http://localhost:3000**

Both must be running for the app to work — `npm run dev` starts them together, so this is the
only command you need for day-to-day development or a demo.

### Production build

```bash
npm run build
```

Builds the backend (`backend/dist`) and the Angular production bundle
(`frontend/dist/frontend/browser`).

```bash
npm run start --workspace backend   # after npm run build
```

Serve `frontend/dist/frontend/browser` with any static file server / reverse proxy that
forwards `/api/*` to the backend process above.

## Test commands

```bash
npm test              # backend (Vitest) + frontend (Vitest via Angular's unit-test builder)
npm run lint           # ESLint for both workspaces
```

Backend tests cover: config validation, `TokenManager` (caching, automatic renewal,
concurrent refresh de-duplication, malformed responses), `Ft42ApiClient` (401 retry-once,
token-failure propagation), the `TtlCache` (stampede protection, stale fallback),
metric/normalization pure functions, and REST route behavior (via `supertest` against the
app wired to fixture-backed fakes of the 42 API client, so no live credentials or network
access are needed to run the suite).

Frontend tests cover: the app shell component, presentational components (`AvatarComponent`,
`StatCardComponent`, dashboard panel components), pipes, and `ApiService` (request shape/URL
assertions via `HttpClientTestingModule`).

## API endpoints

### Backend REST API (what the frontend actually calls)

All responses use a consistent envelope: `{ data, meta: { generatedAt, cached, staleData? } }`
on success, `{ error: { code, message } }` on failure. Full endpoint list, query parameters,
and semantics are documented inline in `backend/src/routes/*.ts`; a summary:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness/status probe |
| GET | `/api/config` | Sanitized public config (campus/cursus, refresh interval) |
| GET | `/api/dashboard/summary` | Headline dashboard numbers |
| GET | `/api/dashboard/recent-completions` | Newest validated completions (`days`, `limit`) |
| GET | `/api/dashboard/completion-trend` | Daily completion counts (`days`) |
| GET | `/api/dashboard/top-projects` | Most-completed projects (`days`, `limit`) |
| GET | `/api/dashboard/top-students` | Rankings (`metric`, `limit`, `days`) |
| GET | `/api/dashboard/live-pulse` | TV mode: active sessions, weekly XP leaderboard, black hole watch, achievement feed |
| GET | `/api/dashboard/coalitions` | Coalition leaderboard, ranked by score |
| GET | `/api/dashboard/evaluations` | Recent peer evaluations (`limit`) — corrected student, project, pass/fail flag, mark only; never comments/feedback |
| GET | `/api/dashboard/weekly-campus-activity` | Most campus time / most sessions / night owls / early birds, last 7 days |
| GET | `/api/dashboard/cluster-occupancy` | Live seat occupancy per cluster |
| GET | `/api/dashboard/weekly-top-contributors` | Top contributors leaderboard (`periodDays`) |
| GET | `/api/dashboard/upcoming-events` | Upcoming campus events (`limit`) |
| POST | `/api/dashboard/refresh` | Invalidate + eagerly reload the cache |
| GET | `/api/students` | Paginated/searchable/sortable student list |
| GET | `/api/students/returning` | Students who returned to campus after time away |
| GET | `/api/students/:login` | Student profile + progress detail |
| GET | `/api/projects` | Normalized Common Core project list |
| GET | `/api/projects/:projectId/metrics` | Per-project completion/success metrics |
| GET | `/api/evaluations/analytics` | Evaluation volume/pass-rate analytics over a date range |
| GET | `/api/blackhole/status` | Black hole watch: upcoming and recent black holes campus-wide |
| GET | `/api/status/42` | 42 API reachability/auth status (never returns tokens) |

### External 42 API endpoints used

The backend is the only thing that ever calls `https://api.intra.42.fr` (base URL configurable
via `FT42_API_BASE_URL`). All calls use an OAuth **Client Credentials** app token — no personal
login is ever involved. Endpoints consumed:

| 42 API endpoint | Used for |
|---|---|
| `POST /oauth/token` | Fetching the Client Credentials access token (`TokenManager`) |
| `GET /v2/campus`, `GET /v2/campus/:id` | Resolving `FT42_CAMPUS_NAME` to a campus ID at startup |
| `GET /v2/cursus`, `GET /v2/cursus/:id` | Resolving `FT42_CURSUS_NAME` to a cursus ID at startup |
| `GET /v2/cursus/:cursusId/projects` | The Common Core project catalog |
| `GET /v2/cursus_users` | The student roster (level, active status, profile info) |
| `GET /v2/projects_users` | Project completions/progress — the core of the trend, top-projects and top-students metrics |
| `GET /v2/campus/:id/locations` | Cluster login sessions — powers active-now, cluster occupancy, and weekly campus-time/sessions/night-owls/early-birds |
| `GET /v2/campus/:id/events` | Upcoming campus events |
| `GET /v2/blocs` | Coalition/campus scoping (used instead of `/v2/coalitions`, which ignores the campus filter) |
| `GET /v2/coalitions_users` | Coalition membership and points, for the coalition leaderboard |
| `GET /v2/scale_teams` | Peer evaluations — for the evaluations feed and evaluation analytics |

## TV mode controls

- Click the TV icon in the sidebar, or press **T**, to enter/exit TV mode.
- TV mode hides normal navigation, goes edge-to-edge, and auto-rotates through a sequence of
  full-screen sections (pauses when the tab is hidden, resumes when visible).
- The **Mode** toggle in the sidebar (icon-only: loop/touch icon) switches between Manual and
  Auto — Auto continuously cycles TV Mode and the Dashboard's own auto-scroll, back to back.
- **R** — refresh now. **Escape** — exit browser fullscreen.
- The fullscreen icon toggles real browser fullscreen (useful for a TV/kiosk browser).
- Respects `prefers-reduced-motion`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend exits immediately with a `[CONFIG ERROR]` | Missing `FT42_CLIENT_ID`/`SECRET` | Fill in `.env` - both are always required, there is no demo/offline mode |
| Dashboard shows "Stale data" badge | 42 API temporarily unreachable | Expected behavior — last good data is kept; check `/api/status/42` |
| Frontend can't reach the backend in dev | `ng serve` not using the proxy | Use `npm run dev` (or `npm run start --workspace frontend`, which passes `--proxy-config`) |
| "Campus/Cursus could not be found" at startup | `FT42_CAMPUS_NAME`/`FT42_CURSUS_NAME` doesn't match any 42 API record | Check spelling, or set `FT42_CAMPUS_ID`/`FT42_CURSUS_ID` directly |
| Backend port `3000`/frontend port `4200` already in use | A previous `npm run dev` didn't shut down cleanly | `scripts/dev.cmd` already kills anything listening on those ports before starting — just re-run `npm run dev` |

## Security notes

- Client ID/Secret: backend environment variables only. Never in Angular code,
  `localStorage`/`sessionStorage`/cookies, or committed files.
- The frontend calls only local `/api/*` endpoints — verified by scanning the production
  bundle for secret-shaped strings as part of manual verification.
- Logs (both frontend console and backend `pino` output) never print tokens or secrets; the
  backend logger redacts secret-shaped fields by name.
- `GET /api/config` and `GET /api/status/42` return deliberately narrow, sanitized shapes.

## Limitations

In-memory cache only (no Redis/database), no persistent historical store beyond the coalition
score snapshot history (`backend/data/`), no authentication on the dashboard itself (by design,
for a shared physical display), and a few documented 42 API field-completeness assumptions
(see the inline comments in `backend/src/services/*.ts` for specifics per metric).

## Contributors

- **M** — [`mafzal`](https://profile.intra.42.fr/users/mafzal) — 42 Warsaw
- [`eeravci`](https://profile.intra.42.fr/users/eeravci) — 42 Warsaw
