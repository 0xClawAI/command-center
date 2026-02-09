# PRD: Command Center + Project Migration

## Problem Statement

We have ~17 project directories at `~/projects/` and 10 registered in `projects.json`. There is no unified way to see what's happening across all of them. Each project is a silo — to check status you have to `cd` into each one, read files, check git logs. This is unusable for a non-technical person and tedious even for the builder.

The **Command Center** is a multi-project hub — a single browser tab where you see everything: what happened overnight, which projects are active, what tasks are in flight, and what needs attention. Think "mission control for an AI agent's portfolio."

The **Project Migration** is the prerequisite: existing projects need to be converted to the orchestrator format (TASKS.md + state.json + progress.txt) so the Command Center has data to display.

**Who suffers without it?**
- Deadly: Can't quickly check "what did my agent do while I slept?" without reading raw files
- Future OpenClaw users: No visual management layer means the orchestrator is CLI-only
- The agent itself: No centralized view means orchestration decisions lack cross-project context

---

## Target Users

- **Primary:** Deadly — vibecoder, self-taught engineer, checks in via phone/tablet over Tailscale. Wants glanceable status, not file trees.
- **Secondary:** Non-technical friend using OpenClaw — must be intuitive enough that someone who doesn't know what TASKS.md is can understand project status.
- **NOT for:** Developers who want to edit tasks from the UI (this is read-only; TASKS.md is edited by agents/humans in files). Not a project management tool (no drag-and-drop, no task creation from UI).

---

## Success Criteria

- [ ] Command Center loads in <2s on a Tailscale connection from any device
- [ ] All 10 registered projects visible in the Command Center without manual configuration beyond projects.json
- [ ] A non-technical user can answer "what's the status of project X?" within 10 seconds of opening the dashboard
- [ ] Cross-project Content tab shows all content/marketing tasks from every project in one view
- [ ] Cross-project Research tab shows all research tasks from every project in one view
- [ ] Overview tab surfaces "needs attention" items (failed tasks, stale projects, blocked items) without user having to click into each project
- [ ] All active projects (Viberr, Blob Social, DeFi Tools, 0xClaw Dashboard, Clawstr Dashboard) have valid TASKS.md, state.json, and progress.txt files after migration
- [ ] Completed/paused projects are registered in projects.json with accurate metadata
- [ ] Dashboard works on mobile (responsive, usable on 375px width)
- [ ] Auto-refreshes without manual reload (polling or equivalent)

---

## Solution Overview

### End-to-End Flow

1. **projects.json** is the registry. Lists all projects with path, status, type, links.
2. **Each project** has its own `TASKS.md` (source of truth), `state.json` (generated dashboard data), and optionally `progress.txt`.
3. **Command Center** is a single static HTML file served via `python3 -m http.server` on `0.0.0.0`. It reads `projects.json` to discover projects, then fetches each project's `state.json` for data.
4. **A lightweight API proxy** (single Node.js/Python script) serves as the data layer — since the HTML file can't read arbitrary filesystem paths via fetch, we need a thin file-serving layer that maps project paths to HTTP endpoints.
5. **Tabs** provide different views: Overview (morning dashboard), Projects (per-project drill-down), Content (cross-project content tasks), Research (cross-project research tasks), Agents (worker status — placeholder).

### Architecture Decision: File Access

**Critical constraint:** A static HTML file served from one directory cannot `fetch()` files from arbitrary filesystem paths (e.g., `~/projects/viberr/v2/state.json`). The current prototype fetches `projects.json` from its own directory, which works, but can't reach into project directories.

**Solution:** A lightweight HTTP API server (single file, <200 lines) that:
- Serves the Command Center HTML
- Exposes `/api/projects` → reads `projects.json`
- Exposes `/api/project/:name/state` → reads that project's `state.json`
- Exposes `/api/project/:name/progress` → reads that project's `progress.txt` (last N entries)
- Exposes `/api/project/:name/tasks` → reads that project's `TASKS.md` (raw)
- Exposes `/api/agents` → reads active worker status (future: from OpenClaw sessions API)

**Why not symlinks?** Symlinks require manual setup per project and break if projects move. The API approach auto-discovers from projects.json.

**Why not a full backend?** Overkill. This is a glorified file reader. Single script, no dependencies beyond Node.js stdlib.

---

## Feature Breakdown

---

### Feature 1: Project Registry (projects.json)

**What:** Central JSON file listing all projects with metadata. The Command Center reads this to know what exists.

**Current state:** Already exists at `~/.openclaw/workspace/projects.json` with 10 projects.

**Schema:**
```json
{
  "projects": [
    {
      "name": "string (display name, unique)",
      "slug": "string (URL-safe identifier, derived from name if not set)",
      "path": "string (absolute filesystem path to project root)",
      "status": "active | paused | complete | archived",
      "type": "product | campaign | research | ops",
      "links": {
        "repo": "URL (optional)",
        "live": "URL (optional)",
        "api": "URL (optional)",
        "dashboard": "URL (optional)"
      },
      "notes": "string (one-line description)",
      "created": "YYYY-MM-DD",
      "lastActive": "YYYY-MM-DD",
      "port": "number (optional — if project has its own dashboard server)"
    }
  ]
}
```

**Happy path:** Command Center starts → fetches `/api/projects` → gets list → renders tabs and cards.

**Edge cases:**
- Project path doesn't exist on disk → Show project card with ⚠️ "Directory not found" badge. Don't crash.
- Project has no state.json → Show project card with "Not migrated" badge. Link to migration guide.
- Duplicate project names → Undefined behavior. **Requirement: names must be unique.** API should warn on duplicates.
- projects.json is malformed → API returns 500 with error message. Dashboard shows "Failed to load projects" with retry button.
- projects.json doesn't exist → API returns empty project list. Dashboard shows "No projects registered" with setup instructions.
- New project added while dashboard is open → Next poll cycle picks it up (polling every 10s).

**Error states:**
- File read permission denied → API returns 403-equivalent error → Dashboard shows error banner
- JSON parse error → API returns 500 with parse error details → Dashboard shows "Registry corrupted"

**Acceptance criteria:**
- [ ] All 10 current projects from existing projects.json are loaded and displayed
- [ ] Adding a new entry to projects.json appears in the dashboard within 15 seconds (next poll)
- [ ] Removing a project from projects.json removes it from dashboard within 15 seconds
- [ ] Project with nonexistent path shows warning indicator, does not crash the dashboard
- [ ] Project with missing state.json shows "not migrated" indicator

---

### Feature 2: API Server

**What:** Lightweight HTTP server that serves the Command Center and proxies filesystem reads.

**Why:** Browser security prevents fetching files from arbitrary filesystem paths. We need an HTTP layer.

**Tech:** Node.js (no dependencies) OR Python 3 (no dependencies). Single file. <200 lines.

**Endpoints:**

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/` | Serve command-center.html | HTML |
| GET | `/api/projects` | Read projects.json | JSON |
| GET | `/api/project/:slug/state` | Read project's state.json | JSON |
| GET | `/api/project/:slug/progress` | Read project's progress.txt (last 50 entries) | JSON `{ entries: string[] }` |
| GET | `/api/project/:slug/tasks` | Read project's TASKS.md raw content | JSON `{ content: string }` |
| GET | `/api/overview` | Aggregated overview data (computed) | JSON |

**`/api/overview` response shape:**
```json
{
  "totalProjects": 10,
  "activeProjects": 5,
  "pausedProjects": 3,
  "completeProjects": 2,
  "needsAttention": [
    { "project": "Viberr v2", "reason": "3 failed tasks", "severity": "high" },
    { "project": "DeFi Tools", "reason": "No activity in 8 days", "severity": "medium" }
  ],
  "recentActivity": [
    { "project": "Viberr v2", "message": "Task C-004 completed", "time": "2026-02-09T08:30:00Z" }
  ],
  "crossProjectTasks": {
    "content": [ /* all content/marketing tasks across all projects */ ],
    "research": [ /* all research tasks across all projects */ ]
  }
}
```

**Happy path:** Server starts on configured port → binds to 0.0.0.0 → serves HTML and API → dashboard loads.

**Edge cases:**
- Port already in use → Print clear error message with the port number and exit. Don't silently fail.
- Project slug doesn't match any project → Return 404 `{ error: "Project not found" }`
- state.json doesn't exist for requested project → Return 404 `{ error: "No state.json — project may not be migrated" }`
- progress.txt doesn't exist → Return `{ entries: [] }` (empty is fine, not an error)
- progress.txt is very large (>1MB) → Only return last 50 entries (parse by `===...===` delimiters)
- Concurrent requests → Must handle concurrent reads without corruption (fs reads are safe, but document this)
- Server crashes → Must be restartable with same command. No persistent state.

**Error states:**
- projects.json unreadable → `/api/projects` returns 500 with message
- Individual project file unreadable → That endpoint returns 500, other projects unaffected
- Disk full (can't write) → N/A, server only reads

**Acceptance criteria:**
- [ ] `node server.js` (or `python3 server.py`) starts server on port 3400 (configurable via CLI arg or env var)
- [ ] Server binds to 0.0.0.0 (verified by accessing from another device on Tailscale)
- [ ] `GET /` returns command-center.html
- [ ] `GET /api/projects` returns valid JSON matching projects.json contents
- [ ] `GET /api/project/viberr-v2/state` returns Viberr's state.json (or 404 if not migrated yet)
- [ ] `GET /api/project/nonexistent/state` returns 404 with error message
- [ ] `GET /api/overview` returns aggregated data from all projects
- [ ] Server handles 10 concurrent requests without errors
- [ ] Server restarts cleanly after being killed
- [ ] No npm install or pip install required — stdlib only
- [ ] Total server code is <300 lines

---

### Feature 3: Overview Tab (Morning Dashboard)

**What:** The default landing view. Answers: "What happened? What's active? What needs attention?"

**Why:** This is what Deadly opens first thing in the morning. It must give a complete picture in <10 seconds of reading.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  [5] Active   [3] Paused   [2] Complete   [10] Total        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️ NEEDS ATTENTION (3)                                      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🔴 Viberr v2 — 3 failed tasks (C-004, B-002, B-005)     ││
│  │ 🟡 DeFi Tools — No activity in 8 days                   ││
│  │ 🟡 Blob Social — 2 blocked tasks waiting on dependency  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  📊 PROJECT STATUS                                           │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Viberr v2      ████████████░░░░  75%  12/16 tasks       ││
│  │ Blob Social    ████░░░░░░░░░░░░  25%   4/16 tasks       ││
│  │ DeFi Tools     ██░░░░░░░░░░░░░░  12%   2/16 tasks       ││
│  │ 0xClaw Dash    ░░░░░░░░░░░░░░░░   0%   not migrated     ││
│  │ Clawstr Dash   ░░░░░░░░░░░░░░░░   0%   not migrated     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  📝 RECENT ACTIVITY (last 24h)                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 09:30 Viberr v2 — Task C-004 completed ✅                ││
│  │ 09:15 Viberr v2 — Task B-002 failed ❌ (retry 2/3)      ││
│  │ 08:00 DeFi Tools — Sprint 1 started                     ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**"Needs Attention" logic:**
| Condition | Severity | Display |
|-----------|----------|---------|
| Project has ≥1 failed (❌) task | 🔴 high | "X failed tasks (IDs)" |
| Project has tasks blocked >24h | 🟡 medium | "X blocked tasks" |
| Active project with no state.json update in >7 days | 🟡 medium | "No activity in X days" |
| Active project with no state.json at all | 🟠 medium | "Not migrated to orchestrator" |
| All tasks done but project still marked "active" | 🔵 info | "All tasks complete — mark as done?" |

**Happy path:** Page loads → fetches `/api/overview` → renders summary stats, attention items, project progress bars, and activity feed.

**Edge cases:**
- No projects have state.json yet (fresh install) → Show "No project data yet. Migrate your first project to see it here." with link to migration guide.
- All projects are complete/paused → "Needs Attention" section shows "Nothing needs attention 🎉" instead of being empty.
- A project has 0 tasks in state.json → Show "0/0 tasks" with empty progress bar. Don't divide by zero.
- Activity feed has no entries → Show "No recent activity" placeholder.
- 50+ projects registered → Page must still render in <2s. Progress bars should be compact. Consider pagination or "show top 10 active" with expand.

**Error states:**
- `/api/overview` fails → Show error banner "Failed to load overview data. Retrying..." with auto-retry every 10s.
- Partial data (some projects load, some fail) → Show loaded projects normally, show failed ones with error indicator.

**Acceptance criteria:**
- [ ] Summary stats (active/paused/complete/total) are accurate and match projects.json
- [ ] "Needs Attention" section appears when any project has failed, blocked, or stale tasks
- [ ] "Needs Attention" section shows "Nothing needs attention" when everything is healthy
- [ ] Each active project shows a progress bar with done/total task count
- [ ] Progress bar percentage is calculated correctly (done ÷ total × 100, handle 0/0)
- [ ] Projects without state.json show "Not migrated" instead of a progress bar
- [ ] Recent activity shows entries from the last 24 hours across all projects
- [ ] Clicking a project card navigates to the Projects tab with that project selected
- [ ] Data refreshes every 10 seconds without full page reload
- [ ] Renders correctly on mobile (375px width) — single column layout

---

### Feature 4: Projects Tab

**What:** Per-project drill-down. Click a project → see its full orchestrator dashboard (milestones, kanban, progress log).

**Why:** After the overview tells you what needs attention, you need to dig into specific projects.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  [Viberr v2] [Blob Social] [DeFi Tools] [0xClaw] [Clawstr] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──── Embedded project dashboard ─────────────────────────┐│
│  │                                                          ││
│  │  (Full dashboard.html content for selected project)      ││
│  │  - Milestones view (default)                             ││
│  │  - Kanban view                                           ││
│  │  - Progress log view                                     ││
│  │  - Stats bar (total/done/in-progress/testing/failed)     ││
│  │  - Active workers sidebar                                ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Implementation approach:** Rather than iframes (which have CORS and styling issues), **inline render** the project dashboard. The Command Center already knows the state.json shape — it renders the same milestone/kanban/progress views that dashboard.html does, but parameterized by which project is selected.

**Sub-tabs along top:** One per project (all statuses, not just active). Active projects first, then paused, then complete. Color-coded dots by status.

**Project dashboard views (same as existing dashboard.html):**
1. **Milestones** (default) — Collapsible milestone cards with progress bars and nested task lists
2. **Kanban** — 4-column board: Todo | In Progress | Testing | Done
3. **Progress Log** — Rendered progress.txt entries, newest first

**Project info header:** Name, type badge, status badge, links (repo, live, API), last active date.

**Happy path:** Click project tab → state.json loads → dashboard renders with milestones view → user can toggle kanban/progress views.

**Edge cases:**
- Project has no state.json → Show "This project hasn't been migrated to orchestrator format yet." with migration instructions.
- Project has state.json but 0 tasks → Show empty milestones with "No tasks defined yet."
- Project has state.json but 0 milestones → Show flat task list instead of milestone grouping.
- Project directory was deleted → Show "Project directory not found at [path]." Red error state.
- Project has very large state.json (>500 tasks) → Must still render in <2s. Virtual scrolling not required but DOM performance must be acceptable. Consider collapsing milestones by default if >50 tasks.
- Tab overflow (>8 projects) → Horizontal scroll on project tabs, or wrap to second line. Must remain usable.
- Deep linking — User should be able to bookmark `/#/projects/viberr-v2` and land on that project. URL hash routing.

**Error states:**
- state.json fetch fails for selected project → Show error with retry button in the dashboard area. Other project tabs still work.
- state.json is malformed → Show "Invalid state data" error. Don't render partial broken UI.

**Acceptance criteria:**
- [ ] All registered projects appear as sub-tabs
- [ ] Active projects appear first, sorted by lastActive descending
- [ ] Clicking a project tab loads its state.json and renders the dashboard
- [ ] Milestones view shows collapsible milestone cards with progress bars
- [ ] Kanban view shows 4-column board with task cards
- [ ] Progress log view shows progress.txt entries in reverse chronological order
- [ ] Project with no state.json shows migration prompt instead of broken UI
- [ ] URL hash updates when switching projects (e.g., `#/projects/viberr-v2`)
- [ ] Loading URL with hash pre-selects the correct project and tab
- [ ] Horizontal scroll or wrap handles >8 project tabs without breaking layout
- [ ] Project type badge is visible (product/campaign/research/ops)
- [ ] External links (repo, live, API) open in new tab

---

### Feature 5: Content Tab (Cross-Project)

**What:** Aggregated view of all tasks with type `content` or `marketing` across every project.

**Why:** Content tasks span projects — a blog post about Viberr, a tweet thread about DeFi Tools, docs for Blob Social. Seeing them in one place prevents things from falling through cracks.

**Data source:** Parses every project's state.json, filters tasks where `type === "content" || type === "marketing"`.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  CONTENT PIPELINE                                  [filter ▾]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Todo (4)                                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ [Viberr v2]  Write launch blog post         content      ││
│  │ [DeFi Tools] Twitter thread: momentum scan  marketing    ││
│  │ [Blob Social] Documentation: API reference  content      ││
│  │ [Viberr v2]  Product hunt listing copy      marketing    ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  In Progress (1)                                             │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ [Viberr v2]  Landing page copy              content  🔄  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  Done (2)                                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ [Blob Social] README + pitch deck           content  ✅  ││
│  │ [DeFi Tools]  CLI documentation             content  ✅  ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Grouping:** By status (Todo → In Progress → Testing → Done), with project name as a tag on each card.

**Filters:**
- By project (dropdown, multi-select)
- By type (content vs marketing)
- By status (show/hide done)

**Happy path:** Tab loads → fetches all projects' state.json → filters content/marketing tasks → renders grouped by status.

**Edge cases:**
- No content tasks exist across any project → Show "No content tasks found. Add tasks with type 'content' or 'marketing' to any project's TASKS.md."
- Project has tasks but state.json is stale → Tasks shown reflect state.json contents. Staleness indicator: "Data from 3 days ago" next to project name.
- 100+ content tasks → Must render without lag. Consider showing only non-done tasks by default, expandable "Show completed" section.
- Task has no project attribution (shouldn't happen but defensive) → Show as "[Unknown project]".

**Error states:**
- Some projects' state.json fail to load → Show tasks from loaded projects. Show warning: "Could not load data from: [project names]"

**Acceptance criteria:**
- [ ] All content/marketing tasks from all projects appear in this view
- [ ] Tasks are grouped by status (Todo, In Progress, Testing, Done)
- [ ] Each task shows its source project name as a badge/tag
- [ ] Project filter dropdown works and persists during the session
- [ ] Type filter (content vs marketing) works
- [ ] "Hide completed" toggle works
- [ ] Empty state message shows when no content tasks exist
- [ ] Clicking a task's project badge navigates to that project in the Projects tab

---

### Feature 6: Research Tab (Cross-Project)

**What:** Same as Content tab but for tasks with type `research` or `analysis`.

**Why:** Research tasks (competitor analysis, market research, technical spikes) span projects and benefit from a unified view.

**Implementation:** Identical to Content tab but filters on `type === "research" || type === "analysis"`.

**Acceptance criteria:**
- [ ] All research/analysis tasks from all projects appear in this view
- [ ] Same grouping, filtering, and navigation as Content tab
- [ ] Empty state shows appropriate message for research context

---

### Feature 7: Agents Tab

**What:** Shows running agents/workers, their status, what they're working on. Placeholder for future persistent department agents.

**Why:** Gives visibility into what's actually executing right now.

**Current reality:** Workers are ephemeral (spawned per-task, terminated on completion). There's no persistent API to query "what workers are running." This tab is therefore **partially a placeholder**.

**What we CAN show now:**
- Static agent card for "0xClaw" (main orchestrator) — always shown as active
- Worker cards based on state.json `workers` array from each project (if populated)
- "Department agents" section — placeholder cards for future Engineering, Content, Research, QA agents

**What we show in future (v2):**
- Live worker status from OpenClaw sessions API
- Worker logs/output streaming
- Worker spawn/kill controls

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  AGENTS                                                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🟢 0xClaw — Lead Orchestrator                               │
│     Managing all projects. Always active.                    │
│                                                              │
│  ACTIVE WORKERS                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🟢 Code Worker 1 — Viberr v2 / C-004                    ││
│  │ 🟢 Research Worker — DeFi Tools / R-001                  ││
│  │ 🟡 Supervisor — Viberr v2 (watching)                     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  🔮 DEPARTMENT AGENTS (Coming Soon)                          │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ ⬜ Engineering — Persistent code agent                    ││
│  │ ⬜ Content — Persistent writing agent                     ││
│  │ ⬜ Research — Persistent analysis agent                   ││
│  │ ⬜ QA — Persistent testing agent                          ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Edge cases:**
- No workers running → Show "No active workers" under Active Workers section
- Worker data in state.json is stale (worker finished but state.json not updated) → Show as-is. Staleness is a data generation problem, not a display problem.

**Acceptance criteria:**
- [ ] 0xClaw agent card always shows as active
- [ ] Active workers from all projects' state.json `workers` arrays are displayed
- [ ] Department agents placeholder section is visible with "Coming Soon" label
- [ ] Worker cards show: name, status dot (green/yellow/gray), project, current task ID

---

### Feature 8: Navigation & Routing

**What:** Tab switching, URL hash routing, keyboard navigation.

**URL structure:**
- `#/overview` — Overview tab (default)
- `#/projects` — Projects tab (no project selected)
- `#/projects/:slug` — Projects tab with specific project
- `#/content` — Content tab
- `#/research` — Research tab
- `#/agents` — Agents tab

**Happy path:** User navigates via tabs → URL hash updates → browser back/forward works → bookmarkable.

**Edge cases:**
- Invalid hash (e.g., `#/nonexistent`) → Redirect to `#/overview`
- Hash references deleted project → Show "Project not found" in projects tab
- No hash → Default to `#/overview`

**Acceptance criteria:**
- [ ] Each tab has a unique URL hash
- [ ] Browser back/forward navigates between previously viewed tabs
- [ ] Direct URL access (pasting URL with hash) loads correct tab and project
- [ ] Invalid routes fall back to Overview

---

### Feature 9: Auto-Refresh & Polling

**What:** Dashboard auto-updates without manual page reload.

**Polling strategy:**
- `/api/overview` — every 10 seconds
- `/api/project/:slug/state` (for selected project) — every 5 seconds
- `/api/projects` (registry) — every 30 seconds
- Cross-project task aggregation (Content/Research tabs) — every 15 seconds

**Why different intervals?** The selected project should feel live. Overview is glanceable. Registry changes rarely.

**Edge cases:**
- Server goes down during polling → Show subtle "Connection lost" indicator in header. Continue retrying. Don't spam error toasts.
- Server comes back → Clear the indicator. Resume normal polling. Don't require page reload.
- Tab is backgrounded (browser tab not visible) → Reduce polling to every 60s to save resources. Resume normal rate when tab becomes visible (use `document.visibilitychange` event).
- Multiple browser tabs open → Each polls independently. This is fine — it's read-only.

**Acceptance criteria:**
- [ ] Data updates automatically without page reload
- [ ] Connection loss shows indicator in header area
- [ ] Connection recovery clears the indicator
- [ ] Backgrounded tab reduces poll frequency
- [ ] Foregrounded tab resumes normal poll frequency within 5 seconds
- [ ] No visible flicker or scroll position reset on data refresh

---

### Feature 10: Responsive Design

**What:** Dashboard must work on desktop (1440px+), tablet (768px), and mobile (375px).

**Breakpoints:**
- **Desktop (>1024px):** Full layout with sidebar
- **Tablet (768-1024px):** Sidebar collapses to bottom or modal
- **Mobile (<768px):** Single column, hamburger menu for tabs, simplified cards

**Mobile-specific:**
- Project tabs become a dropdown selector instead of horizontal tabs
- Kanban view switches to stacked columns (vertical scroll) instead of 4-column grid
- Progress bars use full width
- Touch targets minimum 44px

**Acceptance criteria:**
- [ ] Dashboard is usable on 375px wide viewport (iPhone SE)
- [ ] No horizontal scrolling on mobile (except within kanban if needed)
- [ ] Tab navigation works on mobile (dropdown or hamburger)
- [ ] Touch targets are ≥44px
- [ ] Text is readable without zooming (minimum 13px body text)
- [ ] Cards stack vertically on mobile

---

### Feature 11: Visual Design System

**What:** Consistent dark theme matching existing dashboard.html aesthetic.

**Design tokens (already established):**
```css
--bg: #0d1117        /* Page background */
--surface: #161b22   /* Card background */
--surface2: #1c2128  /* Elevated surface */
--border: #30363d    /* Borders */
--text: #e6edf3      /* Primary text */
--text-dim: #8b949e  /* Secondary text */
--text-bright: #f0f6fc /* Emphasized text */
--blue: #58a6ff      /* Links, active states */
--green: #3fb950     /* Success, done, active */
--yellow: #d29922    /* Warning, paused, testing */
--red: #f85149       /* Error, failed */
--purple: #bc8cff    /* Special (agents, blocked) */
--cyan: #39d353      /* Accent */
--orange: #d18616    /* Secondary warning */
```

**Typography:** System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Monospace for task IDs and code: `'SF Mono', 'Fira Code', monospace`.

**Status color mapping (consistent everywhere):**
| Status | Color | Icon |
|--------|-------|------|
| Active / In Progress | Blue | 🔄 |
| Done / Complete | Green | ✅ |
| Paused / Testing | Yellow | 🧪 |
| Failed | Red | ❌ |
| Blocked | Purple | 🚫 |
| Archived / Todo | Gray | ⬜ |

**Acceptance criteria:**
- [ ] All color tokens match the values above
- [ ] No hardcoded colors outside the design token system
- [ ] Status colors are consistent across all tabs and views
- [ ] Font rendering is crisp on retina displays
- [ ] Dark theme only (no light mode needed)

---

## Part 2: Project Migration

### Feature 12: Active Project Migration

**What:** Migrate active projects (Viberr v2, Blob Social, DeFi Tools, 0xClaw Dashboard, Clawstr Dashboard) to the orchestrator format.

**What "migrated" means for each project:**
1. `PRD.md` exists — generated from existing codebase analysis
2. `TASKS.md` exists — generated from PRD with proper milestone structure
3. `state.json` exists — generated from TASKS.md
4. `progress.txt` exists — initialized with migration entry
5. `dashboard.html` exists — copied from orchestrator skill
6. Git initialized (if not already) with initial commit

**Migration approach per project:**

**Viberr v2** — Already partially migrated. Has TASKS.md and PRD.md. Needs:
- state.json generated from existing TASKS.md
- progress.txt initialized
- dashboard.html copied
- TASKS.md reformatted to match orchestrator format (milestones, pass/fail criteria) if not already matching

**Blob Social** — Has codebase. Needs:
- PRD.md generated by analyzing existing code + README
- TASKS.md generated from PRD (remaining work to ship)
- state.json, progress.txt, dashboard.html

**DeFi Tools** — Has codebase. Needs:
- PRD.md generated by analyzing existing code + README
- TASKS.md generated from PRD
- state.json, progress.txt, dashboard.html

**0xClaw Dashboard** — Has codebase. Needs:
- PRD.md (simple — it's an ops dashboard)
- TASKS.md
- state.json, progress.txt, dashboard.html

**Clawstr Dashboard** — Has codebase. Needs:
- PRD.md
- TASKS.md
- state.json, progress.txt, dashboard.html

**Edge cases:**
- Project already has TASKS.md in different format (Viberr) → Convert to orchestrator format, preserving existing task statuses
- Project has no README or docs → PRD must be generated purely from code analysis
- Project has incomplete/broken code → PRD should note current state honestly, TASKS.md should include fix tasks
- Git repo has uncommitted changes → Commit them as "pre-migration snapshot" before starting migration

**Acceptance criteria (per project):**
- [ ] PRD.md exists and accurately describes the project
- [ ] TASKS.md exists with milestones grouped by user value
- [ ] Each task has type, status, pass criteria, and fail criteria
- [ ] state.json is valid and parseable by the dashboard
- [ ] progress.txt exists with initial migration entry
- [ ] dashboard.html exists and renders when served
- [ ] Git is initialized with all files committed

---

### Feature 13: Inactive Project Registration

**What:** Completed and paused projects get registered in projects.json with accurate metadata but don't need full migration.

**Projects:**
- Proof of Intelligence — complete
- Agent Trust Oracle — complete
- Polymarket Edge — paused
- Security Research — paused
- Micro SaaS — paused

**Plus unregistered directories** (found in ~/projects/ but not in projects.json):
- agent-api-services
- builder-quest-submission
- knowledge
- proof-of-agent
- viberr-jobs
- viberr-test-builds
- security-audit-service

**For each:** Add to projects.json with: name, path, status (determine from git log recency and directory contents), type, notes, created date, lastActive date.

**Acceptance criteria:**
- [ ] All 17 project directories at ~/projects/ are accounted for in projects.json
- [ ] Each entry has accurate status, type, and dates
- [ ] No duplicate entries
- [ ] Entries for completed projects have status "complete"
- [ ] Entries for abandoned/old projects have status "archived"

---

## Technical Architecture

### Stack
- **Frontend:** Single HTML file with inline CSS and JS. No build step. No framework. Vanilla JS.
- **Backend:** Single-file HTTP server. Node.js (preferred — already installed) or Python 3. No dependencies.
- **Data:** JSON files on disk (projects.json, state.json per project). Markdown files (TASKS.md, progress.txt).
- **Hosting:** Local machine, accessed via Tailscale. Bind to `0.0.0.0`.

### File Structure
```
~/projects/command-center/
├── PRD.md                    # This document
├── TASKS.md                  # Task breakdown
├── progress.txt              # Append-only log
├── state.json                # Dashboard data for this project
├── server.js                 # API server (single file, <300 lines)
├── index.html                # Command Center dashboard (single file)
├── dashboard.html            # Per-project dashboard (copied from orchestrator)
└── README.md                 # Setup instructions
```

### Data Flow
```
projects.json ──────────────┐
                             │
project-1/state.json ───────┤
project-1/progress.txt ─────┤
project-2/state.json ───────┼──► server.js ──► index.html (browser)
project-2/progress.txt ─────┤       ▲              │
...                          │       │              │
                             │     HTTP          fetch()
                             │   (0.0.0.0:3400)    │
                             └─────────────────────┘
```

### state.json Schema (per project)
```json
{
  "project": "string",
  "type": "product | campaign | research | ops",
  "status": "active | paused | complete | archived",
  "lastUpdated": "ISO 8601 timestamp",
  "progress": {
    "total": 0,
    "done": 0,
    "inProgress": 0,
    "testing": 0,
    "failed": 0,
    "blocked": 0,
    "todo": 0
  },
  "phases": [
    {
      "name": "string",
      "status": "active | complete | pending",
      "tasks": 0,
      "done": 0
    }
  ],
  "milestones": [
    {
      "name": "string",
      "tasks": ["A-001", "A-002"]
    }
  ],
  "tasks": [
    {
      "id": "A-001",
      "title": "string",
      "type": "code | research | content | marketing | ops | design | analysis",
      "status": "todo | in_progress | testing | done | failed | blocked",
      "milestone": "M1: Name",
      "assignee": "string (optional)",
      "depends": ["A-000"] 
    }
  ],
  "workers": [
    {
      "name": "string",
      "status": "active | idle | offline",
      "task": "A-001 (optional)"
    }
  ],
  "activity": [
    {
      "type": "spawn | complete | fail | audit | phase | start | verify",
      "message": "string",
      "time": "ISO 8601"
    }
  ]
}
```

---

## Security Considerations

- **Authentication:** None. This is on a private Tailscale network. Access is controlled by Tailscale ACLs.
- **Authorization:** Read-only dashboard. No write endpoints. No state mutation from the UI.
- **File access:** Server should ONLY serve files within registered project paths. Do not allow path traversal (e.g., `/api/project/../../etc/passwd`). Validate that resolved path starts with a registered project path.
- **Secrets:** No secrets in state.json or progress.txt. API keys, passwords, wallet keys must never appear in dashboard-visible files.
- **CORS:** Not needed — same-origin serving. If added later, restrict to Tailscale hostname only.

**Path traversal prevention:** The API server MUST:
1. Resolve the project slug to a path via projects.json lookup (not by string concatenation)
2. Verify the resolved file path starts with the project's registered path
3. Only serve `.json`, `.txt`, `.md` files (whitelist extensions)

**Acceptance criteria:**
- [ ] `/api/project/../../etc/passwd` returns 404, not file contents
- [ ] Server only reads files within registered project directories
- [ ] No write endpoints exist
- [ ] No secrets are exposed in any API response

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Initial page load (HTML + first data) | <2s on Tailscale |
| API response (`/api/overview`) | <500ms |
| API response (`/api/project/:slug/state`) | <100ms |
| DOM render after data fetch | <200ms |
| Memory usage (browser tab) | <100MB |
| Server memory usage | <50MB |
| Simultaneous projects rendered (overview) | 20 without degradation |

---

## Out of Scope

- **Task editing from UI** — TASKS.md is the source of truth, edited by agents/humans in files. Dashboard is read-only.
- **User authentication** — Tailscale handles network access. No login screen.
- **Real-time updates (WebSocket)** — Polling is sufficient. WebSocket adds complexity for marginal benefit.
- **Persistent database** — Files on disk are the database. No SQLite, no Redis.
- **Light mode** — Dark theme only.
- **Multi-user collaboration** — Single user (Deadly) accessing from multiple devices.
- **Task dependencies visualization** — No DAG rendering. Dependencies are in TASKS.md but not visually drawn.
- **Worker management from UI** — Can't spawn/kill workers from dashboard. That's the orchestrator's job.
- **Notifications** — No push notifications, email alerts, etc. Dashboard is pull-based.
- **Historical analytics** — No graphs of "tasks completed per week." Future feature.

---

## Open Questions

1. **Port number** — What port should the Command Center server run on? Suggest 3400 (not conflicting with existing services). Impact: server config, Tailscale access URL.

2. **Dashboard embedding** — Should each project's detailed view be rendered inline (shared JS) or loaded via iframe (isolated but heavier)? Current recommendation: inline. Impact: code architecture, CSS isolation.

3. **TASKS.md parsing** — The API server needs to parse TASKS.md to extract task types for cross-project views. Should this be done server-side (Node.js parses markdown) or should we require state.json to always be up-to-date and only use state.json? Recommendation: Use state.json only — it's the generated representation. But this means state.json must be regenerated whenever TASKS.md changes. Impact: data freshness, migration requirements.

4. **Unregistered project directories** — 7 directories exist at ~/projects/ that aren't in projects.json. Should we auto-discover (scan ~/projects/) or only show registered projects? Recommendation: Only registered. Auto-discover is surprising. Impact: migration scope.

5. **progress.txt parsing** — progress.txt uses `===...===` delimiters. The server needs to parse this into structured entries. What's the exact delimiter format? From SKILL.md examples, it's 80 `=` characters. Impact: parser implementation.

6. **Project dashboard ports** — If individual projects have their own dashboard servers (e.g., Viberr on :3350), should the Command Center link to them or embed them? Recommendation: Link, don't embed. Impact: project tab implementation.

7. **Startup automation** — Should the Command Center server auto-start on boot (launchd/systemd) or be manually started? Impact: ops, reliability.

---

## Timeline Estimate

### Phase 1: Foundation (4-6 hours)
- API server implementation
- Command Center HTML shell (tabs, routing, polling)
- Overview tab (basic — stats + project list)
- Connect to existing projects.json

### Phase 2: Project Migration (6-8 hours)
- Migrate Viberr v2 (already partial — fastest)
- Migrate Blob Social
- Migrate DeFi Tools
- Migrate 0xClaw Dashboard
- Migrate Clawstr Dashboard
- Register all remaining projects in projects.json

### Phase 3: Full Dashboard (4-6 hours)
- Projects tab with inline dashboard rendering
- Content tab (cross-project aggregation)
- Research tab (cross-project aggregation)
- Agents tab (placeholder + worker data)

### Phase 4: Polish (2-3 hours)
- Responsive design pass
- Error handling and edge cases
- Connection loss/recovery
- URL hash routing
- Mobile testing

**Total estimate: 16-23 hours of agent work**

---

## Appendix A: Existing File Inventory

| Project | PRD.md | TASKS.md | state.json | progress.txt | dashboard.html | Git |
|---------|--------|----------|------------|--------------|----------------|-----|
| Viberr v2 | ✅ | ✅ (needs reformat) | ❌ | ❌ | ✅ | ✅ |
| Blob Social | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| DeFi Tools | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 0xClaw Dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ? |
| Clawstr Dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ? |
| Command Center | This doc | ❌ | ❌ | ❌ | Prototype | ❌ |

## Appendix B: projects.json Current vs Target

**Current:** 10 projects registered
**Target:** All 17+ directories at ~/projects/ registered (active ones migrated, others just metadata)

New entries needed:
- agent-api-services
- builder-quest-submission
- knowledge (may not be a "project" — could be excluded)
- proof-of-agent
- viberr-jobs
- viberr-test-builds
- security-audit-service
- command-center (this project)
