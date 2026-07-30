# Pitch — 42 Warsaw Insight

**Target length: 5 minutes.** A 30-second fallback pitch is at the bottom in case the 42 API
is briefly unreachable during the live demo.

## 1. The problem (30s)

Students in the Warsaw Social Space can't easily see how the community is progressing
through the Common Core, or celebrate each other's wins in the moment. That information
exists in the 42 Intranet, but it's buried behind individual profile pages - nobody's
opening 25 browser tabs to see who just validated a project.

## 2. The solution (45s)

A dashboard built to run on the TV in the Social Space: community-wide stats, a rotating
celebration of recently completed projects, completion trends, and a searchable student
directory - all sourced live from the official 42 API, refreshing automatically.

## 3. Live demonstration flow (90s)

1. Land on `/dashboard` - point out the summary cards (active students, average level,
   completions this week) and the 42 API reachability indicator.
2. Let the celebration carousel rotate - "this is what a student sees seconds after they
   validate a project."
3. Switch the completion-trend period (7d → 30d) to show it's real aggregation, not a static
   image.
4. Jump to `/students`, search a login, open a student's profile page.
5. Hit the manual refresh button, then press **T** to show TV mode - full-screen, nav
   hidden, clock in the corner, auto-rotating every 15s through five cinematic modes built
   specifically for the big screen: **the Hive** (floating avatar nodes for everyone
   currently on campus, glowing brighter the longer they've been logged in), the **Level-Up
   Spotlight** (a scrolling feed of recent completions), the **XP Race / Black Hole watch**
   (an animated weekly-XP bar race next to a pulsing danger-zone tracker for students with an
   upcoming black hole date), the **Coalition Leaderboard**, and **Live Evaluations** (recent
   scale_team defenses - corrected student, project, pass/fail, mark; peer-review comments
   are deliberately never fetched or shown, see `docs/LIMITATIONS.md`).
6. If the timing lines up, call out the full-screen "Achievement Unlocked" takeover - it
   fires automatically over whichever mode is on screen the moment a completion scores
   100+, then hands control back to the rotation a few seconds later.
7. Press **Escape** / click again to leave TV mode.

## 4. Technical architecture (60s)

- Angular 22 (standalone components, signals, zoneless change detection) talking only to a
  same-origin `/api/*` backend-for-frontend.
- Express + TypeScript backend owns **all** communication with the 42 API: OAuth Client
  Credentials token management, campus/cursus discovery by name, paginated bulk data
  fetching, and an in-memory TTL cache with stale-data fallback.
- Point at the Mermaid diagram in `docs/ARCHITECTURE.md` if presenting with a screen that can
  render it.

## 5. Security approach (45s)

- The 42 Client ID/Secret live **only** as backend environment variables - never in Angular
  code, `localStorage`, cookies, Docker images, or logs (the logger redacts secret-shaped
  fields by name at any nesting depth).
- The browser never talks to `api.intra.42.fr` directly and never holds a token - there's
  nothing in the frontend bundle to steal.
- Everything the API returns is read-only; no write scopes are requested.

## 6. Metrics and student value (45s)

- Every number is a documented, unit-tested pure function (`docs/METRICS.md`) - "average
  level," "success rate," "active student" all have one definition used everywhere, not
  three slightly-different ad hoc calculations.
- The goal is visibility and encouragement, not ranking anxiety: rankings show public,
  already-visible stats (level, validated project count), nothing private.

## 7. Current limitations (30s)

Built as a hackathon proof of concept: in-memory cache (not Redis), no historical database
(so trend charts reflect the 42 API's current state, not a point-in-time snapshot), and no
authentication on the dashboard itself (appropriate for a shared physical display, not for
open internet exposure). Full list in `docs/LIMITATIONS.md`.

## 8. Production roadmap (20s)

Redis for shared caching across replicas, a real database for historical trends beyond what
live aggregation can show, scheduled background refresh instead of on-demand, and structured
observability (cache hit rate, 42 API error rate, staleness alerts).

## 9. Closing statement (15s)

This is the dashboard we wished existed the first time we validated `Libft` at 2am and nobody
in the Social Space knew. Built by Muhammad Afzal for the 42 Warsaw Hacks hackathon.

---

## 30-second fallback pitch (if the live API/demo fails)

"42 Warsaw Insight is a TV dashboard for the Social Space that shows
Common Core progress, celebrates recent project completions, and lets students look each
other up - all from the official 42 API, through a backend that keeps our API credentials
completely out of the browser. It runs entirely on live data - if the 42 API has a brief
hiccup mid-demo, the dashboard keeps showing the last successfully fetched numbers with a
visible 'Stale data' badge rather than going blank, and picks back up automatically once the
API is reachable again."
