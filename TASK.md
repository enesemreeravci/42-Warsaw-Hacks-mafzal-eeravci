
Please execute a comprehensive update across both our **TV Module** and our main **Dashboard**, following the exact requirements, feature additions, layout updates, and UI/UX bug fixes outlined below.


Please Take all the data from  API End Point Not Hard coded


# Feature: Weekly Top Coalition Contributors

Add a new feature called **Weekly Top Coalition Contributors** to the existing dashboard.

The purpose of this feature is to accurately identify and display the students who contributed the most coalition points during a selected period. The leaderboard must be based on **real contribution data** or **historical snapshots**, not on current coalition totals or current user scores.

The ranking should be trustworthy, transparent, and updated automatically.

---

## Objective

This feature should answer questions such as:

* Who contributed the most coalition points this week?
* Which students helped their coalition the most?
* Which coalition gained the most points because of its members?
* How have contributor rankings changed compared to last week?

The displayed data must always represent **points earned during the selected period**, not lifetime totals.

---

# Leaderboard

Display a ranked leaderboard.

Each contributor card should contain:

* Rank
* Profile picture
* Student login
* Coalition logo and name
* Current level
* Coalition points earned during the selected period
* Current leaderboard position
* Position change from previous week
* Last contribution date (if available)

Example:

```text
🏆 Weekly Coalition Contributors

#1
👤 eeravci
🛡 Freax
⭐ Level 9.42

+245 Coalition Points

↑ Moved up 2 places
```

---

# Summary Cards

Display KPI cards above the leaderboard.

Examples:

```text
Top Contributor

eeravci

245 pts
```

```text
Most Active Coalition

Freax

+1,820 pts
```

```text
Total Coalition Points Earned

4,932 pts
```

```text
Active Contributors

86 Students
```

---

# Filters

Support:

* Today
* Last 7 Days
* Last Week
* This Month
* Custom Date Range

Additional filters:

* Coalition
* Student
* Level
* Cursus

---

# Ranking Rules

The ranking **must never** use:

* Current coalition score
* Current user score
* Lifetime contribution
* Total coalition points

Instead, calculate:

```text
Points Earned During Selected Period
```

For example:

```text
Current Score:
1,540

Score 7 Days Ago:
1,295

Weekly Contribution:

245 Points
```

Sort the leaderboard by:

```text
Highest Weekly Contribution
```

---

# Historical Calculation

The backend should calculate contributions using historical snapshots.

Formula:

```text
Weekly Contribution

=

Current Points

-

Points Recorded Seven Days Ago
```

The same logic should work for:

* Daily
* Weekly
* Monthly
* Custom Date Range

---

# Important Data Validation

The leaderboard **must always verify**:

✔ Student belongs to the selected campus

✔ Student belongs to the selected coalition

✔ Contribution falls inside the selected period

✔ Duplicate records are ignored

✔ Historical snapshots exist

✔ No negative contribution values unless explicitly supported by the API

---

# Position Changes

Display ranking movement compared to the previous period.

Example:

```text
↑ +3

Moved up three positions
```

```text
↓ -2

Dropped two positions
```

```text
—

No Change
```

---

# Profile Card

Clicking a contributor should open a detailed panel.

Display:

* Profile picture
* Login
* Coalition
* Current level
* Weekly contribution
* Monthly contribution
* Total contribution (if available)
* Ranking history
* Contribution trend
* Last activity

---

# Trend Visualization

Display a small sparkline beside each contributor showing contribution history.

Example:

```text
Week

██▇▆█▇█
```

The graph should visualize contribution growth over recent weeks.

---

# Coalition Comparison

Display which coalition gained the most points during the selected period.

Example:

```text
Freax

+1,820 pts

██████████
```

```text
Alliance

+1,640 pts

████████
```

This should be based on **sum of member contributions**, not current coalition totals.

---

# Backend Requirements

The backend should:

* Retrieve coalition and user data from the 42 API.
* Store periodic snapshots of coalition points (or individual contribution values if the API provides them).
* Calculate the difference between snapshots for the selected period.
* Aggregate points by student.
* Sort contributors by points earned.
* Cache processed results.
* Return frontend-ready JSON.

---

# Data Accuracy Requirements

This feature **must not estimate or guess** weekly contributions.

If the API does **not** expose individual coalition contribution history, the application must rely on historical snapshots stored by the backend.

If historical snapshots are missing, display:

```text
Weekly contribution data is not available yet.

Historical snapshots are required before contributor rankings can be calculated accurately.
```

Do **not** fabricate rankings using current totals.

---

# Suggested API Response

```json
{
  "period": "last-week",
  "generatedAt": "2026-08-01T12:00:00Z",
  "contributors": [
    {
      "rank": 1,
      "login": "eeravci",
      "image": "profile.jpg",
      "coalition": "Freax",
      "level": 9.42,
      "pointsEarned": 245,
      "previousRank": 3,
      "rankChange": "+2",
      "lastContribution": "2026-07-31T18:24:00Z"
    }
  ]
}
```

---

# TV Optimization

The leaderboard should be designed for continuous display in the Social Space.

* Show the **Top 10 contributors** with large profile pictures.
* Display coalition colors and logos for quick recognition.
* Highlight the Top 3 with gold, silver, and bronze accents.
* Smoothly animate changes in ranking without refreshing the entire page.
* Auto-refresh periodically while preserving stable animations.

---

# Expected Result

The **Weekly Top Coalition Contributors** feature should become the official community leaderboard for coalition activity, accurately recognizing students who actively contributed during the selected period. Rankings must always be based on verified historical data and should never be derived from current totals alone, ensuring fairness, transparency, and trust in the displayed results.


# Feature: Evaluation Activity Heatmap

Add a new visualization called **Evaluation Activity Heatmap** to the existing dashboard.

The purpose of this feature is to help students understand **when evaluations are most likely to happen**, allowing them to choose the best time to request an evaluation or find available evaluators.

This feature should visualize evaluation activity using historical data collected from the 42 API.

---

## Objective

Create a GitHub-style heatmap that displays evaluation activity across different days and hours.

The visualization should immediately answer questions such as:

* What are the busiest hours for evaluations?
* Which day of the week has the most evaluations?
* When is the best time to find an evaluator?
* Which periods are usually quiet?
* How has evaluation activity changed compared to previous weeks?

The heatmap should prioritize readability over complexity and be suitable for both desktop and large TV displays.

---

## Heatmap Layout

The heatmap should be displayed as a matrix.

### Rows

Days of the week:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

### Columns

Hours of the day:

```text
00 01 02 ... 22 23
```

Each cell represents one hour of one day.

Example:

```text
            08 09 10 11 12 13 14 15 16 17 18

Monday      ░ ▒ ▓ █ █ █ ▓ ▒ ░ ░ ░
Tuesday     ░ ░ ▒ ▓ █ █ █ ▓ ▒ ░ ░
Wednesday   ░ ▒ ▓ █ █ █ █ █ ▓ ▒ ░
Thursday    ░ ░ ▒ ▓ █ █ ▓ ▒ ░ ░ ░
Friday      ░ ▒ ▓ █ █ █ █ ▓ ▒ ░ ░
Saturday    ░ ░ ▒ ▒ ▓ ▓ ▒ ░ ░ ░ ░
Sunday      ░ ░ ░ ▒ ▒ ▒ ░ ░ ░ ░ ░
```

---

## Color Scale

Use a smooth color gradient.

Example:

```text
Very Low Activity

⬜

↓

🟩

↓

🟨

↓

🟧

↓

🟥

Very High Activity
```

The color intensity should represent:

```text
Number of completed evaluations during that hour
```

The scale should automatically adjust based on the selected date range so that both quiet and busy weeks remain easy to interpret.

---

## Hover Information

When hovering over a cell, display:

```text
Wednesday

14:00 – 15:00

Completed Evaluations

18

Average During This Hour

15

Most Evaluated Project

CPP09

Most Active Evaluator

eeravci
```

---

## Filters

Support the following filters:

Date Range

* Today
* Yesterday
* Last 7 Days
* Last Week
* This Month
* Custom Range

Project

* All Projects
* Selected Project

Coalition

* All Coalitions
* Selected Coalition

Cluster (if relevant)

Evaluation Type (if available)

---

## Summary Cards

Display small KPI cards above the heatmap.

Example:

```text
Peak Evaluation Hour

Wednesday

14:00–15:00

43 Evaluations
```

```text
Busiest Day

Wednesday

182 Evaluations
```

```text
Quietest Day

Sunday

24 Evaluations
```

```text
Average Daily Evaluations

117
```

---

## Insights Panel

Generate simple insights beside the heatmap.

Examples:

* Wednesday afternoons consistently have the highest evaluation activity.
* Sundays have the lowest evaluation volume.
* Evaluation requests peak between 13:00 and 16:00.
* The busiest evaluation window is Wednesday from 14:00 to 15:00.
* The quietest period is after 22:00.

These insights should be calculated dynamically from the displayed data.

---

## Technical Requirements

The backend should:

* Retrieve completed evaluation records from the 42 API.
* Store historical evaluation data in the database.
* Group evaluations by:

  * Day of the week
  * Hour of the day
* Count completed evaluations for each time slot.
* Return aggregated heatmap data to the frontend.

Example response:

```json
{
  "Monday": {
    "08": 3,
    "09": 7,
    "10": 15,
    "11": 21,
    "12": 24
  },
  "Tuesday": {
    "08": 2,
    "09": 6,
    "10": 12
  }
}
```

---

## Frontend Responsibilities

The frontend should:

* Render the heatmap dynamically.
* Apply the color scale based on activity.
* Display detailed tooltips on hover.
* Animate transitions when filters change.
* Automatically refresh when new historical data is available.
* Match the existing dashboard's visual style.

---

## TV Optimization

Since the dashboard is displayed on a large TV in the Social Space:

* Use large labels and high-contrast colors.
* Ensure each cell is visible from several meters away.
* Keep hover interactions optional; the heatmap should remain informative without interaction.
* Include a visible legend explaining the color scale.

---

## Expected Outcome

At a glance, students should be able to identify:

* The busiest days for evaluations.
* The busiest hours to find evaluators.
* The quietest periods.
* Weekly evaluation patterns.

This feature transforms raw evaluation records into actionable scheduling information, helping students choose the best time to request peer evaluations while giving staff insight into campus evaluation activity.


nteractive Cluster Occupancy Map

Design a clean, modern, real-time visualization of all computer clusters inside the 42 Warsaw campus.

The purpose of this view is to let students instantly understand:

Which clusters are currently occupied
Which computers are available
Which seats are the most popular
Which cluster has the highest occupancy
Which computers have been used the longest

The design should prioritize readability from a large TV screen while remaining responsive for desktop browsers.

Overall Layout

Represent every cluster as an individual card.

Example:

┌──────────── Cluster C1 ────────────┐
■ ■ □ □ ■ ■ □ □
■ ■ ■ □ □ □ ■ □

Occupancy: 68%
Online: 14 / 20
Average Session: 2h 41m
────────────────────────────────────

Display every cluster on the dashboard in a grid.

Example:

Cluster C1      Cluster C2      Cluster C3

Cluster C4      Cluster C5      Cluster C6

The layout should automatically adapt to the number of clusters returned by the API.

Computer Representation

Each workstation should be represented by a small square.

Example:

■ ■ ■ □ □ ■ ■
■ □ □ ■ ■ □ □

Each square corresponds to one workstation.

Do not display computer names unless the user hovers over a workstation.

Seat Colors

Green

Currently occupied

Gray

Available

Yellow

Occupied for a long time

Blue

Recently occupied

Red

Offline or unavailable

The color palette should remain subtle and readable on a dark background.

Hover Information

When hovering over an occupied workstation display:

Computer name

Student login

Current project

Coalition

Current level

Session duration

Login time

Example:

Computer
c3r12s4

Student
eeravci

Project
CPP09

Session
3h 17m

Coalition
Freax
Cluster Summary

Each cluster card should also display:

Cluster name

Current occupancy percentage

Occupied seats

Available seats

Longest session

Most used computer

Average session duration

Example:

Cluster C3

18 / 24 occupied

Occupancy
75%

Average Session
2h 43m

Longest Session
8h 19m

Most Used Computer
c3r12s4
Historical Heatmap Mode

Allow switching between:

Live View

Historical View

Historical view should visualize seat popularity.

Instead of showing who is online, show how heavily each workstation has been used during a selected period.

Example:

Last Week

The more frequently a workstation was occupied, the brighter the square becomes.

Intensity represents:

Total occupied duration

or

Number of sessions

depending on the selected metric.

Filters

Provide filters above the visualization.

Date Range

Today

Yesterday

Last 7 Days

Last Week

This Month

Custom Range

Metric

Current Occupancy

Occupied Hours

Session Count

Unique Users

Average Session

Sort Clusters By

Current Occupancy

Total Usage

Average Session

Available Seats

Alphabetically

Global Statistics

Display summary cards above the cluster map.

Example:

Students Online
184

Available Seats
43

Campus Occupancy
81%

Most Occupied Cluster
C3

Most Popular Computer
c3r12s4

Average Session
2h 58m
Animations

Keep animations minimal and smooth.

Occupied seats fade in.

Available seats fade out.

Occupancy percentages animate.

Heatmap colors transition smoothly.

Avoid unnecessary effects.

This dashboard should feel professional rather than playful.

TV Optimization

The visualization will be displayed on a large TV in the Social Space.

Requirements:

Large readable text

High contrast

Minimal interaction required

Cards should remain visible from several meters away

Avoid tiny labels

Avoid excessive scrolling

Keep important information visible at all times

Technical Notes

Each workstation is generated dynamically from API data.

The frontend should never hardcode seat locations.

Each square is generated from processed backend data such as:

{
  "host": "c3r12s4",
  "cluster": "C3",
  "occupied": true,
  "student": "eeravci",
  "project": "CPP09",
  "sessionMinutes": 197,
  "level": 9.42,
  "coalition": "Freax",
  "usageHoursLastWeek": 63.4
}

The backend is responsible for:

Grouping workstations by cluster
Calculating occupancy
Computing session duration
Aggregating historical usage
Returning dashboard-ready JSON

The frontend is responsible only for rendering the visualization.


## Feature: Night Owls & Early Birds

Add a new community feature called **Night Owls & Early Birds** to the existing dashboard. This feature should recognize students based on the time of day they are most active on campus and provide insights into campus usage patterns during early mornings and late nights.

The feature should be visually engaging, data-driven, and optimized for display on a large TV in the Social Space.

---

### 🌙 Night Owls

Identify students who spend the most time on campus during late-night hours.

**Night period:**

```text
22:00 → 06:00
```

Only the portion of each login session that overlaps with this time window should count.

Display:

* Top Night Owls leaderboard
* Student profile picture
* Login
* Coalition
* Current level
* Total night hours
* Number of night sessions
* Longest night session
* Last night activity

Summary Cards:

* Students currently active at night
* Total night activity this week
* Average night session duration
* Peak night hour
* Longest overnight session

Additional Insights:

* Most active night of the week
* Night activity trend
* Percentage of total campus activity occurring at night

---

### ☀️ Early Birds

Identify students who consistently arrive and work early in the morning.

**Morning period:**

```text
06:00 → 10:00
```

Only time spent within this window should contribute to the statistics.

Display:

* Top Early Birds leaderboard
* Student profile picture
* Login
* Coalition
* Current level
* Total morning hours
* Number of morning sessions
* Earliest login
* Average arrival time

Summary Cards:

* Students active this morning
* Average arrival time
* Earliest login today
* Peak morning hour
* Total morning activity

Additional Insights:

* Most active morning of the week
* Morning activity trend
* Percentage of students arriving before 08:00

---

### Comparison Section

Display both communities side-by-side.

Example metrics:

* Total Night Owls this week
* Total Early Birds this week
* Average night login time
* Average morning arrival time
* Night vs Morning campus activity percentage

---

### Filters

Support:

* Today
* Last 7 Days
* Last Week
* This Month
* Custom Date Range

---

### Backend Requirements

The backend should:

* Analyze historical location sessions.
* Calculate only the overlapping duration within each defined time window.
* Aggregate total hours per student.
* Rank students based on total activity during the selected period.
* Return dashboard-ready JSON.

---

### TV Optimization

The feature should be designed for continuous display on a large TV.

* Show Top 5 Night Owls and Top 5 Early Birds side-by-side.
* Use large typography and clear icons.
* Rotate additional students automatically if necessary.
* Keep animations subtle and lightweight.
* Update automatically as new data becomes available.




# Feature Prompt: Returning Students

Add a new feature called **Returning Students** to the existing 42 Warsaw campus dashboard.

The purpose of this feature is to highlight students who have returned to campus after a meaningful period of inactivity. It should create a positive sense of community and help students and staff notice returning members without exposing unnecessary personal information.

The feature must match the current dashboard design and remain easy to understand on a large TV screen.

## Main Definition

A **returning student** is a student who:

1. Has a new campus login session during the selected period.
2. Had no campus login sessions for a defined inactivity period before that return.

Default inactivity threshold:

```text
14 days
```

Allow configurable thresholds:

```text
7 days
14 days
30 days
60 days
```

Example:

```text
Student last visited campus: 3 June
Student returned: 22 June
Inactive period: 19 days

Result: Returning student
```

Do not classify a student as returning if they were active during the inactivity window.

---

## Display Format

Create a compact section titled:

```text
Welcome Back
```

or:

```text
Returning Students
```

Display each student as a small card or row containing:

* Profile image
* Student login
* Coalition
* Current level
* Return date and time
* Previous campus visit
* Number of inactive days
* Current online status
* Current workstation, when appropriate

Example:

```text
Welcome Back

eeravci
Returned today at 10:42
Last seen 21 days ago
Level 8.42
Freax
Currently online
```

For TV mode, show only the most important information:

```text
eeravci is back after 21 days
```

---

## Summary Cards

Add small summary metrics above the feature:

* Students returned today
* Students returned this week
* Average inactive period
* Longest absence before returning

Example:

```text
Returned This Week
12 students
```

```text
Longest Absence
48 days
```

---

## Filters

Support:

* Today
* Last 7 days
* This week
* This month
* Custom date range

Inactivity threshold:

* 7+ days
* 14+ days
* 30+ days
* 60+ days

Optional filters:

* Coalition
* Cursus
* Student login

---

## Sorting

Allow sorting by:

* Most recent return
* Longest inactivity period
* Highest level
* Alphabetical login

The default sorting should be:

```text
Most recent return first
```

---

## TV Display Behaviour

The feature should work well without user interaction.

Use a rotating display if many students returned:

```text
Welcome Back

eeravci
Back after 21 days

Next student appears after 8–10 seconds
```

Keep animations simple:

* Fade between students
* No heavy transitions
* No large popups
* No sound
* No intrusive notifications

Show a maximum of 3–5 returning students at once.

---

## Backend Logic

Use historical campus location sessions.

For each student:

1. Sort location sessions by `begin_at`.
2. Detect the latest session inside the selected reporting period.
3. Find the session immediately before it.
4. Calculate the gap between the previous session and the return session.
5. Classify the student as returning when the gap meets the configured threshold.

Basic formula:

```text
inactive duration =
return_session.begin_at - previous_session.end_at
```

If the previous session has no valid `end_at`, use the next reliable timestamp or exclude the record from the calculation.

Example logic:

```javascript
if (inactiveDays >= selectedThreshold) {
    student.isReturning = true;
}
```

---

## Important Data Rules

Avoid incorrect results by handling:

* Duplicate location records
* Overlapping sessions
* Active sessions with `end_at = null`
* Missing timestamps
* Users with multiple campuses
* Staff accounts
* Alumni
* Anonymous or anonymized users

Only include students belonging to the selected campus and cursus.

Do not display:

* Email addresses
* Full names unless already allowed by the project requirements
* Private account information
* Exact historical movement patterns

Use the login and public profile image only.

---

## Suggested API Response

The backend should return frontend-ready data:

```json
{
  "period": "this-week",
  "inactivityThresholdDays": 14,
  "totalReturningStudents": 12,
  "students": [
    {
      "userId": 12345,
      "login": "eeravci",
      "image": "https://example.com/profile.jpg",
      "level": 8.42,
      "coalition": "Freax",
      "returnedAt": "2026-08-01T10:42:00Z",
      "previousVisitAt": "2026-07-11T18:25:00Z",
      "inactiveDays": 20,
      "currentlyOnline": true,
      "host": "c3r12s4"
    }
  ]
}
```

---

## Suggested Backend Endpoint

```http
GET /api/students/returning
```

Query parameters:

```http
GET /api/students/returning?period=this-week&threshold=14
```

Optional:

```http
GET /api/students/returning?from=2026-07-01&to=2026-08-01&threshold=30
```

---

## Empty State

When no students match the selected period:

```text
No returning students during this period.
```

Do not show an empty card or broken layout.

---

## Expected Outcome

This feature should help the campus community notice and welcome students who return after being away.

It should feel positive and community-focused while still being based on accurate historical session data and respecting student privacy.
