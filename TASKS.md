# Mission Control Dashboard — Tasks

## Phase 1: Foundation (P0) ✅ COMPLETE

- [x] T1: Server.js — Express-less HTTP server with static file serving + API routing
- [x] T2: API — `/api/agents` endpoint (reads feed files, inbox counts, agent status)
- [x] T3: API — `/api/pm2` endpoint (runs pm2 jlist, returns parsed JSON)
- [x] T4: HTML shell — Dark theme, CSS custom properties, layout grid (graph area + feed panel + server grid)
- [x] T5: D3 force graph — Agent nodes with CEO center, animated edges with flowing particles
- [x] T6: Agent status — Node colors (green/yellow/red), pulse animation, last-active time
- [x] T7: Live activity feed — Right panel, auto-updating, color-coded by agent
- [x] T8: Agent drill-down — Click node → slide-in panel with feed, inbox, tasks
- [x] T9: Server health grid — Bottom panel showing pm2 process status
- [x] T10: Auto-polling — 30s agents, 60s pm2, visual refresh without flicker

## Phase 2: External Integrations (P1)

- [ ] T11: Token cost ticker
  - Description: Add /api/metrics endpoint and running cost counter showing total tokens used today across all agents
  - Files: server.js (OpenClaw sessions integration), index.html (prominent ticker display)
  - Acceptance: Shows real-time token usage counter, costs today/week, per-agent breakdown
  - Depends: T1, T2

- [ ] T12: GitHub activity panel
  - Description: Implement /api/github endpoint using gh CLI for recent commits and repo metrics
  - Files: server.js (gh CLI integration), index.html (GitHub metrics card)
  - Acceptance: Shows recent commits, push count, active repos updated via polling
  - Depends: T1

- [ ] T13: Twitter metrics panel
  - Description: Add /api/twitter endpoint and display follower count, engagement metrics
  - Files: server.js (Twitter API integration), index.html (Twitter metrics card)
  - Acceptance: Shows follower count, recent engagement, top tweets in compact panel
  - Depends: T1

- [ ] T14: Edge heat map and enhanced flows
  - Description: Edge thickness/color intensity based on message volume between agents
  - Files: index.html (enhance D3 graph with dynamic edge styling)
  - Acceptance: Edge thickness varies by activity, flowing particles scale with volume
  - Depends: T5, T7

## Phase 3: UX Enhancement (P1)

- [ ] T15: Keyboard shortcuts
  - Description: Add keyboard navigation - 1-6 for agents, Esc to close, R to refresh, ? for help
  - Files: index.html (keyboard event handlers + help overlay)
  - Acceptance: All shortcuts work, help overlay shows available keys, smooth navigation
  - Depends: T8

- [ ] T16: Alert banner system
  - Description: Critical alerts banner at top for agent failures, build errors, system issues
  - Files: index.html (alert banner component + detection logic)
  - Acceptance: Shows critical alerts in prominent banner, auto-dismiss, color-coded by severity
  - Depends: T2, T3

- [ ] T17: Performance optimization and error handling
  - Description: Optimize polling, add loading states, implement graceful error handling
  - Files: index.html (loading indicators, error states), server.js (error handling)
  - Acceptance: Smooth polling, "Connection Lost" indicators, graceful degradation
  - Depends: All polling tasks

## Phase 4: Advanced Features (P2)

- [ ] T18: Time scrubber for historical replay
  - Description: Timeline slider to replay agent activity over past 24h
  - Files: index.html (timeline component + data caching)
  - Acceptance: Scrub through historical agent states, see activity patterns over time
  - Depends: T2, T5

- [ ] T19: Composable layout system
  - Description: Drag-and-rearrange panels, save layout to localStorage
  - Files: index.html (drag/drop handlers + layout persistence)
  - Acceptance: Panels can be repositioned, layout saves between sessions
  - Depends: All panel components

- [ ] T20: Audio feedback and 3D view toggle
  - Description: Subtle sounds for completed tasks, alerts, plus Three.js alternate 3D graph view
  - Files: index.html (audio system + Three.js toggle)
  - Acceptance: Optional audio feedback, toggle between 2D/3D graph views
  - Depends: T5

## Phase 5: Final Polish

- [ ] T21: Search/command palette
  - Description: Cmd+K to search agents, tasks, logs with fuzzy matching
  - Files: index.html (command palette component)
  - Acceptance: Fast search across all dashboard data, keyboard navigation
  - Depends: All data sources

- [ ] T22: Export and screenshot capabilities
  - Description: Share dashboard states, capture high-quality screenshots
  - Files: index.html (export functionality)
  - Acceptance: Export JSON state, capture PNG screenshots of current view
  - Depends: All features

- [ ] T23: Final visual polish
  - Description: Glass morphism effects, micro-animations, visual refinements per design system
  - Files: index.html (CSS refinements, enhanced animations)
  - Acceptance: Matches NASA mission control aesthetic, screenshot-worthy, smooth interactions
  - Depends: All features complete
