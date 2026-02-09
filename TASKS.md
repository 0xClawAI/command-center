# TASKS.md — Command Center

> Last updated: 2026-02-09T10:08:00-08:00
> Status: Planning
> Progress: 9/42 tasks complete

---

## Milestones

- **M1: API Server Running** — Tasks: A-001, A-002, A-003, A-004
- **M2: Overview Dashboard Live** — Tasks: A-005, A-006, A-007, A-008, A-009
- **M3: Projects Migrated** — Tasks: B-001, B-002, B-003, B-004, B-005, B-006
- **M4: Full Dashboard** — Tasks: C-001, C-002, C-003, C-004, C-005, C-006, C-008
- **M5: Polish & Ship** — Tasks: D-001, D-002, D-003, D-004, D-005, D-006, D-007
- **M6: Phase 1 Review** — Tasks: A-010
- **M7: Phase 2 Review** — Tasks: B-007
- **M8: Phase 3 Review** — Tasks: C-009
- **M9: Final Review** — Tasks: D-008

---

## Phase 1: Foundation
**Goal:** API server serves data, Overview tab renders with real projects.json data
**Exit when:** All Phase 1 tasks pass supervisor verification

### A-001: API Server — Core HTTP + Static Serving
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** none
- **Pass criteria:**
  - [x] File `server.js` exists at `~/projects/command-center/server.js`
  - [x] `node server.js` starts without errors and listens on port 3400
  - [x] Port is configurable via `PORT` env var (e.g., `PORT=4000 node server.js` listens on 4000)
  - [x] Server binds to `0.0.0.0` (verified: `lsof -i :3400` shows `*:3400`)
  - [x] `GET /` returns contents of `index.html` with `Content-Type: text/html`
  - [x] Server uses only Node.js stdlib (no `node_modules/` directory exists)
  - [x] Server code is <300 lines (verified: `wc -l server.js`)
  - [x] If port is already in use, server prints error message containing the port number and exits with non-zero code
- **Fail criteria:**
  - Requires `npm install` or any external dependency
  - Server silently fails when port is taken
  - Binds to 127.0.0.1 instead of 0.0.0.0
  - Over 300 lines
- **Files:** `~/projects/command-center/server.js`
- **Notes:** Node.js preferred since it's already installed

### A-002: API Server — Project Endpoints
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** A-001
- **Pass criteria:**
  - [x] `GET /api/projects` returns JSON array matching contents of `~/.openclaw/workspace/projects.json`
  - [x] `GET /api/project/viberr-v2/state` returns JSON contents of Viberr's `state.json` (or 404 with `{"error":"..."}` if file missing)
  - [x] `GET /api/project/viberr-v2/progress` returns `{"entries":[...]}` from `progress.txt` (or `{"entries":[]}` if missing)
  - [x] `GET /api/project/viberr-v2/tasks` returns `{"content":"..."}` with raw TASKS.md string (or 404 if missing)
  - [x] `GET /api/project/nonexistent-slug/state` returns HTTP 404 with `{"error":"Project not found"}`
  - [x] progress.txt parsing splits on lines of 80+ `=` characters; only last 50 entries returned
  - [x] Malformed `projects.json` returns HTTP 500 with error message (test: temporarily corrupt the file)
- **Fail criteria:**
  - Returns HTML or stack traces instead of JSON error responses
  - Crashes on missing files instead of returning appropriate status codes
  - Returns all progress entries instead of last 50
- **Files:** `~/projects/command-center/server.js`
- **Notes:** Slug lookup via projects.json `slug` or derived from `name`

### A-003: API Server — Path Traversal Prevention
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** A-002
- **Pass criteria:**
  - [x] `GET /api/project/..%2F..%2Fetc%2Fpasswd/state` returns 404, NOT file contents
  - [x] `GET /api/project/../../etc/passwd/state` returns 404
  - [x] Server resolves slug to path ONLY via projects.json lookup (not string concatenation with user input)
  - [x] Only `.json`, `.txt`, `.md` file extensions are served
  - [x] Resolved file path is verified to start with the registered project path (using `path.resolve`)
- **Fail criteria:**
  - Any request returns contents of files outside registered project directories
  - Extension whitelist is missing (could serve arbitrary files)
  - Path validation uses string comparison instead of resolved absolute paths
- **Files:** `~/projects/command-center/server.js`
- **Notes:** Security-critical. Test manually with curl.

### A-004: API Server — Overview Endpoint
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** A-002
- **Pass criteria:**
  - [x] `GET /api/overview` returns JSON matching the schema in PRD (totalProjects, activeProjects, pausedProjects, completeProjects, needsAttention, recentActivity, crossProjectTasks)
  - [x] `totalProjects` equals number of entries in projects.json
  - [x] `activeProjects` count matches entries with `status: "active"`
  - [x] `needsAttention` includes projects with failed tasks (severity: high)
  - [x] `needsAttention` includes active projects with no state.json update in >7 days (severity: medium)
  - [x] `needsAttention` includes active projects with no state.json at all (severity: medium)
  - [x] `crossProjectTasks.content` contains all tasks with type `content` or `marketing` across all projects
  - [x] `crossProjectTasks.research` contains all tasks with type `research` or `analysis` across all projects
  - [x] Response time <500ms (test: `time curl localhost:3400/api/overview`)
- **Fail criteria:**
  - Crashes if any single project's state.json is missing or invalid
  - Omits projects that lack state.json from the count
  - Takes >2s to respond
- **Files:** `~/projects/command-center/server.js`
- **Notes:** Must be resilient — partial data is OK, crashes are not

### A-005: HTML Shell — Tab Navigation & Routing
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** A-001
- **Pass criteria:**
  - [x] File `index.html` exists at `~/projects/command-center/index.html`
  - [x] Single HTML file with inline CSS and JS (no external files besides API calls)
  - [x] Five tabs visible: Overview, Projects, Content, Research, Agents
  - [x] Clicking a tab changes the visible content area and updates `location.hash`
  - [x] `#/overview` → Overview tab, `#/projects` → Projects tab, `#/content` → Content, `#/research` → Research, `#/agents` → Agents
  - [x] No hash or `#/` defaults to Overview
  - [x] Invalid hash (e.g., `#/garbage`) redirects to `#/overview`
  - [x] Browser back/forward navigates between previously viewed tabs
  - [x] Pasting URL with `#/content` directly loads Content tab
- **Fail criteria:**
  - Multiple HTML/CSS/JS files (must be single file)
  - Tabs require page reload to switch
  - Browser history doesn't work (can't go back)
  - Hash doesn't update on tab click
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Vanilla JS only. No frameworks.

### A-006: HTML Shell — Design System & Dark Theme
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** A-005
- **Pass criteria:**
  - [x] CSS custom properties defined: `--bg: #0d1117`, `--surface: #161b22`, `--surface2: #1c2128`, `--border: #30363d`, `--text: #e6edf3`, `--text-dim: #8b949e`, `--blue: #58a6ff`, `--green: #3fb950`, `--yellow: #d29922`, `--red: #f85149`, `--purple: #bc8cff`
  - [x] No hardcoded color values outside CSS custom properties (search: all `#` color codes appear only in `:root` block)
  - [x] Font stack is `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  - [x] Monospace font for task IDs: `'SF Mono', 'Fira Code', monospace`
  - [x] Status colors consistent: in_progress=blue, done=green, testing=yellow, failed=red, blocked=purple, todo=gray
- **Fail criteria:**
  - Hardcoded colors scattered through CSS
  - Light background anywhere
  - Inconsistent status colors (e.g., failed shows yellow in one place, red in another)
- **Files:** `~/projects/command-center/index.html`
- **Notes:** All colors from PRD design tokens section

### A-007: Overview Tab — Summary Stats & Project List
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** A-004, A-006
- **Pass criteria:**
  - [x] Top bar shows: Active count, Paused count, Complete count, Total count — matching `/api/overview` data
  - [x] Each active project shows progress bar with `done/total tasks` label
  - [x] Progress bar width = `(done / total) * 100%` — verified visually for at least 2 projects
  - [x] Projects with 0 total tasks show `0/0 tasks` with empty bar (no division by zero crash)
  - [x] Projects without state.json show "Not migrated" text instead of progress bar
  - [x] Clicking a project navigates to `#/projects/<slug>` (Projects tab with that project selected)
- **Fail criteria:**
  - Stats don't match actual projects.json data
  - Division by zero error when project has 0 tasks
  - Crash when a project has no state.json
  - Click on project does nothing
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### A-008: Overview Tab — Needs Attention Section
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** A-007
- **Pass criteria:**
  - [x] Section displays when `/api/overview` has non-empty `needsAttention` array
  - [x] Each attention item shows: severity icon (🔴 high, 🟡 medium, 🔵 info), project name, reason text
  - [x] Items sorted by severity: high → medium → info
  - [x] When `needsAttention` is empty, shows "Nothing needs attention 🎉" message
  - [x] Section is not rendered/hidden when all projects are healthy (displays the 🎉 message)
- **Fail criteria:**
  - Empty section with no message when nothing needs attention
  - Attention items unsorted
  - Section crashes when needsAttention is empty array
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### A-009: Overview Tab — Recent Activity Feed
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** A-007
- **Pass criteria:**
  - [x] Shows activity entries from `/api/overview` `recentActivity` array
  - [x] Each entry shows: time (HH:MM format), project name, message, status icon
  - [x] Entries sorted newest first
  - [x] When no activity exists, shows "No recent activity" placeholder
  - [x] Maximum 20 entries displayed (no infinite scroll needed)
- **Fail criteria:**
  - Shows oldest first
  - Crashes on empty activity array
  - No placeholder for empty state
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### A-010: Phase 1 Review
- **Type:** ops
- **Status:** ✅ done
- **Milestone:** M6
- **Depends:** A-001, A-002, A-003, A-004, A-005, A-006, A-007, A-008, A-009
- **Pass criteria:**
  - [ ] `node server.js` starts and serves dashboard at `http://0.0.0.0:3400/`
  - [ ] Dashboard loads in <2s (measured with browser devtools Network tab)
  - [ ] All 5 tabs navigate correctly with hash routing
  - [ ] Overview tab shows real data from projects.json
  - [ ] All A-xxx pass criteria verified and checked off
  - [ ] Accessible from Tailscale URL: `http://0xs-mac-mini.tailacc337.ts.net:3400/`
- **Fail criteria:**
  - Any A-xxx task has unchecked pass criteria
  - Dashboard not accessible over Tailscale
  - Page load >3s
- **Files:** All Phase 1 files
- **Notes:** Gate for proceeding to Phase 2

---

## Phase 2: Project Migration
**Goal:** 3 active projects migrated to orchestrator format, all ~/projects/ dirs registered
**Exit when:** All Phase 2 tasks pass supervisor verification

### B-001: Migrate Viberr v2
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [ ] `~/projects/viberr/v2/PRD.md` exists (already present — verify not deleted)
  - [ ] `~/projects/viberr/v2/TASKS.md` exists with orchestrator format: milestones, task IDs (X-NNN), pass criteria, fail criteria, type, status, depends fields
  - [ ] `~/projects/viberr/v2/state.json` exists, is valid JSON, and matches the state.json schema from PRD
  - [ ] `state.json` `progress.total` equals the number of tasks in TASKS.md
  - [ ] `state.json` task statuses match TASKS.md statuses (spot-check 3 random tasks)
  - [ ] `~/projects/viberr/v2/progress.txt` exists with at least one entry: the migration entry with timestamp
  - [ ] `~/projects/viberr/v2/dashboard.html` exists and renders without JS errors when opened
  - [ ] All files committed in git (`git -C ~/projects/viberr/v2 status` shows clean working tree)
- **Fail criteria:**
  - TASKS.md lacks milestones or pass/fail criteria
  - state.json task count doesn't match TASKS.md
  - Existing task statuses from pre-migration TASKS.md are lost (all reset to todo)
  - Git has uncommitted files
- **Files:** `~/projects/viberr/v2/{PRD.md,TASKS.md,state.json,progress.txt,dashboard.html}`
- **Notes:** Partially migrated already. Preserve existing task statuses during conversion.

### B-002: Migrate Blob Social
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [ ] `~/projects/blob-social/PRD.md` exists and accurately describes the project's purpose and features based on codebase analysis
  - [ ] `~/projects/blob-social/TASKS.md` exists with orchestrator format (milestones, IDs, pass/fail criteria)
  - [ ] `~/projects/blob-social/state.json` exists, is valid JSON, matches schema
  - [ ] `state.json` `progress.total` equals number of tasks in TASKS.md
  - [ ] `~/projects/blob-social/progress.txt` exists with migration entry
  - [ ] `~/projects/blob-social/dashboard.html` exists and renders without JS errors
  - [ ] PRD.md mentions current state of codebase honestly (what works, what's broken/incomplete)
  - [ ] All files committed in git
- **Fail criteria:**
  - PRD.md is generic/boilerplate and doesn't reflect actual codebase
  - TASKS.md tasks don't relate to actual remaining work needed
  - state.json is invalid JSON
  - Git has uncommitted files
- **Files:** `~/projects/blob-social/{PRD.md,TASKS.md,state.json,progress.txt,dashboard.html}`
- **Notes:** Needs PRD generated from code analysis

### B-003: Migrate DeFi Tools
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [ ] `~/projects/defi-tools/PRD.md` exists and accurately describes the project
  - [ ] `~/projects/defi-tools/TASKS.md` exists with orchestrator format
  - [ ] `~/projects/defi-tools/state.json` exists, is valid JSON, matches schema
  - [ ] `state.json` `progress.total` equals number of tasks in TASKS.md
  - [ ] `~/projects/defi-tools/progress.txt` exists with migration entry
  - [ ] `~/projects/defi-tools/dashboard.html` exists and renders without JS errors
  - [ ] All files committed in git
- **Fail criteria:**
  - PRD.md is generic/boilerplate
  - TASKS.md tasks don't relate to actual codebase
  - state.json is invalid JSON
  - Git has uncommitted files
- **Files:** `~/projects/defi-tools/{PRD.md,TASKS.md,state.json,progress.txt,dashboard.html}`
- **Notes:** Needs PRD generated from code analysis

### B-004: Register All ~/projects/ Directories
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [ ] Every directory in `~/projects/` has an entry in `~/.openclaw/workspace/projects.json` (verify: `ls ~/projects/ | wc -l` matches project count)
  - [ ] `command-center` project is registered with status `active` and correct path
  - [ ] Each entry has: name, path (absolute), status, type, notes, created, lastActive
  - [ ] No duplicate `name` values in projects.json (verify: `jq '.projects[].name' | sort | uniq -d` returns empty)
  - [ ] Completed projects have `status: "complete"` (proof-of-intelligence, agent-trust-oracle)
  - [ ] Paused projects have `status: "paused"` (polymarket-edge, security-research, micro-saas)
  - [ ] Old/abandoned projects have `status: "archived"`
  - [ ] `lastActive` dates are reasonable (based on git log or file modification times)
- **Fail criteria:**
  - Directories missing from projects.json
  - Duplicate names
  - All statuses set to same value without analysis
  - Invented dates that don't match git history
- **Files:** `~/.openclaw/workspace/projects.json`
- **Notes:** Check git logs for date accuracy. `knowledge/` dir may not qualify as a project — use judgment.

### B-005: Validate All state.json Files
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** B-001, B-002, B-003
- **Pass criteria:**
  - [ ] For each migrated project: `node -e "JSON.parse(require('fs').readFileSync('state.json'))"` succeeds without error
  - [ ] Each state.json has required fields: project, type, status, lastUpdated, progress, tasks
  - [ ] `progress.total` equals `tasks.length` in every state.json
  - [ ] `progress.done` equals count of tasks with `status: "done"` in tasks array
  - [ ] Every task has: id, title, type, status fields
  - [ ] No task has `status` value outside: todo, in_progress, testing, done, failed, blocked
- **Fail criteria:**
  - Any state.json fails JSON.parse
  - progress counts don't match task array
  - Tasks missing required fields
- **Files:** state.json in each migrated project
- **Notes:** Run automated validation script

### B-006: Validate Dashboard Renders with Migrated Data
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M3
- **Depends:** B-005, A-010
- **Pass criteria:**
  - [ ] Command Center overview shows all 3 migrated projects with progress bars (not "Not migrated")
  - [ ] Clicking each migrated project in Projects tab loads its state.json and renders milestones
  - [ ] Content tab shows content/marketing tasks from migrated projects (if any exist)
  - [ ] Research tab shows research/analysis tasks from migrated projects (if any exist)
  - [ ] No JS console errors when navigating through all tabs
- **Fail criteria:**
  - Any migrated project still shows "Not migrated"
  - JS errors in browser console
  - Project tab shows blank/broken content for any migrated project
- **Files:** None (verification task)
- **Notes:** Manual browser testing

### B-007: Phase 2 Review
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M7
- **Depends:** B-001, B-002, B-003, B-004, B-005, B-006
- **Pass criteria:**
  - [ ] All B-xxx pass criteria verified and checked off
  - [ ] 3 active projects fully migrated with valid orchestrator files
  - [ ] All ~/projects/ directories registered in projects.json
  - [ ] Command Center displays migrated project data correctly
- **Fail criteria:**
  - Any B-xxx task has unchecked pass criteria
- **Files:** All Phase 2 files
- **Notes:** Gate for proceeding to Phase 3

---

## Phase 3: Full Dashboard
**Goal:** Projects tab, Content tab, Research tab, and Agents tab fully functional
**Exit when:** All Phase 3 tasks pass supervisor verification

### C-001: Projects Tab — Project Sub-Tabs & Selection
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** A-005, A-006
- **Pass criteria:**
  - [ ] Projects tab shows a sub-tab for every registered project
  - [ ] Sub-tabs sorted: active first (by lastActive desc), then paused, then complete, then archived
  - [ ] Each sub-tab shows project name and colored status dot (green=active, yellow=paused, gray=complete/archived)
  - [ ] Clicking sub-tab loads that project's state.json via `/api/project/:slug/state`
  - [ ] URL updates to `#/projects/<slug>` when project selected
  - [ ] Loading URL `#/projects/viberr-v2` directly selects Viberr v2
  - [ ] >8 projects: sub-tabs horizontally scroll or wrap without breaking layout
- **Fail criteria:**
  - Not all projects shown
  - No visual status indicator
  - Deep linking doesn't work
  - Layout breaks with many projects
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### C-002: Projects Tab — Milestones View
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** C-001
- **Pass criteria:**
  - [ ] Default view when project is selected
  - [ ] Each milestone renders as a collapsible card with: name, progress bar, done/total count
  - [ ] Expanding a milestone shows its tasks with: ID (monospace), title, status badge (colored), type badge
  - [ ] Task status badges use correct design system colors
  - [ ] Milestones with all tasks done show green checkmark
  - [ ] Project info header shows: name, type badge, status badge, external links (repo/live/API open in new tab)
  - [ ] Project with 0 milestones shows flat task list
- **Fail criteria:**
  - Milestones not collapsible
  - Task status colors inconsistent with design system
  - External links open in same tab
  - Crashes on project with 0 milestones
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### C-003: Projects Tab — Kanban View
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** C-001
- **Pass criteria:**
  - [ ] Toggle to switch between Milestones and Kanban views (button or tab)
  - [ ] 4 columns: Todo, In Progress, Testing, Done
  - [ ] Each task card shows: ID, title, type badge, milestone name
  - [ ] Cards in correct column based on task status (failed → shown in Todo with red badge, blocked → shown in Todo with purple badge)
  - [ ] Column headers show count of tasks in that column
- **Fail criteria:**
  - Tasks in wrong columns
  - No toggle between views
  - Failed/blocked tasks disappear instead of showing in a column
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### C-004: Projects Tab — Progress Log View
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** C-001
- **Pass criteria:**
  - [ ] Toggle to view progress log (third view option alongside Milestones/Kanban)
  - [ ] Fetches data from `/api/project/:slug/progress`
  - [ ] Entries rendered newest first
  - [ ] Each entry visually separated (card or divider)
  - [ ] Empty progress log shows "No progress entries yet" placeholder
- **Fail criteria:**
  - Entries shown oldest first
  - No visual separation between entries
  - Crashes on empty entries array
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### C-005: Content Tab
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** A-004, A-006
- **Pass criteria:**
  - [ ] Shows all tasks with type `content` or `marketing` from `/api/overview` `crossProjectTasks.content`
  - [ ] Tasks grouped by status: Todo → In Progress → Testing → Done
  - [ ] Each task shows: source project name as badge, task title, type badge (content vs marketing)
  - [ ] Filter dropdown to filter by project (multi-select)
  - [ ] Filter by type (content vs marketing)
  - [ ] "Hide completed" toggle that hides done tasks
  - [ ] Clicking project badge navigates to `#/projects/<slug>`
  - [ ] Empty state: "No content tasks found" message when no content/marketing tasks exist
- **Fail criteria:**
  - Shows non-content/marketing tasks
  - Filters don't work
  - No empty state message
  - Project badge click does nothing
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### C-006: Research Tab
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** C-005
- **Pass criteria:**
  - [ ] Identical functionality to Content tab but filters on type `research` or `analysis`
  - [ ] Uses `/api/overview` `crossProjectTasks.research` data
  - [ ] Same grouping, filtering, and navigation as Content tab
  - [ ] Empty state: "No research tasks found" message
- **Fail criteria:**
  - Shows content/marketing tasks instead of research/analysis
  - Missing any feature that Content tab has
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Can share rendering logic with Content tab

### C-007: Agents Tab
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** A-006
- **Pass criteria:**
  - [ ] "0xClaw — Lead Orchestrator" card always visible with green status dot
  - [ ] "Active Workers" section shows workers from all projects' state.json `workers` arrays
  - [ ] Each worker card shows: name, status dot (green=active, yellow=idle, gray=offline), project name, current task ID
  - [ ] "No active workers" message when no workers found
  - [ ] "Department Agents (Coming Soon)" placeholder section with 4 placeholder cards: Engineering, Content, Research, QA
- **Fail criteria:**
  - 0xClaw card missing
  - Workers from different projects not aggregated
  - No "Coming Soon" section
  - Crashes when no workers exist in any state.json
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Partially placeholder — real worker data from state.json, department agents are future

### C-008: Ideas System — Global & Per-Project
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M4
- **Depends:** A-004, A-006
- **Pass criteria:**
  - [ ] `GET /api/ideas` endpoint returns aggregated ideas from `~/.openclaw/workspace/IDEAS.md` (global) and each project's `IDEAS.md`
  - [ ] Each idea parsed with: text, status (open/blocked/done), tags, source project (or "global")
  - [ ] Ideas tab or section in Overview shows all ideas grouped by: Global, then by project
  - [ ] Ideas with `#blocked:reason` show the blocker visually
  - [ ] Ideas with `#done:date` show as completed with date
  - [ ] Ideas with `#project:name` tagged to a project show under that project's section
  - [ ] Empty IDEAS.md files handled gracefully (no crash, show "No ideas yet")
  - [ ] Template `IDEAS.md` created at `~/.openclaw/workspace/IDEAS.md` with format docs
- **Fail criteria:**
  - Crashes on missing IDEAS.md files
  - Tags not parsed (shown as raw text)
  - No visual distinction between global and per-project ideas
- **Files:** `~/projects/command-center/server.js`, `~/projects/command-center/index.html`, `~/.openclaw/workspace/IDEAS.md`
- **Notes:** Lightweight — just markdown parsing. IDEAS.md format: `- [ ] **Title** — description #tag1 #tag2`

### C-009: Phase 3 Review
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M8
- **Depends:** C-001, C-002, C-003, C-004, C-005, C-006, C-007, C-008
- **Pass criteria:**
  - [ ] All C-xxx pass criteria verified and checked off
  - [ ] All 5 tabs fully functional with real data
  - [ ] Cross-project views (Content, Research) aggregate correctly
  - [ ] No JS console errors navigating all tabs
- **Fail criteria:**
  - Any C-xxx task has unchecked pass criteria
  - Console errors present
- **Files:** All Phase 3 files
- **Notes:** Gate for Phase 4

---

## Phase 4: Polish & Ship
**Goal:** Responsive, resilient, production-ready
**Exit when:** All tasks pass and dashboard is accessible from phone over Tailscale

### D-001: Auto-Refresh & Polling
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** C-008
- **Pass criteria:**
  - [ ] Overview data refreshes every 10 seconds (verify: change projects.json, see update within 15s without reload)
  - [ ] Selected project state refreshes every 5 seconds
  - [ ] Projects registry refreshes every 30 seconds
  - [ ] No visible flicker or scroll position reset on data refresh
  - [ ] When tab is backgrounded (document.hidden === true), polling interval increases to 60s
  - [ ] When tab is foregrounded, polling resumes normal rate within 5 seconds
  - [ ] `document.visibilitychange` event listener present in source code
- **Fail criteria:**
  - Scroll position resets on poll
  - Full DOM re-render on each poll (should diff/update only changed elements)
  - Backgrounded tab continues polling at full rate
  - No visibility change handling
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### D-002: Connection Loss/Recovery
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** D-001
- **Pass criteria:**
  - [ ] When API server is stopped, a "Connection lost" indicator appears in the header within 15 seconds
  - [ ] Indicator is subtle (small banner or icon), not a blocking modal
  - [ ] Dashboard continues retrying automatically
  - [ ] When server restarts, indicator clears automatically within 15 seconds
  - [ ] No manual page reload required to recover
  - [ ] Error toasts/alerts do NOT spam (max 1 visible indicator at a time)
- **Fail criteria:**
  - No visual indicator of connection loss
  - Blocking modal or alert() popup
  - Requires manual reload after server restart
  - Multiple error messages stacking
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Test by killing and restarting server.js

### D-003: Responsive — Mobile (375px)
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** C-008
- **Pass criteria:**
  - [ ] At 375px viewport width: no horizontal scrollbar on page body
  - [ ] Tab navigation becomes dropdown selector or hamburger menu on mobile
  - [ ] All text readable without zooming (minimum 13px font-size on body text — verify in computed styles)
  - [ ] Touch targets ≥44px height (verify: all clickable elements)
  - [ ] Cards stack vertically in single column
  - [ ] Progress bars use full available width
  - [ ] Project sub-tabs become dropdown selector on mobile
- **Fail criteria:**
  - Horizontal scroll on mobile
  - Text smaller than 13px
  - Tiny touch targets
  - Desktop layout squeezed into mobile (no responsive breakpoints)
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Test with Chrome DevTools device emulator (iPhone SE)

### D-004: Responsive — Tablet (768px)
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** D-003
- **Pass criteria:**
  - [ ] At 768px viewport: layout adapts (not just stretched mobile or squished desktop)
  - [ ] Kanban columns are visible (may be 2x2 grid instead of 4-column row)
  - [ ] No horizontal scrollbar
  - [ ] Navigation tabs visible (not necessarily full desktop layout)
- **Fail criteria:**
  - Identical to mobile layout at 768px
  - Identical to desktop layout at 768px with overflow
  - Horizontal scroll
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Test with Chrome DevTools device emulator (iPad)

### D-005: Kanban Mobile Adaptation
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** D-003
- **Pass criteria:**
  - [ ] On mobile (<768px): Kanban columns stack vertically (single column scroll)
  - [ ] Column headers still visible with task counts
  - [ ] Cards remain readable
- **Fail criteria:**
  - 4-column layout forced on mobile causing horizontal scroll
  - Column headers disappear
- **Files:** `~/projects/command-center/index.html`
- **Notes:** None

### D-006: Edge Case Handling
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** C-008
- **Pass criteria:**
  - [ ] Project with nonexistent directory path: shows ⚠️ "Directory not found" badge on project card (not crash)
  - [ ] Project with no state.json: shows "Not migrated" in projects tab (not blank or error)
  - [ ] Project with state.json but 0 tasks: shows "0/0 tasks" and empty progress bar
  - [ ] All projects complete/paused: "Needs Attention" shows "Nothing needs attention 🎉"
  - [ ] Malformed state.json for one project: that project shows error, other projects render normally
  - [ ] Empty projects.json (no projects): shows "No projects registered" message
- **Fail criteria:**
  - Any edge case crashes the page
  - Malformed data for one project breaks all other projects
  - Missing empty state messages
- **Files:** `~/projects/command-center/index.html`
- **Notes:** Test each case manually

### D-007: README & Startup
- **Type:** content
- **Status:** ⬜ todo
- **Milestone:** M5
- **Depends:** D-002
- **Pass criteria:**
  - [ ] `~/projects/command-center/README.md` exists
  - [ ] README contains: one-line description, prerequisites (Node.js version), startup command (`node server.js`), port configuration (`PORT` env var), Tailscale URL
  - [ ] Following README instructions from scratch results in working dashboard (test: read README, follow steps, verify dashboard loads)
  - [ ] README mentions the Tailscale URL format: `http://0xs-mac-mini.tailacc337.ts.net:3400/`
- **Fail criteria:**
  - README missing startup command
  - Following README doesn't result in working server
  - No mention of Tailscale access
- **Files:** `~/projects/command-center/README.md`
- **Notes:** None

### D-008: Final Review & Ship
- **Type:** ops
- **Status:** ⬜ todo
- **Milestone:** M9
- **Depends:** D-001, D-002, D-003, D-004, D-005, D-006, D-007
- **Pass criteria:**
  - [ ] All A-xxx, B-xxx, C-xxx, D-xxx pass criteria verified
  - [ ] Dashboard loads in <2s on Tailscale from phone
  - [ ] A non-technical person can answer "what's the status of Viberr v2?" within 10 seconds of opening dashboard
  - [ ] All 10+ registered projects visible
  - [ ] 3 migrated projects show real task data with progress bars
  - [ ] Content tab aggregates content tasks across projects
  - [ ] Research tab aggregates research tasks across projects
  - [ ] Mobile layout works on 375px
  - [ ] Auto-refresh works without page reload
  - [ ] Connection loss/recovery works
  - [ ] No JS console errors across full navigation flow
  - [ ] `git init` and initial commit of command-center project
  - [ ] Server started and accessible at Tailscale URL
- **Fail criteria:**
  - Any task has unchecked pass criteria
  - Load time >3s
  - JS errors in console
  - Inaccessible from Tailscale
- **Files:** All project files
- **Notes:** Final gate. Project is shipped after this passes.
