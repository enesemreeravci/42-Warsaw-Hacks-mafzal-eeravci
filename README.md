# 42 Warsaw Insight

A TV-friendly dashboard built for the **42 Warsaw Hacks: Learning Progress Insight**
hackathon. It shows Common Core learning-progress and community metrics for the 42 Warsaw
campus, sourced live from the official 42 API — designed to run on a 1920×1080 TV in the
Warsaw Social Space.

> Built by **Muhammad Afzal** (`mafzal`) for the 42 Warsaw Hacks hackathon.

## Screenshots

_Add screenshots here before presenting — e.g. `docs/screenshots/dashboard.png`,
`docs/screenshots/tv-mode.png`, `docs/screenshots/students.png`._

| Dashboard | TV Mode | Students |
|---|---|---|
| _placeholder_ | _placeholder_ | _placeholder_ |

## Architecture summary

```
Browser (TV or desktop)
   │  same-origin /api/* calls only
   ▼
Angular 22 frontend (standalone components, signals, zoneless)
   │  proxied in dev, reverse-proxied by nginx in prod
   ▼
Express + TypeScript backend-for-frontend
   │  OAuth Client Credentials, caching, pagination, discovery
   ▼
42 API v2 (api.intra.42.fr)
```

The 42 Client ID/Secret exist **only** on the backend. The frontend never sees them, never
calls the 42 API directly, and never stores anything credential-shaped. Full details in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js 24.15.0+ and npm 10+
- A 42 API OAuth application — see below. **Required**; this dashboard runs entirely on
  live 42 API data and has no offline/demo mode.
- Docker + Docker Compose (optional, for containerized runs)

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

## Local development

```bash
npm run dev
```

This runs the backend (`tsx watch`, hot-reloading) and `ng serve` (with a dev proxy so the
Angular app's `/api/*` calls reach the backend) concurrently.

- Frontend: **http://localhost:4200**
- Backend: **http://localhost:3000**

## Production build

```bash
npm run build
```

Builds the backend (`backend/dist`) and the Angular production bundle
(`frontend/dist/frontend/browser`).

```bash
npm run start --workspace backend   # after npm run build
```

Serve `frontend/dist/frontend/browser` with any static file server / reverse proxy that
forwards `/api` to the backend (this is exactly what the Docker setup below does).

## Docker

```bash
cp .env.example .env   # fill in your 42 API credentials
docker compose up --build
```

- Frontend (nginx, reverse-proxying `/api` to the backend): **http://localhost:4200**
- Backend: **http://localhost:3000**

Neither Dockerfile copies `.env` into the image — the backend container reads its
environment at **runtime** via `env_file` in `docker-compose.yml`. Both images run as
non-root users and expose a `HEALTHCHECK`.

The app also works entirely without Docker (see Local development / Production build above).

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

Frontend tests cover: the app shell component, a presentational component (`StatCardComponent`),
`AvatarComponent`, the `RelativeTimePipe`, and `ApiService` (request shape/URL assertions via
`HttpClientTestingModule`).

## API routes

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
| GET | `/api/dashboard/evaluations` | Recent peer evaluations (`limit`) - corrected student, project, pass/fail flag, mark only; never comments/feedback |
| POST | `/api/dashboard/refresh` | Invalidate + eagerly reload the cache |
| GET | `/api/students` | Paginated/searchable/sortable student list |
| GET | `/api/students/:login` | Student profile + progress detail |
| GET | `/api/projects` | Normalized Common Core project list |
| GET | `/api/projects/:projectId/metrics` | Per-project completion/success metrics |
| GET | `/api/status/42` | 42 API reachability/auth status (never returns tokens) |

## TV mode controls

- Click the TV icon in the header, or press **T**, to enter/exit TV mode.
- TV mode hides normal navigation, goes edge-to-edge, and auto-rotates through 4 dashboard
  section groups every 15 seconds (pauses when the tab is hidden, resumes when visible).
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
| Docker frontend can't reach the backend | Compose network/service name mismatch | Confirm both services are defined in the same `docker-compose.yml` (service name `backend` is hard-coded in `frontend/nginx.conf`) |

## Security notes

- Client ID/Secret: backend environment variables only. Never in Angular code,
  `localStorage`/`sessionStorage`/cookies, committed files, or Docker images.
- The frontend calls only local `/api/*` endpoints — verified by scanning the production
  bundle for secret-shaped strings as part of manual verification.
- Logs (both frontend console and backend `pino` output) never print tokens or secrets; the
  backend logger redacts secret-shaped fields by name.
- `GET /api/config` and `GET /api/status/42` return deliberately narrow, sanitized shapes.

## Limitations

In-memory cache only (no Redis), no persistent historical database, no authentication on the
dashboard itself (by design, for a shared physical display), and a few documented 42 API
field-completeness assumptions. Full details: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## Hackathon deliverables

- [x] Working Angular + Express monorepo, runnable via root npm scripts
- [x] Live 42 API integration via a credential-safe backend-for-frontend
- [x] Always-live 42 API integration - no demo/offline fallback, hardened with in-memory caching, retry/backoff, and stale-data serving on transient outages
- [x] TV mode for 1920×1080 display
- [x] `docs/API_RESEARCH.md`, `docs/ARCHITECTURE.md`, `docs/METRICS.md`,
      `docs/LIMITATIONS.md`, `docs/PITCH.md`
- [x] Docker support (with and without Docker both work)
- [x] Backend + frontend automated tests

## Contributors

- **Muhammad Afzal** — [`mafzal`](https://profile.intra.42.fr/users/mafzal) — 42 Warsaw
