# DevPerf System — Project Process Handbook

This handbook documents how the DevPerf System actually works, end to end: how a project's Epic → User Story → Task tree gets created, coded, and kept in sync; how project health is measured; what tooling exists on the Admin page and in the Backlog Generator; who — Employee, PM, Tech Lead, HR, or Admin — can see and do what across every one of those features; and how a developer's Skill Matrix, Bench Time, and half-yearly Performance Score are actually computed under the hood.

It describes the system **as implemented**, including one design that was built experimentally and then explicitly reverted, and a few places where the code doesn't (yet) do what its own comments or CLAUDE.md's framing suggest — all of that is called out where it appears rather than omitted, so this document stays an accurate map of what actually runs today.

## Table of Contents

1. [Backlog Structure: Epic → User Story → Task, and the Back-up Epic](#1-backlog-structure-epic--user-story--task-and-the-back-up-epic)
2. [Task Codes](#2-task-codes)
3. [Project Detail Modal: Overall Tab, Critical Path, and Health Check](#3-project-detail-modal-overall-tab-critical-path-and-health-check)
4. [Admin Page & Backlog Generator](#4-admin-page--backlog-generator)
5. [Who Uses This System: Roles & Permissions](#5-who-uses-this-system-roles--permissions)
6. [Skills & the Skill Matrix](#6-skills--the-skill-matrix)
7. [Bench Time](#7-bench-time)
8. [Performance Scoring: Technical Point + Contribution + Certificates by Half-Year](#8-performance-scoring-technical-point--contribution--certificates-by-half-year)
9. [Evaluations (Quarterly / Semi-Annual / Annual) — a Separate System, Not Yet in the UI](#9-evaluations-quarterly--semi-annual--annual--a-separate-system-not-yet-in-the-ui)
10. [Known Overlaps / Follow-ups](#10-known-overlaps--follow-ups)

---

## 1. Backlog Structure: Epic → User Story → Task, and the Back-up Epic

### 1.1 The data model

Every Epic, User Story, Task, Bug, and Sub-task is the **same database entity** — `TaskRecord` (`backend/src/tasks/entities/task-record.entity.ts`). There is no separate Epic/Story table. A row is distinguished purely by its `issueType` string (`'Epic'`, `'Story'`, `'Task'`, `'Bug'`, `'Sub-task'`, or `null` for ad-hoc/manual rows).

Hierarchy is expressed through **loose string references**, not foreign keys:

| Field | Points at |
|---|---|
| `epicKey` | The parent Epic's own `jiraIssueKey` |
| `storyKey` | The parent Story's own `jiraIssueKey` |
| `parentTaskKey` | The parent Task's own `jiraIssueKey` — set only for Sub-task rows |
| `taskCode` | Free-text display code (see [Section 2](#2-task-codes)) — cosmetic, not structural |

For rows created outside real Jira (the Backlog Generator, the Back-up Epic tooling), `jiraIssueKey` is a synthetic-but-unique value (e.g. `GEN-<runToken>-Epic-1`) so the same parent/child matching logic works identically whether or not the row came from real Jira.

### 1.2 Two ways to populate a project's backlog

**A. Sync from Jira** (`JiraService.syncSingleProjectFromJira`, driven from the Admin page)
Pulls every issue in a real Jira project, maps each to a `TaskRecord` (matched/updated by `jiraIssueKey` if it already exists), then runs three post-sync passes over the whole project:
1. `TaskCodeService.assignTaskCodesForProject` — assigns/refreshes every row's `taskCode`.
2. `TasksService.resolveBlockedByTaskIdsForProject` — resolves task-level dependency links.
3. `TasksService.recalculateTaskRollupsForProject` — zeroes out a Task's own points/hours if it has Sub-tasks (see [3.3](#33-task-rollup-and-why-nothing-gets-double-counted)).

**B. Generate with an LLM** (the **Backlog Generator**, `BacklogGeneratorService`, powered by Gemini)
Three separate flows, all documented in full in [Section 4.2](#42-backlog-generator):
- Free-text description → full Epic/Story/Task tree, saved immediately.
- Upload a `.docx`, or point at a Jira issue → one Task per Story, review before pushing to Jira.
- "Generate from Description" — a PDF or a Jira/Confluence link → Epics + User Stories only (no Tasks), review before pushing to Jira.

Both paths converge on the same `TaskRecord` shape, so everything downstream (task codes, health check, critical path, the Task Management tree) works the same regardless of where a row came from.

### 1.3 The Back-up Epic (`Epic-0`)

**Why it exists**: real projects accumulate work that was never part of the original planned scope — small enhancements, change requests, ad-hoc fixes. Without a designated place for it, that work either gets invented a new Epic every time (inflating "new scope" metrics) or crowds into an unrelated Epic. The Back-up Epic is a **fixed-size buffer**, sized as a percentage of the project's real planned work, that this kind of work draws down from instead of adding to.

**Structure** (`BacklogGeneratorService.initializeBackupEpic` / `createBackupEpicTask`):

| Code | Name | Role |
|---|---|---|
| `Epic-0` | Enhance / Change Request / Back-up | The container |
| `US-0.1` | Enhance | Holds Enhance-category draw-down tasks |
| `US-0.2` | Change Request | Holds Change-Request-category draw-down tasks |
| `US-0.3` | Back-up | Holds the buffer itself |
| `Task-0.3.1` | Back-up point pool | The actual point buffer — starts at 30% of the project's total, decreases as work is drawn from it |

**The formula**: at initialization, sum `points` across every `Task`/`Bug`/`Sub-task` row in the project that belongs to any *other* Epic (i.e. every Epic except `Epic-0` itself) — call this `totalOtherPoints`. `Task-0.3.1`'s starting points = `round(totalOtherPoints × 0.30)`.

> Worked example from this project's own "Nimbus CRM" data: the project's 5 real Epics summed to **155** points across their Tasks/Bugs/Sub-tasks. `round(155 × 0.30) = 47`. `Epic-0`/`US-0.1`/`US-0.2`/`US-0.3` were created with 0 points each (matching every other Epic/Story's convention), and `Task-0.3.1` was created holding **47** points.

**The draw-down**: `Epic-0` is initialized once — re-running the initializer on a project that already has one throws, rather than silently resetting the buffer. After that, every new Enhance or Change Request item is added via `createBackupEpicTask({ category: 'ENHANCE' | 'CHANGE_REQUEST', taskName, points, estimateHours })`:
- It's created as a new `Task-0.1.N` (Enhance) or `Task-0.2.N` (Change Request) row, `N` being the next sequential slot under that story.
- `Task-0.3.1`'s points are **decremented** by the new task's points.

> Example: `Task-0.3.1` at 300 points. A 3-point Enhance task is added as `Task-0.1.1`. `Task-0.3.1` becomes 297. The buffer only ever shrinks — it never gets re-topped-up automatically, so once it's exhausted, further requests either come out of real planned scope or the buffer is manually reinitialized for a new period.

Endpoints: `POST /backlog-generator/projects/:projectName/backup-epic/initialize` and `POST /backlog-generator/projects/:projectName/backup-epic/tasks`.

**A related, currently-inactive idea — per-Epic back-up stories (`US-x.0`)**: during development, a second, complementary concept was built and tested: alongside every *real* generated Epic (`Epic-1`, `Epic-2`, ...), automatically append its own catch-all Story numbered `US-{epicNumber}.0` (e.g. `US-1.0`, `US-2.0`) — "Back-up Story for Epic-N" — as a home for that specific Epic's own Bug/ReOpen/other unplanned work, distinct from the project-wide `Epic-0` buffer above. This was implemented inside the "Generate from Description" flow's `generateOverview`, verified working correctly (including the numbering-collision fix needed so it didn't shift the real `US-N.1`/`US-N.2` stories), and then **explicitly reverted at the project owner's request** before shipping. It is not part of the live system today. It's recorded here because the idea itself — "give every Epic a dedicated overflow story, numbered `.0`" — may be revisited later, and the numbering scheme and collision pitfalls are already worked out if so.

---

## 2. Task Codes

### 2.1 Purpose

`TaskRecord.taskCode` is a free-text, human-readable hierarchy label shown throughout the UI **instead of the row's title** (e.g. in the Task Management tree's "Task" column when a title alone would be ambiguous, in dependency/blocker tags, in the critical-path chart). It encodes an item's position in the Epic → Story → Task tree so a person can tell "this is the 3rd task of the 2nd story of the 1st epic" at a glance, without an actual foreign-key relationship. It is purely cosmetic — nothing in the system's business logic depends on the string itself (hierarchy is always resolved via `epicKey`/`storyKey`/`parentTaskKey`, never by parsing `taskCode`).

### 2.2 Formats

| Type | Format | Meaning | Example |
|---|---|---|---|
| Epic | `Epic-{e}` | `e` = this Epic's position among all Epics, oldest-created first | `Epic-3` |
| User Story | `US-{e}.{s}` | `s` = this Story's position within its Epic | `US-2.1` |
| Task | `Task-{e}.{s}.{t}` | `t` = this Task's position within its Story (or under its Epic directly, if there's no Story tier) | `Task-2.1.1` |
| Task, no Story | `Task-{e}.0.{t}` | A leaf linked straight to an Epic with no intervening Story uses `0` for `{s}` | `Task-2.0.1` |
| Bug | `Bug-{e}.{s}.{t}.{n}` | `t` is **approximated** (see 2.3); `n` counts Bugs/Sub-tasks since the nearest preceding Task in the same Story | `Bug-1.1.1.1` |
| Sub-task | `SubTask-{e}.{s}.{t}.{n}` | `t` is the **exact** number of its real parent Task (via `parentTaskKey`); `n` counts Sub-tasks under that *same* parent, starting at 1 | `SubTask-1.1.1.1`, `SubTask-1.1.1.2` |
| Back-up Epic | `Epic-0` | Reserved — the project-wide buffer container | `Epic-0` |
| Back-up Stories | `US-0.1` / `US-0.2` / `US-0.3` | Reserved — Enhance / Change Request / Back-up | `US-0.3` |
| Back-up pool task | `Task-0.3.1` | Reserved — the point buffer itself | `Task-0.3.1` |
| Back-up draw-down task | `Task-0.1.{n}` / `Task-0.2.{n}` | An Enhance/Change-Request item drawn from the buffer | `Task-0.1.1` |

### 2.3 How a code actually gets assigned — four mechanisms

**1. Full recompute during Jira sync** (`TaskCodeService.assignTaskCodesForProject`) — the primary mechanism for real Jira-synced projects. Reloads **every** `TaskRecord` in the project ordered by `createdAt ASC` and renumbers everything from scratch:
- Epics get `1, 2, 3, ...` by creation order.
- Stories get `1, 2, ...` within their Epic, by creation order.
- Leaves (Task/Bug/Sub-task) are grouped by `epicKey::storyKey` and walked in creation order: each `Task` increments a running task-slot counter and resets a sibling counter; a `Bug` between Tasks inherits whichever task-slot came most recently before it (an approximation — Bugs typically have no real parent-Task link in Jira); a `Sub-task` instead looks up its **real** parent Task (via `parentTaskKey`) and reuses that Task's exact slot number, with its own per-parent sibling counter for the trailing `{n}`.
- Anything with an unresolvable `epicKey` (dangling reference, ad-hoc row) is left with `taskCode: null` rather than guessed at.
- **Idempotent** — safe to re-run after every sync; it always renumbers consistently rather than drifting. This also means a code can legitimately *change* later (e.g. `Epic-1` becomes `Epic-5` once four earlier-created Epics are also synced in) — see 2.4 for why that matters.

**2. Positional assignment during AI generation** (`BacklogGeneratorService.persistBacklog`, used only by the free-text `generate()` flow) — a **one-time** assignment from the freshly-generated array's own position (`Epic-${index+1}`, etc.) at the moment of creation. Never revisited by this method afterward.

**3. Reserved codes for the Back-up Epic** (`initializeBackupEpic` / `createBackupEpicTask`) — the fixed and counted codes described in [1.3](#13-the-back-up-epic-epic-0).

**4. Manual entry** — the Task Management "Add/Edit Task" form has a free-text "Task Code" field (`CreateTaskRecordDto.taskCode` / `UpdateTaskRecordDto.taskCode`). No format or uniqueness validation is enforced — a PM/Tech Lead/Admin can type anything.

### 2.4 Keeping the Summary in sync — "Sync Summary Prefixes"

Because a Jira re-sync can **renumber** an existing row's `taskCode` (mechanism 1 above), a task's title text can go stale if it once had a code baked into it. `TasksService.syncTaskNamePrefixesForProject` corrects this: for every task with a `taskCode`, it strips *any* existing bracketed code prefix (`/^\[[A-Za-z]+-[\d.]+\]\s*/` — deliberately not a fixed word list, since real data includes `SubTask` and other types beyond the ones spelled out above) and replaces it with `[${taskCode}]`, so the Summary always reads e.g. `[Task-2.1.1] PDF invoice template`. Already-correct rows are left untouched (idempotent). Triggered manually via the "Sync Summary Prefixes" button in the Task Management tab, or per-row via each task's own "Sync to Jira" action once its prefix is correct (see [4.1](#41-admin-page)/`JiraService.syncOneTaskSummaryToJira`).

---

## 3. Project Detail Modal: Overall Tab, Critical Path, and Health Check

### 3.1 The "Overall" tab

Backend: `TasksService.findProjectOverview` / `findAllProjectsOverview`. Shows, per project:

| Stat | Source |
|---|---|
| Tasks (`completed / total`) | `completedTaskCount` / `taskCount` — every `TaskRecord` row in the project, `completedAt !== null` for the numerator |
| Contributors | Distinct `employeeId` count |
| Total Estimate / Actual Points | Raw `SUM(points)` across every row / same, filtered to completed |
| Total Estimate / Actual Hours | Same, for `estimateHours`/`actualHours` |
| Revenue / Cost / ROI (Admin and PM only — **not** HR or Tech Lead) | Only computed for roles in `ROI_VISIBLE_ROLES`; a PM sees the full breakdown for a project they manage. HR and Tech Lead see the plain effort breakdown with no financial figures |

### 3.2 The Task Management tab: the tree and its progress bars

The Task Management tab renders every `TaskRecord` in the project as a single expandable tree (`buildTaskHierarchy`, `frontend/src/utils/taskHierarchy.ts`) — the same component backs the Admin page's "Project Task Hierarchy." Expand/collapse is antd's own built-in behavior: any row whose object carries a `children` array gets the control automatically; nothing is manually wired per row type.

**How the tree is built:**
- Epics are the top level.
- A Story nests under its Epic via `epicKey`.
- A Task or Bug nests under its Story via `storyKey` — or directly under its Epic if there's no Story tier.
- A Sub-task nests under its real parent **Task**, via `parentTaskKey` — not under the Story it happens to share with that Task. (A Sub-task inherits its parent Task's own `epicKey`/`storyKey`, so without an explicit exclusion it would also match the Story's flat-children filter and render twice — once nested correctly, once as a stray sibling. The tree-builder filters this out.)
- Anything with an unresolvable `epicKey`/`storyKey`/`parentTaskKey` (a dangling reference, or an ad-hoc manually-created task) surfaces as a flat top-level row instead of silently disappearing.

**Columns, and which rows they apply to:**

| Column | Applies to | Behavior |
|---|---|---|
| Task | Every row | The Summary (see [2.4](#24-keeping-the-summary-in-sync--sync-summary-prefixes) for how it stays in sync with `taskCode`) |
| Type | Every row | Epic / Story / Task / Bug / Sub-task tag |
| Employee | Every row | Assignee |
| Sprint | Every row | Editable dropdown — in practice only meaningful on leaf Tasks, since only Tasks are actually planned into a sprint |
| Estimate hrs / Actual hrs / Points | Every row | **Parent row** (has children): the live rollup sum of every descendant. **Leaf row**: its own stored value. |
| Progress | Every row | See below — the same parent/leaf split as the three columns above |
| Status | Leaf rows only | Editable To Do / In Progress / Completed dropdown. A parent shows `—` — its completion is a derived rollup, not something set directly. |
| Completed | Leaf rows only | The date it was marked done |
| Blocked By | Every row | Tags naming every other task that must finish first (`blockedByTaskIds`) |
| Ready | Leaf rows | Whether every one of *this* task's own blockers is already done |
| Actions | Every row | Edit, Sync-to-Jira (see [2.4](#24-keeping-the-summary-in-sync--sync-summary-prefixes)), Delete |

**The progress bar, specifically** (`progressPercent`, `taskHierarchy.ts`):

- **A leaf** (no children) has no partial progress — it's binary. The bar reads `100` the moment `completedAt` is set, `0` otherwise. This is why a just-finished task's bar renders as a full, solid bar rather than creeping up gradually — there's no "60% done" state for a single task.
- **A parent** (Epic, Story, or a Task that itself has Sub-tasks) reads `rollupCompletedPoints / rollupPoints × 100` — the *points-weighted* share of its descendants that are done, not a headcount of finished child rows. A Story with one large incomplete Task and three small completed ones will show a low percentage, correctly, even though "3 out of 4" child rows are done.

> Reading the numbers together: an Epic showing `43` estimate hrs / `13` actual hrs / `20` points / `45%` progress means its descendants together are estimated at 43 hours and have logged 13 so far, are worth 20 points total, and 45% of those 20 points' worth of work is marked complete — four different lenses on the same rolled-up subtree, all computed from the leaves up, none of it stored on the Epic row itself (see [3.3](#33-task-rollup-and-why-nothing-gets-double-counted)).

### 3.3 Task rollup, and why nothing gets double-counted

Per this project's convention, **only Task-type issues carry their own real `points`/`estimateHours`** — Epic and Story rows always store `0` for both, and their *effective* total is computed live from their descendants wherever it's displayed (`buildTaskHierarchy`'s `rollupPoints`/`rollupEstimateHours`/`rollupActualHours`, frontend, `frontend/src/utils/taskHierarchy.ts`).

This same treatment now extends one level deeper: **a Task that itself has Sub-tasks also stores `0`/`null`** for its own `points`/`estimateHours`/`actualHours` (`TasksService.recalculateTaskRollupsForProject`, run as a post-sync step). This was a deliberate correction, not the original design — the first version of this feature stored the **sum** of the Sub-tasks directly on the Task row, which caused every raw `SUM()`/`reduce()` project or employee total elsewhere in the codebase (none of which filter by `issueType`) to double-count that Task's Sub-tasks: once via the Task's own stored sum, once via the Sub-tasks' own rows. Zeroing the Task's own fields (matching Epic/Story exactly) fixed this — the UI still shows the correct total via the same live rollup mechanism, with no visible change, but the underlying totals are no longer inflated.

### 3.4 "All Tasks % Done"

A points-weighted completion percentage across every **leaf** task in the project (Task/Bug/Sub-task — Epic/Story excluded, since they're grouping rows with no points of their own and would otherwise pad the denominator without ever being able to contribute to the numerator):

```
percent = round( Σ(points of completed leaf tasks) / Σ(points of all leaf tasks) × 100 )
```

Deliberately points-weighted rather than task-count-weighted, so a handful of large completed tasks isn't dwarfed by many small incomplete ones, or vice versa. Shown as two clean stats — `All Tasks % Done` and `Points Done / Total` — matching the Overall tab's existing plain-`Statistic` visual style, in both the Task Management tab (`ProjectsPage.tsx`) and the Admin page's "Project Task Hierarchy" (`AdminPage.tsx`). Both call the same shared helper, `allTasksProgress` (`taskHierarchy.ts`).

Every row in the Task Management / Project Task Hierarchy tree — not just Epic/Story parents — also shows its own progress via `progressPercent`: a parent row (has children) shows `rollupCompletedPoints / rollupPoints`; a leaf row has no partial progress (it's binary), so it's `100` once `completedAt` is set, else `0`. Sub-tasks nest visually under their parent Task (via `parentTaskKey`) the same way Stories nest under Epics, using antd's built-in expand/collapse for any row carrying a `children` array.

### 3.5 Critical Path (Epics) — `ProjectHealthService`

Answers: **which chain of Epics determines the project's earliest possible finish date?**

1. Bucket every task by its assigned sprint's `sprintNumber`; sum estimated (all) vs. burned (completed) points per sprint → `velocityPointsPerSprint` = average burned points per elapsed sprint (floored at 1 to avoid a zero-velocity division).
2. For each Epic: `remainingPoints` = sum of its not-yet-completed children's points; `estimatedSprintsNeeded = ceil(remainingPoints / velocity)`.
3. Epic-level blocking comes from `blockedByIssues` (set via `TasksService.setEpicDependencies` on the Critical Path tab) — an Epic can't finish before whatever blocks it does.
4. **Longest chain**: for every Epic, recursively find the longest dependency chain ending at it (`total = own estimatedSprintsNeeded + longest chain among its blockers`), memoized, cycle-guarded. Whichever Epic's chain is longest overall *is* the critical path — every Epic on it is flagged `isOnCriticalPath`.
5. `projectedFinishSprint = sprintsElapsed + criticalPathAdditionalSprints`; converted to a calendar date by adding `sprintsElapsed × 14 days` (a fixed sprint length) to the project's own earliest task date.
6. Compared against `Project.targetEndDate` (if set) → `daysLate`. **Status**: `good` if on time or no target set; `normal` if late by up to one sprint (14 days grace); `bad` beyond that.

### 3.6 Critical Path (All Tasks) — `TaskCriticalPathService`

A **separate, task-level** critical path, distinct from the Epic-level one above — driven by each task's own `blockedByTaskIds` (set manually, or seeded from Jira issue links during sync), not by Epic-level `blockedByIssues`.

- Same longest-chain algorithm as 3.5, but weighted by a task's own `points` instead of an Epic's `estimatedSprintsNeeded`, and over every leaf task in the project (Epic/Story excluded — they always carry 0 points).
- For each task actually on the winning path, the report also captures **every real blocker** (not just its own critical predecessor), each blocker's own upstream chain, and a **deduplicated union** of every task appearing in any blocker's chain (so a task shared between two blocking branches isn't double-counted) — this is what powers `blockersChainPercentDone`, "how much of the work blocking this task is actually done."
- Also buckets every leaf task **not** on the critical path by its Epic (`nonCriticalByEpic`), with a total estimate-hours per Epic — the input to the critical-path chart's non-critical bar series.
- Independently computes its own project-wide `allTasksPercentDone` (points-weighted, Epic/Story excluded) — see [Section 10](#10-known-overlaps--follow-ups) for a note on this overlapping with 3.4's frontend equivalent.

---

## 4. Admin Page & Backlog Generator

### 4.1 Admin page

All Jira-integration and cross-project tooling for Admins lives in one page (`frontend/src/pages/Admin/AdminPage.tsx`, backed by `JiraController`, Admin-only unless noted):

| Feature | What it does |
|---|---|
| **Jira Integration — connection** | Save base URL / email / API token. Token can be left blank on reconnect to keep the stored one. |
| **Projects to sync** | Pick specific Jira projects, or toggle "sync ALL projects visible to this account." Every task in a selected project gets pulled and matched by Jira issue key on each run. |
| **Sync One Project** | Pull one Jira project by key right now, independent of the stored selection — auto-creates a Developer/Junior employee (guessed email, default temp password) for any unmatched assignee, then runs the three post-sync passes from [1.2](#12-two-ways-to-populate-a-projects-backlog). |
| **Create Task in Jira** (single + bulk CSV) | Creates a real issue directly in Jira — a live write, not a local record. Bulk mode parses a CSV (`summary,issueType,assigneeAccountId,parentKey,storyPoints,description`) into one project, row by row, so one bad row doesn't sink the batch. |
| **Push Project to Jira** | Pushes every task in a **local** project that isn't already in real Jira (`jiraIssueKey` null or a synthetic `GEN-` key) into a target Jira project, preserving the Epic → Story → Task hierarchy. Already-real tasks are left completely untouched — this is a create-only, one-way push; it does **not** push local Summary edits back out (that's the separate "Sync Task Summaries to Jira" feature in the Task Management tab). |
| **Jira Users Needing an Employee Account** | Real, active Jira accounts with no matching Employee — a best-effort guessed email (reviewable before creating) so their synced tasks aren't stuck under a placeholder. |
| **Recent Sync Runs** | Log of past manual syncs — the only visibility into what a prior run actually did. |
| **Project Task Hierarchy** | Read-only Epic → Story → Task/Sub-task tree for any project (same component as the Task Management tab's tree), plus the "All Tasks % Done" / "Points Done / Total" stats from [3.4](#34-all-tasks--done). |

### 4.2 Backlog Generator

Three independent generation flows (`BacklogGeneratorService`), all Gemini-powered, plus the Back-up Epic tools from [Section 1.3](#13-the-back-up-epic-epic-0):

| Flow | Input | Output | Persisted? |
|---|---|---|---|
| **Generate** (free text) | A plain-text project description | Full Epic → Story → Task tree | **Yes** — saved immediately as real `TaskRecord` rows (`persistBacklog`), plus a generated Markdown doc |
| **From Word Document / Jira Link** | An uploaded `.docx`, or a live Jira issue's summary+description | Epics/Stories, **exactly one Task per Story** (Acceptance Criteria folded into the Task's description) | No — preview only, for review before an explicit push |
| **Generate from Description** | A PDF, or a Jira/Confluence link | Epics + User Stories **only** (no Tasks) | No — preview only |

For the two preview flows, the reviewer can:
- Edit any generated item's name/description/points/hours before proceeding.
- Run `suggestExistingMatches` — Gemini compares each generated Epic/Story against what already exists in a target Jira project (by *meaning*, not exact text) and suggests reuse instead of creating a duplicate.
- `pushGeneratedBacklogToJira` — creates the (possibly-edited, possibly-remapped) structure directly in real Jira, Epics first then Stories then Tasks so each child's Jira `parent` is already known; a failed parent causes its children to be skipped rather than sent with a dangling reference. Includes self-healing: if Jira rejects an optional field (story points not on the create screen, a Premium-tier-gated `parent` link, etc.), that field is dropped and the create is retried automatically.

The free-text `generate()` flow is the only one of the three that writes directly to this system's own database; the other two only ever write to real Jira, on explicit confirmation.

---

## 5. Who Uses This System: Roles & Permissions

### 5.1 The role model

Every employee has exactly one `Role`: `DEVELOPER`, `TECH_LEAD`, `PM`, `HR`, or `ADMIN`. Almost every permission boundary in the system is one of a small number of role groups checked at the API layer (and mirrored in what the frontend renders) — not five independent role checks scattered everywhere. Once you know the groups, most of the system's access rules fall out of which group a feature belongs to:

| Group | Roles | Governs |
|---|---|---|
| `MANAGER_ROLES` | PM, Tech Lead, Admin | The single split that decides whether you land on the **Dev Dashboard** or the **PM Dashboard** after login (`isManager = MANAGER_ROLES.includes(role)`) — this is the one binary that matters more than any other for "what does this person's day look like." **HR is deliberately not in this group** — see below. |
| Skill catalog reference data | Tech Lead, Admin | CRUD on the shared `Skill`/`SkillCategory`/`SkillLevel` vocabulary (see [6.6](#66-frontend)). |
| Task Management & Backlog Generator | PM, Tech Lead, Admin | Adding/editing/deleting tasks, running any of the three generation flows, the Back-up Epic tools. |
| Bench log review/scoring | PM, Tech Lead, Admin | Setting a `BenchLog.outcomeScore` (see [7.3](#73-review--scoring)). |
| `ROI_VISIBLE_ROLES` | PM, Admin | Revenue/Cost/ROI figures in the Overall tab (see [3.1](#31-the-overall-tab)). |
| Admin-only | Admin | Employee create/edit/delete, project create/edit/delete, contribution-record edits, company-wide certificate verification, snapshotting a Performance Score period. |
| Skill visibility (HR's own scope) | PM, Tech Lead, HR, Admin | Read-only access to the company-wide skill matrix, verification-status queue, and technical points — see below and [Section 6](#6-skills--the-skill-matrix). |

**HR is a deliberately narrow role, scoped to one thing.** HR is excluded from `MANAGER_ROLES` entirely — no Employees roster management, no Projects, no Analytics, no Skill Catalog CRUD, no PM Dashboard. HR's only surface in the app is the **Skills** page, opened read-only: HR can see every employee's declared skills and their verification status (`START`/`LEARNING`/`VERIFIED`/`CONFIRMED`), which is exactly the input HR needs to plan hiring or staff someone onto a project — but HR cannot declare, edit, delete, verify, or confirm a skill on anyone's behalf. That write boundary is enforced the same way it always was for skill actions ([6.2](#62-the-verification-workflow)); what changed is that HR no longer has any of the *other* manager-tier access it used to share with PM/Tech Lead/Admin.

### 5.2 What each role actually sees, feature by feature

**Everyone, regardless of role** — the personal-use surface:
- **Dashboard** — routes to the Dev or PM view depending on `isManager` (for HR, straight to the Skills page — HR has no dashboard of its own).
- **My Projects** — the projects the logged-in employee personally has tasks in.
- **My Skills** — declare a skill, see your own radar chart and learning suggestions (see [6.6](#66-frontend)).
- **My Certificates** — your own certificate list and their verification state.

**Employee (Developer)** — everything above, plus the **Dev Dashboard** itself: current level and live Technical Point, the "Performance Score by Half-Year" chart ([Section 8](#8-performance-scoring-technical-point--contribution--certificates-by-half-year)), a Contribution chart, a Certificate chart, the Suggested Learning panel ([6.4](#64-learning-suggestions-the-category-coverage-algorithm)), and the bench-time log entry form ([7.1](#71-what-it-tracks)) whenever `currentProject` is null. A Developer cannot verify or confirm their own skills, cannot see other employees' data, and has no manager-surface pages at all.

**HR — the one narrow exception:**
- **Skills** — the same company-wide skill history table and filters as PM/Tech Lead/Admin see, but entirely **read-only**: no "Add skill history" button, no Verify/Confirm/Edit/Delete/Set-Primary actions. HR can filter by employee, skill, track, status, or level, and open a skill's Timeline — enough to answer "who already has this skill, and is it confirmed" for a hiring or staffing decision, nothing more.
- Nothing else — no Employees roster, no Projects, no Analytics, no Employee Catalogs, no Skill Catalog/Categories/Levels, no Contribution Records, no Certificates queue, no Admin page, no Backlog Generator, no bench-log review, no Evaluations.

**Any manager (PM, Tech Lead, or Admin)** — a shared surface all three get:
- **PM Dashboard** — roster-wide view; entry point into the skill-verification queue and idle-bench alerts.
- **Employees (roster)** — list/search everyone. Create/edit/delete is Admin only.
- **Skills Management** — the same page HR sees, but with the Verify/Confirm/Edit/Delete/Set-Primary actions enabled.
- **Analytics** — level-history and skill-portfolio drill-down for any employee, read-only.
- **Projects** — list/search for all managers; the Task Management tab inside a project's detail modal narrows further (below).

**PM, Tech Lead, or Admin only:**
- The **Task Management tab** inside the Project Detail Modal — add/edit/delete tasks, sync summaries to Jira.
- **Backlog Generator** — all three generation flows plus the Back-up Epic initialize/draw-down tools.
- Reviewing/scoring a **Bench Log**.
- Verifying/confirming a skill.
- Running or viewing another employee's **Evaluation** (see [Section 9](#9-evaluations-quarterly--semi-annual--annual--a-separate-system-not-yet-in-the-ui)).

**Tech Lead or Admin only:**
- **Skill Catalog**, **Skill Categories**, **Skill Levels** — CRUD on the reference vocabulary every `EmployeeSkill` draws from.

**Admin only:**
- **Employee Catalogs** — role/level reference lists.
- Creating, editing, or deleting an Employee record.
- Creating or editing a Project, and setting its revenue/salary-rate figures.
- The **Admin page** — Jira connection, project sync, bulk/single Jira issue creation, push-to-Jira, employee-account creation from unmatched Jira users.
- **Contribution Records** management.
- The company-wide **Certificates** verification queue.
- Snapshotting a Performance Score half-year, for one employee or in bulk (see [8.4](#84-live-vs-frozen-the-snapshot-duality)).

---

## 6. Skills & the Skill Matrix

### 6.1 The four entities

The Skill Matrix is four related tables, not one:

| Entity | Role |
|---|---|
| `Skill` | The catalog — a named skill (e.g. "React", "PostgreSQL tuning"), which `SkillCategory` it belongs to, a `keySkillMultiplier` (weights especially valuable skills like English higher — this is CLAUDE.md's "hệ số nhân cao"), and an `isFoundational` flag. |
| `SkillCategory` | Groups skills (e.g. "Frontend", "Soft Skills"); carries `isPrimary`, `primaryWeight`/`secondaryWeight`, and a `priority` used by the learning-suggestion gap analysis ([6.4](#64-learning-suggestions-the-category-coverage-algorithm)). |
| `SkillLevel` | The 1–5 proficiency scale, each level carrying its own `weight` used in the Technical Point formula. |
| `EmployeeSkill` | **The actual matrix row.** One row per employee per skill per declaration: which `SkillLevel`, which verification `SkillStatus`, and a `track` of `CURRENT` or `LEARNING`. |

A common misreading: "current skills" and "learning skills" are **not two separate tables** — they're the same `EmployeeSkill` row, distinguished only by its `track` value. An employee moving a skill from "I'm learning this" to "I have this" is a `track` update on the existing row, not a move between tables.

### 6.2 The verification workflow

`EmployeeSkill.status` is a strictly linear state machine — no skipping stages, no going backward:

```
START → LEARNING → VERIFIED → CONFIRMED
```

An employee declares a skill and can move it themselves through the early self-reported stages. Moving a skill to `VERIFIED` or on to `CONFIRMED` is gated to **PM, Tech Lead, or Admin** — the same exclusion pattern as [Section 5](#5-who-uses-this-system-roles--permissions): **HR can see the pending-review queue on the Skills Management page but cannot action it.** Only a `CONFIRMED` entry on the `CURRENT` track ever counts toward Technical Point below — `LEARNING`-track and not-yet-confirmed skills are visible for planning purposes but contribute zero to the score.

### 6.3 The Technical Point formula

Computed live, on demand, by `SkillsService.findTechnicalPointForEmployee` — **never stored**. Every time it's shown (Dev Dashboard, Performance Score, Analytics), it's recomputed from that instant's confirmed skill set.

```
T = A + B + C
```

For every `EmployeeSkill` that is `CONFIRMED` and `track = CURRENT`:

```
base = SkillLevel.weight × Skill.keySkillMultiplier

A += base × category.primaryWeight     (only if the skill's category isPrimary)
B += base × category.secondaryWeight   (only if the category is NOT primary)
C += base × category.primaryWeight     (only if Skill.isFoundational)
```

`A` and `B` are mutually exclusive per skill (a category is either primary or it isn't), but `C` is **not** exclusive with `A` — a skill that is both in a primary category *and* flagged `isFoundational` contributes to both `A` and `C` by design. This is intentional double-weighting for skills the business considers both "core to the role" and "foundational" (e.g. a Tech Lead's core language) — not a bug, but easy to misread as one if you're tracing the formula for the first time.

### 6.4 Learning suggestions — the category-coverage algorithm

`findLearningSuggestionsForEmployee` recommends a `SkillCategory` (not a specific next-level skill) to an employee. A category is suggested if **any** of:
- the employee has **zero** `EmployeeSkill` rows in that category, or
- the category's `priority` is **≥ 3**, or
- the employee is missing a skill flagged `CompanyNeedLevel.VERY_NEEDED`.

A category flagged `CompanyNeedLevel.DONT_NEED` is never suggested regardless of the above.

Worth calling out plainly: this is a **coverage-gap** heuristic — "which whole categories are you thin in" — not a "you're a Level 3 in React, here's what closes the gap to Level 4" recommendation. CLAUDE.md's framing ("gợi ý lộ trình... dựa trên bộ kỹ năng còn thiếu") is consistent with either reading; the actual implementation is squarely the coverage-gap one.

### 6.5 Employee level & level history — currently 100% manual

`Employee.level` (an `EmployeeLevel`, e.g. Junior/Middle/Senior) changes are logged in `EmployeeLevelHistory`, each row carrying a `source`: `INITIAL`, `MANUAL`, or `AUTO_PROMOTION`.

**`AUTO_PROMOTION` is defined but never triggered.** The enum value exists, and a doc comment on `EmployeeSkill.level` points at a method called `EmployeesService#maybePromote` as the place career level would automatically bump on skill confirmation — that method does not exist anywhere in the codebase today. Every level change in the system, without exception, is a manual Admin edit; `source` in practice is always `INITIAL` or `MANUAL`. Confirming a skill, no matter how many or how senior, does not move anyone's level. This is one of the two "documented but not implemented" gaps recorded again in [Section 10](#10-known-overlaps--follow-ups).

### 6.6 Frontend

- **My Skills** (self-service) — a radar chart of confirmed current skills by category, a portfolio/timeline view of learning progress, the suggestions panel from 6.4, and the form to declare a new skill.
- **Skills Management** — the company-wide pending-review queue for PM/Tech Lead/Admin, with the Verify/Confirm actions ([6.2](#62-the-verification-workflow)); the same table read-only for HR ([Section 5](#5-who-uses-this-system-roles--permissions)) — HR's only page in the app.
- **Skill Catalog / Skill Categories / Skill Levels** — reference-data CRUD, gated to Tech Lead/Admin (see [Section 5](#5-who-uses-this-system-roles--permissions)) — **not** HR or PM.
- **Analytics** — level-history chart and skill-portfolio drill-down for any employee, read-only for any manager (PM/Tech Lead/Admin — not HR).

---

## 7. Bench Time

### 7.1 What it tracks

A `BenchLog` row records what an employee is doing while `currentProject` is null — the company's alternative to "idle": learning, building an internal tool, supporting another project short-term, pursuing a certification, or something else. `BenchActivityType` is one of `LEARNING`, `INTERNAL_TOOL`, `SUPPORT_OTHER_PROJECT`, `CERTIFICATION`, `OTHER`. An employee logs their own activity; a log stays open until a manager reviews it.

### 7.2 The idle-learning alert

`findIdleLearningAlertForEmployee` fires only when **all** of the following hold:
- `currentProject` is null, **and**
- the employee's most recent open `BenchLog` started **≥ 14 days ago** (`IDLE_BENCH_ALERT_DAYS`), **and**
- no new `LEARNING`-track `EmployeeSkill` has been created since that bench log started.

This is deliberately narrow: it's not "you've been on the bench for two weeks," it's "you've been on the bench for two weeks *and produced no visible learning signal in that window*." Declaring a single new `LEARNING`-track skill mid-bench clears the alert immediately, even if the underlying bench log itself is still open.

### 7.3 Review & scoring

A bench log's `outcomeScore` (1–5) is set by **PM, Tech Lead, or Admin** — HR is excluded from this action, the same pattern as skill verification ([6.2](#62-the-verification-workflow)) and Task Management ([Section 5](#5-who-uses-this-system-roles--permissions)). The score feeds `computeBenchScore` inside Evaluations ([9.2](#92-the-four-sub-scores)), weighted by activity type: `INTERNAL_TOOL` ×1.2, `SUPPORT_OTHER_PROJECT` ×1.1, `CERTIFICATION` ×1.05, `LEARNING` ×1.0, `OTHER` ×0.9. An employee whose logs simply haven't been reviewed yet gets a **neutral 100**, not a penalty — nobody is marked down for a manager's backlog.

**Gap worth knowing about**: the backend endpoint for this (`PATCH /bench-logs/:id/review`) is correctly role-gated, but no page in the frontend currently calls it — there is no button or table today for a PM/Tech Lead to actually review and score a bench log from the UI. It's reachable only by calling the API directly. See [Section 10](#10-known-overlaps--follow-ups).

---

## 8. Performance Scoring: Technical Point + Contribution + Certificates by Half-Year

This is the score a Developer actually sees on their own Dashboard. It is a **different system** from the Evaluations feature described in [Section 9](#9-evaluations-quarterly--semi-annual--annual--a-separate-system-not-yet-in-the-ui) — read 8.7 before assuming the two are the same thing under different names.

### 8.1 The period model

`PerformanceScoreRecord` is one row per `(employeeId, year, half)`, where `half` is `H1` or `H2` — a **fixed calendar half-year**, unlike Evaluation's arbitrary date ranges.

### 8.2 The three inputs

| Input | Where it comes from |
|---|---|
| `technicalPoint` | Pulled **live** from the Skills' Technical Point formula ([6.3](#63-the-technical-point-formula)) at the moment the period is computed — it is not independently stored or re-derived; it's the exact same number the Dev Dashboard's own Technical Point display shows. |
| `contributionPoints` | `CONTRIBUTION_WEIGHT (0.2)` × the raw sum of Contribution entries dated inside the period. |
| `certificatePoints` | The sum of points from verified certificates whose validity window overlaps the period. |

### 8.3 `totalScore`

```
totalScore = technicalPoint + contributionPoints + certificatePoints
```

A **plain, unweighted sum** — there is no level-based weighting anywhere in this formula, unlike Evaluation's (nominal) weighted blend in [9.3](#93-blending-into-totalscore--and-the-weight-profile-gap).

### 8.4 Live vs. frozen: the snapshot duality

The **current, in-progress half-year is always computed live** (`computeLiveScoreForPeriod`) every single time it's viewed — always current, but never a fixed historical fact. A **past** half-year only exists as a durable, queryable row once it's been explicitly **snapshotted** — `snapshotPeriodForEmployee` (one employee) or `snapshotPeriodForAllEmployees` (bulk), both **Admin-only**. Snapshotting freezes that period's three inputs and its `totalScore` so later edits elsewhere can't silently rewrite history.

### 8.5 Keeping frozen periods honest — the reactive resync

Because `contributionPoints` is derived from live Contribution rows, editing or deleting a Contribution entry that falls inside an already-snapshotted period would otherwise leave that frozen snapshot quietly wrong. `recalculateContributionPointsForPeriod` hooks into Contribution writes and re-derives just the `contributionPoints` (and `totalScore`) for any already-snapshotted period the edit falls into. **This resync only covers `contributionPoints`** — `technicalPoint` and `certificatePoints` inside a frozen snapshot are not similarly kept in sync if the underlying skill-confirmation or certificate data changes after the freeze.

### 8.6 What's actually shown

The Dev Dashboard's "Performance Score by Half-Year" chart calls `findRecentPerformanceScoreHistoryForEmployee(employeeId, count=4)` — the four most recent periods, a mix of the always-live current half-year and however many past halves have been snapshotted, each broken into its three components so a developer can see which lever actually moved.

### 8.7 Not to be confused with: Evaluation

**This is the only one of the system's two scoring pipelines with a frontend UI.** A separate feature, `Evaluation` (Section 9), computes something that sounds similar — a "performance score" over a review period, from tasks/skills/bench — but is a fully independent code path with no shared formula, no shared entity, and (today) no shared visibility. If you're asked "where's the performance evaluation feature," the honest answer is "there are two, and only this one is visible to anyone outside an API client" — see the side-by-side in [9.7](#97-side-by-side).

---

## 9. Evaluations (Quarterly / Semi-Annual / Annual) — a Separate System, Not Yet in the UI

### 9.1 What it is

`Evaluation` is a review-cycle record over a period tagged `quarterly`, `semi_annual`, or `annual` (`EvaluationPeriod`), with **arbitrary** `startDate`/`endDate` — not fixed calendar halves like `PerformanceScoreRecord`. Its inputs are the employee's full in-period `TaskRecord[]`, their full `EmployeeSkill[]` matrix, and their in-period `BenchLog[]`.

### 9.2 The four sub-scores

- **`taskScore`** (`computeTaskScore`) — averaged across every completed task that has both `completedAt` and `actualHours` set:
  ```
  ratingComponent   = (pmRating ?? 3) / 5 × 100
  onTimeComponent   = clamp0to100((estimateHours / actualHours) × 100)
  bugPenalty        = min(bugCount × 5, 30)
  complexityBonus   = (complexity − 1) × 2.5
  raw               = ratingComponent×0.5 + onTimeComponent×0.5 + complexityBonus − bugPenalty
  ```
  clamped to 0–100 per task, then averaged.
- **`skillScore`** / **`softSkillScore`** — separate, simpler formulas over confirmed skills and the key-skill multiplier. **This is not the Technical Point formula** ([6.3](#63-the-technical-point-formula)) — it's a second, independent calculation over the same `EmployeeSkill` data, and the two are never reconciled. Don't assume a Technical Point change automatically moves `skillScore`, or vice versa.
- **`benchScore`** (`computeBenchScore`) — from reviewed `BenchLog`s, activity-weighted exactly as described in [7.3](#73-review--scoring); unreviewed-only logs default to a neutral 100.

### 9.3 Blending into `totalScore` — and the weight profile gap

`blendWeightProfiles` combines the four sub-scores using a weight profile intended to vary by employee level — CLAUDE.md describes roughly 40% task / 30% skill / 15% soft-skill+English / 15% bench, shifting emphasis for Junior vs. Middle vs. Senior.

**In the code, `WEIGHT_PROFILES` (`evaluations/scoring/weight-profiles.ts`) is an empty object `{}`.** Every level falls back to the same `BASE_PROFILE`. So today, **every employee at every level is evaluated with the identical weighting** — the per-level emphasis CLAUDE.md describes is not implemented at the weighting layer, and none of the sub-score functions (`computeTaskScore` etc.) even take a level parameter to differentiate by. This is recorded again in [Section 10](#10-known-overlaps--follow-ups).

### 9.4 `levelBreakdown` — pro-rated mid-cycle promotions

If an employee's level changed partway through the evaluation period, `levelBreakdown` pro-rates the weighting by days-at-each-level — a real, working mechanism for a real edge case (CLAUDE.md's own example: "một dev thay đổi level giữa kỳ đánh giá"). It's currently moot in practice, though, since (9.3) every level resolves to the same weight profile regardless.

### 9.5 Lifecycle & roles

`status` moves `draft` → `completed` via `finalize()`; `IN_REVIEW` is defined on the enum but unused in practice. Trigger is **manual only** — `POST /evaluations/run` — there is no cron job or scheduler anywhere in the backend that runs this automatically. Roles: running, viewing another employee's, and finalizing an evaluation are all PM/Tech Lead/Admin — HR has no access to this feature at all, matching its narrowed scope ([Section 5](#5-who-uses-this-system-roles--permissions)); any employee can view their own.

### 9.6 The gap: no frontend

`fetchMyEvaluations` and `fetchEvaluationsForEmployee` exist as frontend service functions, ready to call — but no `.tsx` page or component in the app calls them. `Evaluation` is fully built and reachable by API, but there is nothing to click today; a reviewer who wants to run or read one has to do it outside the app.

### 9.7 Side-by-side

| | `Evaluation` | `PerformanceScoreRecord` |
|---|---|---|
| Period | Quarterly/semi-annual/annual, arbitrary dates | Fixed calendar half-year (H1/H2) |
| Inputs | Tasks + full skill matrix + bench logs | Technical Point + Contribution + Certificates |
| Formula | 4 weighted sub-scores → blended total | Plain unweighted sum of 3 inputs |
| Level-based weighting | Designed for, but `WEIGHT_PROFILES` is empty in practice | None — not part of the design at all |
| Trigger | Manual, `POST /evaluations/run` | Live for the current half; Admin-only snapshot for past halves |
| Frontend | **None** — API only | Dev Dashboard's "Performance Score by Half-Year" chart |

---

## 10. Known Overlaps / Follow-ups

Recorded here for whoever picks this up next, not because they're urgent:

- **Duplicate "all tasks % done" implementations.** `TaskCriticalPathService.compute` already returns its own `allTasksPercentDone` (points-weighted, Epic/Story excluded) as part of the Critical Path (All Tasks) report — computed independently from, but identically to, the frontend's `allTasksProgress` helper built for the Overall/Task-Management stats in [3.4](#34-all-tasks--done). They should agree in practice (same formula, same exclusion rule) but are two separate code paths computing the same number; worth consolidating if they ever need to change.
- **The per-Epic back-up story (`US-x.0`) idea** described in [1.3](#13-the-back-up-epic-epic-0) is fully designed and was verified working, but is not wired into any live flow. If it's revisited, the numbering-collision fix (append, don't prepend, to a Story's leaf list — prepending shifted the real `US-N.1`/`US-N.2` stories' computed numbers) is the main pitfall already solved once.
- **Manual task creation can't express `parentTaskKey`, `epicKey`, or `storyKey`.** The Task Management "Add Task" form has no fields for these — a manually-created task is always a flat, unparented row. Every Sub-task-nests-under-Task relationship in the system today comes from either a real Jira sync or direct database/script access (as used to build this project's own example data). Extending the manual form to support this would be a natural next step if manual sub-task authoring becomes a real need.
- **`AUTO_PROMOTION` is scaffolding, not a feature.** The `EmployeeLevelHistory.source` enum and a doc comment reference a career-auto-promotion mechanism (`EmployeesService#maybePromote`) that doesn't exist in the codebase ([6.5](#65-employee-level--level-history--currently-100-manual)). Every level change today is a manual Admin edit. If auto-promotion-on-skill-confirmation is a real goal, it needs to actually be built, not just wired into the existing enum value.
- **`WEIGHT_PROFILES` is empty — Evaluation has no real per-level weighting.** ([9.3](#93-blending-into-totalscore--and-the-weight-profile-gap)) Every employee level uses the same `BASE_PROFILE` today, contradicting CLAUDE.md's framing of level-specific weighting (Junior emphasizing learning rate, Senior emphasizing architecture/leadership, etc.). The `levelBreakdown` pro-rating mechanism ([9.4](#94-levelbreakdown--pro-rated-mid-cycle-promotions)) is built and correct, but has nothing differentiated to pro-rate between until real per-level profiles are filled in.
- **`Evaluation` has no frontend consumer.** ([9.6](#96-the-gap-no-frontend)) The backend feature — periods, four sub-scores, blending, finalize lifecycle, role gates — is complete and correctly gated, but nothing in the React app calls it. Either build the UI, or fold its useful pieces (e.g. `computeTaskScore`'s PM-rating/on-time/bug/complexity formula) into `PerformanceScoreRecord`, which is the system's one visible, living scoring surface.
- **Bench log review has no frontend UI.** ([7.3](#73-review--scoring)) `PATCH /bench-logs/:id/review` is implemented and correctly role-gated (PM/Tech Lead/Admin), but there's no page or button that calls it — a manager can't score a bench log from the app today.
- **Technical Point and Evaluation's `skillScore` are two unreconciled formulas over the same data.** ([6.3](#63-the-technical-point-formula), [9.2](#92-the-four-sub-scores)) Both read the same `EmployeeSkill` rows but compute different numbers by different rules. If `Evaluation` ever gets a frontend, this divergence will be the first thing a confused reviewer asks about — worth deciding up front whether that's intentional (two different lenses) or worth unifying.
