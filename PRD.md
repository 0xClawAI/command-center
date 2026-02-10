# Mission Control Dashboard — PRD

## Problem Statement
Our current dashboard is a static grid of cards with stale data that fails to provide the real-time operational awareness needed to manage a 6-agent AI organization effectively. The existing solution shows basic metrics but lacks the visual flow, interactivity, and insight density required for strategic decision-making. Our CEO needs a genuine command center experience that shows "information flowing between spots and goals and data being updated from different agents" — not another generic Grafana-style dashboard.

The core problem: **We have dynamic, real-time agent orchestration happening across 6 specialized AI agents, but our visibility into this system is limited to static cards and basic metrics.** This creates blind spots in operational awareness and makes it difficult to spot bottlenecks, coordination patterns, or emerging issues.

**Who has this problem:** Tech leaders managing multi-agent AI systems, DevOps teams running complex service architectures, and executives who need high-level operational awareness without getting lost in low-level metrics.

**Why is it painful:** Decision-makers lose time context-switching between multiple monitoring tools, miss critical coordination breakdowns, and can't quickly identify which agents or processes are blocking organizational objectives.

## Target User Persona
**Name:** Alex Chen, Tech Executive
**Age:** 32
**Context:** Manages a 6-agent AI organization processing dozens of concurrent projects, needs to make rapid decisions about resource allocation, priority changes, and bottleneck resolution.

**Trigger moment:** When Alex opens their laptop and needs to understand "What's happening right now? What needs my attention? Are we on track?" within 10 seconds of looking at the screen.

**Daily usage pattern:** Checks the dashboard 3-5 times per day for 2-3 minutes each time, primarily during decision moments: morning standup, afternoon check-ins, and evening wrap-up.

## Success Criteria
- **Would someone keep this on their phone?** No — this is desktop-first mission control for deep operational awareness
- **Would they text it to a friend?** YES — the visual design and unique interaction model should be screenshot-worthy
- **What makes this a KEEP vs UNINSTALL?**
  - KEEP: Shows real-time agent activity flow, helps spot coordination patterns, prevents surprises
  - UNINSTALL: If it's just prettier Grafana, doesn't show dynamic relationships, or becomes stale

**Core success metrics:**
1. **10-second situational awareness:** User can assess system health and activity within 10 seconds
2. **Zero-click insight discovery:** Important patterns visible without clicking into detail views
3. **Visual distinctiveness:** Users want to show this to colleagues because it looks/feels different
4. **Operational impact:** Actually helps find and resolve coordination bottlenecks

## Features

### P0 — Must Have (app doesn't work without these)
1. **Real-time Agent Activity Visualization** — 3D constellation view with 6 agent nodes, animated particles showing data/task flow between agents
2. **Agent Health Ring System** — Expanding/contracting rings around each agent showing current activity intensity and status
3. **Live Activity Stream** — Right sidebar showing real-time feed entries from all agents with timestamps
4. **System Health Overview** — PM2 service status, agent response times, error states prominently displayed
5. **Goal Achievement Pathways** — Visual lines showing how current tasks connect to organizational objectives
6. **30-second Auto-refresh** — All data sources polled automatically to maintain real-time accuracy

### P1 — Should Have (significantly better with these)
1. **Interactive Agent Deep-dive** — Click agent nodes to see detailed metrics, recent activity, inbox depth, token usage
2. **Collaboration Flow Detection** — Highlight when multiple agents are working on related tasks
3. **Bottleneck Identification** — Visual indicators when agents have high inbox depth or are blocked waiting for others
4. **Historical Pattern Recognition** — Show 24-hour activity patterns to identify coordination rhythms
5. **Cross-project Activity Correlation** — Connect agent activity to specific projects in the portfolio
6. **Performance Heatmap** — Color-coded intensity showing which agents/departments are most active

### P2 — Nice to Have (polish and delight)
1. **Agent Conversation Visualization** — When agents reference each other, show animated "conversation lines"
2. **Achievement Celebration Effects** — Particle burst animations when goals are completed
3. **Dynamic Organization Restructuring** — Agents physically move closer/farther based on collaboration frequency
4. **Voice Activity Indicators** — Show which agents are "speaking" (actively writing to feeds)
5. **Ambient Sound Design** — Optional audio cues for agent activity and system events
6. **Custom Workspace Views** — Save different 3D perspectives and data focus areas

## UX Flow
**Step 1: Landing** — User sees a dark 3D space with 6 glowing agent nodes arranged in an organic constellation, particles flowing between them showing real activity

**Step 2: Orientation** — Within 3 seconds, user identifies: which agents are active (bright vs dim), where bottlenecks exist (clustering particles), overall system health (color scheme)

**Step 3: Investigation** — User hovers over nodes to see agent tooltips, clicks for detailed drill-down, or observes particle flows to understand task routing

**Step 4: Insight** — User spots patterns: "Engineering and QA are heavily collaborating", "CEO node has many outbound particles = delegating heavily", "Research agent is idle = opportunity"

**Step 5: Action** — User can click through to specific agent feeds, GitHub repos, or the org architecture map for deeper investigation

## Design System

### Colors
- **Primary Dark:** #0d1117 (main background)
- **Surface:** #161b22 (panel backgrounds)
- **Agent Colors:**
  - CEO: #58a6ff (bright blue)
  - Engineering: #f85149 (red)
  - Content: #d29922 (yellow)
  - Research: #bc8cff (purple)
  - Comms: #39d353 (green)
  - QA: #f0883e (orange)
- **Accent:** #e6edf3 (primary text)
- **Dim:** #8b949e (secondary text)
- **Success:** #3fb950
- **Warning:** #d29922
- **Error:** #f85149

### Typography
- **Heading Font:** SF Pro Display (macOS) / Segoe UI (Windows)
- **Body Font:** SF Pro Text / Segoe UI
- **Code Font:** SF Mono / Consolas
- **Sizes:** 11px (small), 13px (body), 16px (h3), 20px (h2), 24px (h1)

### Spacing
- **Grid:** 8px base unit
- **Padding:** 8px (tight), 16px (normal), 24px (loose)
- **Margins:** 12px (components), 24px (sections)
- **Border Radius:** 6px (buttons), 12px (panels)

### Animations
- **Particle Flow:** 2-3 second travel time between nodes, gaussian fade in/out
- **Node Pulsing:** 1.5 second breathing cycle for active agents
- **Hover States:** 200ms ease-in-out transitions
- **Panel Transitions:** 300ms slide-in for drill-down views
- **Loading States:** Shimmer effects during data refresh

### Mobile-first Considerations
- **Desktop-optimized:** This is specifically NOT mobile-first — designed for laptop/desktop mission control
- **Minimum Resolution:** 1280x800 (MacBook Air baseline)
- **Touch Targets:** N/A (mouse/trackpad interaction assumed)
- **Responsive Breakpoints:** Scale 3D canvas proportionally, collapse sidebar on narrow screens

## Technical Architecture

### Stack
- **Frontend:** Single `index.html` with inline CSS/JavaScript (maintain existing pattern)
- **3D Visualization:** Three.js for 3D scene, WebGL particle systems
- **Server:** Node.js Express server (existing `server.js` foundation)
- **Data Sources:** File system polling (existing agent feeds, inbox directories, PM2 status)

### Server Architecture
- **Port:** 3400 (replace existing dashboard)
- **Bind:** 0.0.0.0 (Tailscale accessibility)
- **Dependencies:** Express only (maintain zero-dependency approach)
- **New Endpoints:**
  - `/api/agent-flow` — Inter-agent task routing data
  - `/api/collaboration-graph` — Agent interaction frequency matrix
  - `/api/goal-progress` — Current objectives and completion status
  - `/api/historical-patterns` — 24-hour activity aggregations

### Storage
- **Primary Data:** Existing filesystem structure (`~/.openclaw/workspace/`)
- **Cache Layer:** In-memory caching of parsed feed data for performance
- **State Persistence:** localStorage for user preferences (3D camera position, panel preferences)
- **No Database:** Maintain file-system-driven approach

### APIs
- **GitHub Integration:** `gh api` commands for repository metrics
- **PM2 Monitoring:** `pm2 jlist` for service health
- **Session Tracking:** Parse OpenClaw session logs for token usage
- **External Services:** Twitter API for engagement metrics (existing)

### PWA Features
- **Manifest:** Web app installation support
- **Service Worker:** Cache static assets, offline fallback page
- **Push Notifications:** Browser notifications for critical system alerts
- **Offline Mode:** Show cached state when network unavailable

## Edge Cases

### Invalid/Missing Data
- **Empty feed files:** Show "No recent activity" state instead of blank nodes
- **Missing agent:** Gray out node, show "Offline" status, disable interactions
- **Corrupted feed format:** Parse what's possible, log errors, graceful degradation
- **Large feed files:** Limit parsing to most recent 100 entries per agent

### Network/Performance Issues
- **API timeout:** Show stale data with "Last updated 2m ago" indicator
- **Slow parsing:** Display loading shimmer during feed processing
- **Memory constraints:** Limit particle count, implement object pooling
- **Browser compatibility:** Fallback to 2D canvas if WebGL unavailable

### User Interaction Edge Cases
- **Rapid clicking:** Debounce drill-down panel to prevent UI thrashing
- **Window resize:** Proportionally scale 3D scene, maintain aspect ratios
- **Multiple browser tabs:** Handle localStorage conflicts gracefully
- **Extended idle time:** Pause animations, reduce polling frequency

### Data Consistency Issues
- **Agent timestamp gaps:** Interpolate activity levels between known data points
- **Feed parsing errors:** Continue with partial data, highlight parsing issues
- **PM2 service mismatches:** Show services that exist in config but aren't running
- **Inbox file permission errors:** Fallback to last known counts, show warning

## Competitive Landscape

| Competitor | What they do | Gap we fill |
|------------|--------------|-------------|
| **Grafana** | Time-series metrics visualization | Static graphs → Dynamic 3D flow visualization |
| **DataDog** | Infrastructure monitoring dashboards | Service metrics → Agent collaboration patterns |
| **New Relic** | Application performance monitoring | Performance data → Organizational intelligence |
| **Kibana** | Log analysis and visualization | Historical logs → Real-time activity streams |
| **Splunk** | Machine data analytics | Data analysis → Mission control experience |
| **NASA OpenMCT** | Mission control for spacecraft | Space missions → AI organization management |
| **Custom CEO Dashboards** | Executive business intelligence | Business KPIs → Technical operational awareness |

### Our Unique Value Proposition
**We're the first dashboard designed specifically for multi-agent AI organization management.** Instead of adapting tools built for servers, applications, or business metrics, we're purpose-built for understanding AI agent coordination, collaboration patterns, and organizational flow. The 3D visualization isn't just prettier — it maps directly to how AI agents actually work together in dimensional space with complex interdependencies.

### Visual Differentiation
Most dashboards look like spreadsheets or TV news graphics. Ours looks like **sci-fi mission control** — something you'd see in a movie depicting advanced AI coordination. This isn't just aesthetics: the visual design directly communicates the sophistication and cutting-edge nature of AI-first organizations.
