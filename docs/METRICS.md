# Metric Definitions

All formulas below are implemented as pure functions in
`server/src/services/metrics.ts` and `server/src/services/normalize.ts`, and covered by
unit tests in `server/src/__tests__/metrics.test.ts` / `normalize.test.ts`. Every dashboard
number traces back to one of these definitions - there is no metric computed ad hoc inside a
route handler or an Angular component.

## Active student

> A student is **active** in the selected cursus when their `cursus_users` record exists and
> its `end_at` field is `null` (or absent).

```ts
isActiveCursusUser(cursusUser) = cursusUser.end_at == null
```

If a student has no `cursus_users` record at all for the discovered cursus, they are treated
as inactive (`active: false`) rather than throwing.

## Validated completion

> A `projects_users` record counts as a successful/validated completion when its `status` is
> `"finished"` **and** its `validated?` field is `true`.

```ts
isValidatedCompletion(projectUser) =
  projectUser.status === 'finished' && projectUser['validated?'] === true
```

Because `validated?` (with a trailing question mark) is not a legal TypeScript identifier, it
is renamed to a plain `validated: boolean` field the moment a raw record is normalized - no
component or route ever touches the raw `validated?` key.

## Completion date priority

> A completion's effective date is the first non-null value of, in order:
> `marked_at` → `updated_at` → `created_at`.

```ts
resolveCompletionDate(projectUser) =
  projectUser.marked_at ?? projectUser.updated_at ?? projectUser.created_at ?? null
```

A record with **no** usable date (all three null) is dropped during normalization rather than
guessing - it will never appear in `recentCompletions`, the trend chart, or the celebration
carousel, since none of those can be meaningfully time-ordered without a date.

## Current project

> A `projects_users` record represents an **in-progress** project when its `status` is
> `in_progress`, `searching_a_group`, or `creating_group` (i.e. not yet `finished`).

```ts
isCurrentProject(projectUser) =
  ['in_progress', 'searching_a_group', 'creating_group'].includes(projectUser.status)
```

## Average level

> The mean of `level` across **active** students only, rounded to 2 decimal places. Returns
> `0` (never `NaN`) when there are no active students.

```ts
averageLevel(students) =
  activeStudents.length === 0
    ? 0
    : round2(sum(activeStudents.map(s => s.level)) / activeStudents.length)
```

## Success rate (per project)

> Validated completions ÷ all **finished** attempts (validated + failed) for that project,
> expressed as a percentage rounded to 2 decimal places. `0` when there are no finished
> attempts.

```ts
successRate(records) =
  finished.length === 0
    ? 0
    : round2((finished.filter(r => r.validated).length / finished.length) * 100)
```

Note this denominator is **finished attempts**, not "everyone who ever started the project" -
an in-progress attempt does not count against the rate either way until it finishes.

## Average final mark (per project)

> The mean of `final_mark` across finished attempts that have a **non-null** mark. Records
> with `final_mark: null` (which does occur even on finished records) are excluded from both
> the sum and the count, rather than being treated as `0`.

## Completions in the last N days

> Count of **validated** completions whose resolved completion date falls on or after
> `now - N days`.

Used for the dashboard's "Completed (7 days)" / "Completed (30 days)" summary cards, the
completion trend chart, and each project's "Last 7 days" column.

## Completion trend (daily buckets)

> For a requested `days` window ending "today" (server clock, UTC calendar day), one bucket
> per calendar day is created (even days with zero completions), and each validated
> completion is placed into the bucket matching its date's `YYYY-MM-DD` prefix.

## Dashboard summary fields

| Field | Definition |
|---|---|
| `totalStudents` | Count of all students in the discovered campus + cursus dataset |
| `activeStudents` | Count of students where `active === true` (see above) |
| `averageLevel` | See "Average level" above |
| `completionsLast7Days` / `completionsLast30Days` | See "Completions in the last N days" |
| `totalValidatedCompletions` | Count of all validated completions in the current dataset |
| `latestCompletionAt` | The most recent `completedAt` among validated completions, or `null` |
| `cacheStatus` | `fresh` (just loaded), `cached` (served from a still-valid cache entry), or `stale` (cache TTL expired but the 42 API was unreachable, so the last good value is served anyway) |

## Rankings

- **Top students by level**: all students sorted by `level` descending (includes inactive
  students - level is a lifetime stat, not an activity stat).
- **Top students by validated projects**: sorted by `completedProjectCount` descending.
- **Top students by recent completions**: students with at least one validated completion in
  the requested window, sorted by that count descending.
- **Top projects**: sorted by `completionCount` (all finished attempts, not just validated)
  descending, within the requested day window.

Only first names/logins/avatars/levels/counts already visible elsewhere in the 42 Intranet
are shown - no private fields are ever included in a ranking.
