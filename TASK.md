# TASK — Evaluation Analytics, Evaluation Activity Heatmap, and Black Hole Status

## Mission

Extend the existing **42 Warsaw Learning Progress Dashboard** with two production-quality feature areas:

1. **Evaluation Analytics**
   - Evaluation Activity Heatmap
   - Evaluation KPI cards
   - Top Evaluators
   - Most Evaluated Students
   - Top Evaluation Contributors
   - Evaluation Activity Chart
   - Most Evaluated Projects
   - Evaluation Timeline
   - Search, filters, and historical comparison

2. **Black Hole Status**
   - Students approaching their Black Hole date
   - Students who recently reached or passed their Black Hole date
   - Correct cursus selection
   - Correct Warsaw-time date calculations
   - Correct status classification and sorting
   - TV-safe, respectful presentation

Complete the task end to end. Do not stop after planning or partial implementation.

---

# 1. Mandatory Working Rules

- Inspect the existing codebase before modifying anything.
- Reuse the current architecture, naming conventions, visual system, services, models, routes, state management, and test setup.
- Preserve all existing uncommitted work.
- Make focused changes only; do not perform unrelated refactors.
- Do not commit code.
- Do not push code.
- Do not change Git remotes, branches, or repository history.
- Do not run destructive Git commands.
- Do not expose credentials, OAuth tokens, client secrets, passwords, or complete environment-variable values.
- Do not hardcode student data, evaluation data, Black Hole dates, statistics, or API results.
- Do not silently replace live data with mock data.
- Do not invent unavailable 42 API fields.
- Do not display guessed historical comparisons.
- Do not show fake success states when data is unavailable.
- Do not ask for routine approval after every edit or command.
- Ask a question only when a genuinely blocking requirement cannot be resolved from the repository, its documentation, the current API responses, or existing configuration.
- Continue through implementation, testing, runtime validation, and correction until the requested work is complete.
- Do not show me diffs or a long explanation of every source-code change at the end.

---

# 2. Initial Inspection and Baseline Validation

Before editing:

1. Inspect the complete repository structure.
2. Identify:
   - Backend entry point and framework
   - Frontend entry point and framework
   - Existing dashboard route and layout
   - Existing evaluation-related endpoints, services, models, components, or TV-mode views
   - Existing Black Hole fields, counters, sorting, and UI
   - Existing cache and persistence strategy
   - Whether a database already exists
   - Current 42 API client and pagination handling
   - Configured campus ID and cursus ID
   - Existing timezone/date utilities
   - Current tests, lint commands, build commands, and runtime scripts
3. Read all relevant code before deciding where to add the new features.
4. Run the existing supported lint, tests, and builds to establish a baseline.
5. Record existing failures separately from failures introduced by this task.
6. Do not overwrite or discard existing user changes.

---

# 3. General Data Integrity Requirements

All displayed data must come from verified 42 API responses or persisted historical snapshots created from verified API responses.

For every field:

- Confirm the real API field and its meaning.
- Handle pagination.
- Deduplicate records.
- Validate timestamps.
- Handle null, missing, and malformed values.
- Avoid unsafe assumptions about array order.
- Keep backend responses frontend-ready.
- Cache expensive processed results using the project’s existing cache approach.
- Keep refresh behavior predictable.
- Avoid excessive 42 API calls.
- Never expose server credentials to the frontend.

When a required metric cannot be calculated reliably, show a clear unavailable state such as:

```text
Historical data is not available yet.
```

Do not manufacture percentages, trends, averages, dates, names, scores, or rankings.

Use:

```text
Europe/Warsaw
```

for campus-facing time calculations and labels unless an existing project-wide timezone utility already provides the same behavior.

---

# 4. Feature Area A — Evaluation Analytics

## 4.1 Objective

Create an **Evaluation Analytics** section that helps students and staff understand:

- When evaluations are most active
- Which days and hours are busiest
- When it is easiest to find evaluators
- Which periods are quiet
- Who contributes most as an evaluator
- Which students receive the most evaluations
- Which projects are evaluated most often
- How activity changes over time
- What the latest completed evaluations are

The design must match the existing dashboard and work on both desktop and a large 1920×1080 TV.

---

## 4.2 Backend Evaluation Data

Use completed evaluation records from the 42 API.

Inspect the existing API client and verify the available fields for:

- Evaluation ID
- Completion timestamp
- Evaluator/corrector
- Evaluated student
- Project
- Score or final mark, only when reliably available
- Coalition, only when reliably available
- Student level, only when reliably available
- Evaluation type, only when reliably available
- Campus/cluster, only when reliably available

Do not guess field names or meanings.

Implement or extend backend processing to:

- Retrieve completed evaluation records
- Normalize evaluation records
- Deduplicate records by a stable evaluation identifier
- Group by evaluator
- Group by evaluated student
- Group by project
- Group by day of week
- Group by hour of day
- Aggregate hourly, daily, weekly, and monthly series
- Calculate summary KPIs
- Calculate current-period versus previous-period comparisons
- Cache processed results
- Return frontend-ready JSON
- Apply filters consistently

If the 42 API does not expose enough historical data directly:

- Persist verified snapshots or normalized evaluation records going forward.
- Use the project’s existing database when present.
- When no database exists, add the smallest maintainable persistence solution that fits the current architecture.
- Do not pretend that earlier historical data exists.
- Display the unavailable-state message until enough historical data has been collected.

---

## 4.3 Evaluation Filters

Support these filters where reliable data exists:

### Date range

- Today
- Yesterday
- Last 7 Days
- Last Week
- This Month
- Custom Range

### Additional filters

- Student
- Evaluator
- Project
- Coalition
- Cluster, if supported by verified data
- Evaluation type, if supported by verified data

Support search by:

- Student login
- Evaluator login
- Project name

Use one consistent filter state for KPI cards, charts, heatmap, leaderboards, project rankings, timeline, and insights.

---

## 4.4 Evaluation Summary Cards

Display compact KPI cards for:

- Evaluations Today
- Evaluations This Week
- Active Evaluators
- Students Evaluated
- Most Evaluated Project
- Average Evaluations per Day

Where comparison data exists, show comparison with the equivalent previous period.

Example:

```text
Evaluations This Week
247
▲ 12% compared with last week
```

When comparison data does not exist:

```text
Historical data is not available yet.
```

Do not show a fake zero-percent change.

---

## 4.5 Top Evaluators

Create a leaderboard of students who completed the most evaluations during the selected period.

Display:

- Rank
- Profile picture
- Login
- Coalition, when available
- Current level, when available
- Number of evaluations completed
- Number of different students evaluated
- Number of different projects evaluated
- Last evaluation time

Use deterministic sorting:

1. Evaluation count descending
2. Most recent evaluation descending
3. Login alphabetically

Use a neutral placeholder or initials when a profile image is unavailable.

---

## 4.6 Most Evaluated Students

Create a second leaderboard for students who received the most evaluations.

Display:

- Rank
- Profile picture
- Login
- Coalition, when available
- Current level, when available
- Evaluations received
- Different projects evaluated
- Last evaluation time

Use deterministic sorting:

1. Evaluations received descending
2. Most recent evaluation descending
3. Login alphabetically

---

## 4.7 Top Evaluation Contributors

Add a contributor ranking that recognizes sustained community contribution rather than only raw volume.

Calculate an explainable score using verified metrics such as:

- Evaluations completed
- Different students evaluated
- Different projects evaluated
- Consistency across different days of the selected period

Requirements:

- Keep the formula simple and documented in code.
- Do not use hidden or arbitrary personal-quality judgments.
- Return each score component to the frontend.
- Clearly label this as a contribution/activity score, not as an official 42 ranking.
- Do not calculate the score when required inputs are unavailable.

---

## 4.8 Evaluation Activity Chart

Add a time-series visualization with selectable granularity:

- Hourly
- Daily
- Weekly
- Monthly

The chart must:

- Use the active filters
- Use Warsaw-local labels
- Handle empty periods
- Avoid misleading interpolation
- Animate transitions without harming performance
- Remain readable on desktop and TV
- Include an accessible text summary

---

## 4.9 Most Evaluated Projects

Display a ranked project list.

Each project item should show:

- Project name
- Total evaluations
- Unique students evaluated
- Average mark, only if the data is reliably available
- Trend versus the equivalent previous period, only when historical data exists

Use deterministic sorting:

1. Total evaluations descending
2. Unique students descending
3. Project name alphabetically

---

## 4.10 Evaluation Timeline

Create a recent-activity feed showing the latest completed evaluations.

Each item may show, when verified and publicly appropriate:

- Completion time
- Evaluator login
- Evaluated student login
- Project name
- Score/final mark, only when available

Requirements:

- Refresh automatically every few minutes using the existing refresh architecture.
- Avoid reloading the whole page.
- Prevent duplicate timeline entries.
- Use respectful wording.
- Handle missing profile images and fields.
- Do not show private or unavailable information.

---

# 5. Evaluation Activity Heatmap

## 5.1 Layout

Create a GitHub-style matrix.

Rows:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

Columns:

```text
00 01 02 ... 22 23
```

Each cell represents:

```text
Completed evaluations during that weekday and hour
```

The heatmap must use the selected date range and other active filters.

---

## 5.2 Heatmap Aggregation

The backend must return a complete 7×24 structure, including zero-value cells.

For every cell, return enough verified information for the UI:

- Day index and day label
- Hour
- Evaluation count
- Average count for that weekday/hour across the selected period, when meaningful
- Most evaluated project, when available
- Most active evaluator, when available

Use Warsaw-local time when mapping timestamps into day and hour.

Do not group timestamps in UTC and label them as Warsaw time.

---

## 5.3 Heatmap Color Scale

Use a smooth, high-contrast activity scale from very low to very high.

Requirements:

- Scale intensity according to the selected dataset.
- Keep zero activity visually distinct.
- Avoid a scale where one outlier makes all other cells indistinguishable.
- Prefer percentile, quantile, or another robust normalization if appropriate.
- Include a visible legend.
- Ensure sufficient contrast for TV viewing.
- Do not rely on color alone; include count labels, accessible text, or intensity classes where practical.

---

## 5.4 Heatmap Tooltip

On hover or keyboard focus, show:

- Day
- Time range, such as `14:00–15:00`
- Completed evaluations
- Average during this weekday/hour, when available
- Most evaluated project, when available
- Most active evaluator, when available

The heatmap must remain understandable without hover because it will be displayed on a TV.

---

## 5.5 Heatmap Summary Cards

Display:

- Peak Evaluation Hour
- Busiest Day
- Quietest Day
- Average Daily Evaluations

All values must be calculated from the filtered dataset.

Clearly distinguish:

- No activity
- No data
- Historical data unavailable

---

## 5.6 Dynamic Insights Panel

Generate simple, deterministic insights from the currently displayed data.

Examples:

- Busiest weekday
- Quietest weekday
- Peak time window
- Quiet late-hour period
- Change compared with the previous equivalent period

Do not use a language model or invented prose for calculations.

Only display an insight when the underlying data supports it.

---

## 5.7 Suggested Evaluation Endpoint

Use the existing route conventions. A possible shape is:

```http
GET /api/evaluations/analytics
```

Possible query parameters:

```text
range=today|yesterday|last7Days|lastWeek|thisMonth|custom
from=YYYY-MM-DD
to=YYYY-MM-DD
projectId=
coalitionId=
studentLogin=
evaluatorLogin=
clusterId=
evaluationType=
granularity=hourly|daily|weekly|monthly
```

A suitable response should include:

- Generated timestamp
- Timezone
- Applied filters
- Summary KPIs
- Heatmap data
- Activity series
- Top evaluators
- Most evaluated students
- Top contributors
- Most evaluated projects
- Recent timeline
- Dynamic insights
- Historical availability metadata

Adapt this shape to the project’s current API style rather than forcing an incompatible structure.

---

# 6. Feature Area B — Black Hole Status

## 6.1 Objective

Rebuild the current Black Hole feature so it accurately answers:

- Which students are closest to their Black Hole date?
- How many days remain?
- Which students recently reached or passed the date?
- How many students are at immediate risk?
- Is the date based on the correct cursus record?

Do not estimate or infer a Black Hole date from unrelated fields.

---

## 6.2 Correct Cursus Selection

Use the configured core cursus ID.

The common value is:

```text
42cursus = 21
```

Do not hardcode `21` in multiple places. Use the project’s configuration or introduce one validated configuration value.

Select the correct `cursus_user` record by:

1. Matching `cursus.id` with the configured cursus ID.
2. Keeping only records with a valid `blackholed_at`.
3. Preferring an active record when available.
4. Otherwise selecting the most recently updated valid matching record.
5. Using a deterministic tie-breaker.

Never use:

```javascript
user.cursus_users[0]
```

Do not use:

- `end_at`
- `updated_at`
- `created_at`
- Last login
- Last project date
- Any estimated date
- A record from another cursus

When the correct record cannot be found, exclude it from the risk leaderboard and record the exclusion reason.

---

## 6.3 Black Hole Date Calculation

Use:

```text
Europe/Warsaw
```

Calculate:

```text
millisecondsRemaining = blackholedAt - currentWarsawTime
daysRemaining = ceil(millisecondsRemaining / oneDay)
```

Do not use an absolute value.

A past date must remain negative.

Return the exact Black Hole timestamp together with the calculated value.

Use one shared, tested date helper so the backend, frontend labels, sorting, and tests follow the same rule.

Account for:

- Warsaw-local display
- Midnight boundaries
- Daylight-saving-time changes
- Invalid dates
- Missing dates

Never display:

```text
Invalid Date
NaN days
undefined
```

---

## 6.4 Black Hole Status Categories

Assign exactly one status:

- `critical`: 0–3 days remaining
- `urgent`: 4–7 days remaining
- `warning`: 8–14 days remaining
- `upcoming`: 15–30 days remaining
- `safe`: more than 30 days remaining
- `recentlyBlackHoled`: date passed within the selected recent window, default 30 days
- `historical`: date passed more than the selected recent window

Safe and historical students should not appear in the main TV lists by default.

---

## 6.5 Closest to Black Hole

Create a panel titled:

```text
Closest to Black Hole
```

Include only:

```text
daysRemaining >= 0
```

Default window:

```text
Next 30 days
```

Sort by:

1. `daysRemaining` ascending
2. Black Hole timestamp ascending
3. Login alphabetically

Display:

- Urgency rank
- Profile photo or neutral fallback
- Login
- Coalition, when available
- Current cursus level
- Exact Black Hole date
- Days remaining
- Status badge
- Last campus activity, only when useful and verified
- Current online status, only when verified

Default TV display:

- Top 5 students
- Allow 5–10 in the normal desktop view

---

## 6.6 Recently Black Holed

Create a separate panel titled:

```text
Recently Black Holed
```

Include only students whose Black Hole date passed within the selected recent window.

Default:

```text
Previous 30 days
```

Calculate:

```text
daysSinceBlackHole = floor((now - blackholedAt) / oneDay)
```

Sort by:

1. `daysSinceBlackHole` ascending
2. Black Hole timestamp descending
3. Login alphabetically

Display:

- Profile photo or fallback
- Login
- Coalition, when available
- Latest valid cursus level
- Exact Black Hole date
- Human-readable relative label such as `3 days ago`
- Current student status, only when reliably available

Do not mix upcoming and already-passed students into one list.

---

## 6.7 Black Hole Summary Cards

Display compact KPIs:

- Critical students
- Urgent students
- At risk within 14 days
- Upcoming within 30 days
- Recently Black Holed
- Closest Black Hole date

For TV mode, prioritize four high-value metrics and keep the remaining metrics available in the normal view.

---

## 6.8 Black Hole Filters

Support:

### Upcoming window

- Next 7 days
- Next 14 days
- Next 30 days
- Next 60 days
- Custom range

### Recent window

- Previous 7 days
- Previous 14 days
- Previous 30 days
- Previous 60 days

### Additional filters

- Coalition
- Cursus
- Student login
- Level range
- Status
- Currently online
- Active students only

Default to the configured core cursus rather than combining all cursus records.

---

## 6.9 Black Hole Inclusion and Exclusion Rules

Include only records where:

- Student belongs to the selected campus.
- A valid selected-cursus record exists.
- `blackholed_at` exists.
- `blackholed_at` parses successfully.
- The record is not a duplicate.
- Staff are excluded unless explicitly enabled.
- Alumni are excluded from the default operational view unless the current project requirements say otherwise.
- Anonymized users are handled according to approved display rules.

For exclusions, retain diagnostics such as:

- Missing Black Hole date
- Invalid date
- Wrong cursus
- Duplicate user
- Staff exclusion
- Alumni exclusion
- Missing active/valid cursus record

Do not expose sensitive diagnostics publicly on the TV.

---

## 6.10 Suggested Black Hole Endpoint

Use the current backend routing style. A possible route is:

```http
GET /api/blackhole/status
```

Possible query:

```http
GET /api/blackhole/status?cursusId=21&upcomingDays=30&recentDays=30
```

A suitable response should include:

- Generated timestamp
- Timezone
- Cursus ID
- Applied filters
- Summary
- Upcoming students
- Recently Black Holed students
- Excluded-record diagnostics

Adapt the exact contract to the project’s established conventions.

---

# 7. Privacy and Community Safety

Black Hole information may be sensitive.

Requirements:

- Use respectful labels.
- Prefer:
  - `Approaching Black Hole`
  - `Needs Attention`
  - `Recently Reached Black Hole`
- Avoid:
  - `Failed students`
  - `Worst students`
  - `Eliminated students`
- Display only information appropriate for a public campus TV.
- Preserve any existing anonymization or privacy configuration.
- If the repository has no clear policy for showing identities, keep the implementation technically ready for anonymized TV mode.
- Do not introduce humiliating animations, rankings, or language.

---

# 8. Frontend and Visualization Requirements

Integrate the new features into the current dashboard without breaking existing sections.

Requirements:

- Match the existing dashboard’s typography, spacing, cards, borders, colors, motion, and component patterns.
- Reuse existing shared components where suitable.
- Keep the normal dashboard understandable and not overcrowded.
- Use responsive layout for desktop and 1920×1080 TV.
- Use large labels and high contrast in TV mode.
- Avoid dense tables in TV mode.
- Do not depend on hover for essential information.
- Use profile-image fallbacks.
- Add loading, empty, error, and unavailable states.
- Ensure keyboard focus and accessible labels for interactive filters and heatmap cells.
- Prevent layout shift during refresh.
- Use restrained animation.
- Do not create an animation or observer loop that can freeze the browser.
- Clean up timers, subscriptions, observers, and event listeners when components are destroyed.
- Refresh evaluation activity every few minutes using the existing refresh system.
- Refresh Black Hole data approximately every 30–60 minutes; second-by-second refresh is unnecessary.
- Keep manual refresh functional.
- Ensure filter changes update all related visualizations consistently.

Choose the most suitable integration after inspecting the current application:

- Existing dashboard section
- New dashboard tab
- New route
- TV-mode rotation section

Do not add duplicate navigation or a parallel design system.

---

# 9. Error and Empty-State Requirements

Use clear states:

```text
No evaluation activity was found for the selected period.
```

```text
Historical data is not available yet.
```

```text
Black Hole date unavailable.
```

```text
No students are approaching their Black Hole date in this period.
```

```text
No students recently reached their Black Hole date.
```

Requirements:

- Never show stale data as newly refreshed.
- Preserve the last successful data only when the current project already follows that pattern and clearly labels it.
- Show retry controls where appropriate.
- Log backend errors without leaking secrets.
- Return suitable HTTP status codes.
- Validate query parameters.
- Reject invalid custom date ranges.
- Avoid unhandled promise rejections and frontend runtime exceptions.

---

# 10. Automated Test Requirements

Add or update tests using the existing frameworks.

## 10.1 Evaluation tests

Cover:

- Evaluation normalization
- Deduplication
- Evaluator grouping
- Evaluated-student grouping
- Project grouping
- 7×24 heatmap completion
- Warsaw-local weekday/hour mapping
- Zero-activity cells
- Dynamic scale boundaries
- Current-period and previous-period comparison
- Historical data unavailable
- Filter combinations
- Empty data
- Missing optional fields
- Stable ranking tie-breakers
- Contributor score components
- Timeline deduplication
- Pagination behavior where practical

## 10.2 Black Hole tests

Cover:

- Date today
- One day remaining
- Three days remaining
- Four days remaining
- Seven days remaining
- Eight days remaining
- Fourteen days remaining
- Fifteen days remaining
- Thirty days remaining
- More than thirty days
- Date passed yesterday
- Date passed exactly 30 days ago
- Historical date
- Session near midnight
- Warsaw daylight-saving-time transition
- Missing `blackholed_at`
- Invalid `blackholed_at`
- Multiple cursus records
- Active matching cursus selection
- Most-recent valid fallback selection
- Wrong cursus exclusion
- Duplicate users
- Upcoming sorting
- Recent sorting
- Stable tie-breakers
- Staff/alumni exclusion where implemented

Do not weaken or delete existing tests merely to obtain a passing result.

---

# 11. Runtime Validation

After implementation:

1. Run backend lint.
2. Run backend tests.
3. Run backend production build.
4. Run frontend lint.
5. Run frontend tests.
6. Run frontend production build.
7. Start the backend if it is not already running.
8. Start the frontend.
9. Open the application in a browser-testing environment.
10. Verify the existing dashboard still loads.
11. Verify Evaluation Analytics loads with live data.
12. Verify the heatmap displays all 7 days and 24 hours.
13. Verify heatmap cells and legend remain readable at 1920×1080.
14. Verify filters update all evaluation visualizations.
15. Verify historical-unavailable behavior using a period without stored history.
16. Verify the evaluation timeline refreshes without duplicates.
17. Verify Black Hole upcoming and recent lists remain separate.
18. Verify upcoming ordering is correct.
19. Verify recent ordering is correct.
20. Verify exact dates and relative-day labels.
21. Verify profile-image fallbacks.
22. Verify loading, empty, error, and unavailable states.
23. Verify manual refresh.
24. Verify automatic refresh does not freeze the browser.
25. Verify navigation away from and back to the dashboard.
26. Verify TV mode, when present.
27. Verify browser responsiveness after animations and refresh cycles.
28. Check browser console for uncaught exceptions.
29. Check network requests for 4xx, 5xx, CORS, or asset failures.
30. Fix confirmed issues and rerun the relevant validation.

Do not declare completion merely because compilation succeeds. Confirm that the visualizations actually render and remain responsive.

---

# 12. Completion Criteria

The task is complete only when:

- Evaluation Analytics uses verified live or persisted data.
- The heatmap correctly represents weekday/hour activity in Warsaw time.
- KPI cards, leaderboards, chart, project ranking, timeline, and insights work.
- Historical comparisons never use invented data.
- Black Hole data comes from the correct configured cursus record.
- Black Hole date calculations are consistent and tested.
- Upcoming and recent lists are separate and correctly sorted.
- TV and desktop layouts are readable.
- Existing dashboard functionality still works.
- Lint, tests, and builds pass, except for clearly identified pre-existing non-blocking warnings.
- No blocking console or network errors remain.
- No browser freeze or infinite observer/timer loop exists.
- No commits or pushes were made.

---

# 13. Final Response Format

When everything is finished, respond only with:

```text
TASK COMPLETED

Evaluation Analytics:
- Status:
- Heatmap:
- KPI cards:
- Leaderboards:
- Activity chart:
- Project ranking:
- Timeline:
- Filters:
- Historical comparison:

Black Hole Status:
- Status:
- Cursus selection:
- Date calculations:
- Upcoming list:
- Recently Black Holed list:
- Summary cards:
- Filters:

Validation:
- Backend lint/tests/build:
- Frontend lint/tests/build:
- Browser runtime:
- TV layout:
- Console/network:
- Existing dashboard regression check:

Remaining confirmed issues:
- None
```

When an issue remains, replace `None` with only the confirmed issue and its impact.

Do not include a Git diff.
Do not include a commit.
Do not push any code.
