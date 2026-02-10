# Mission Control Dashboard — Full Rebuild
- **From:** CEO
- **Priority:** high
- **Status:** done
- **Created:** 2026-02-10T22:43:00Z

## The Problem
Our current dashboard is a static grid of cards with stale data. Our human needs a real-time command center to manage a 6-agent AI organization. He described wanting "a 2D/3D interactive dashboard where information is flowing between spots and goals and data are being updated from different agents." Not a basic dashboard — something genuinely unique and interactive.

## Who's Using It
- Desktop only (laptop browser)
- Decision-maker, not just monitoring — needs enough overview to drill into specifics
- Checks in periodically, wants to understand state fast and make decisions
- Urgent alerts go to Telegram separately, dashboard is for deep understanding

## What the User Said (Raw)
"I don't need every single detail but I need enough of an overview that I can nail into specifics easy enough or click into things further."
"I don't want some basic dashboard I want something really unique and interactive that's going to help us out"
"it's almost like we need a 2d/3d interactive dashboard where information is flowing between spots and goals and data etc are being updated from different agents"

## What Exists
- 6 agents: CEO, Content, Engineering, Research, Comms, QA
- Each has: feed files (org/feed/{agent}.md), inbox folders, workspace
- Architecture mind map at :3402 (static HTML, pannable)
- Old dashboard at :3400 (stale card grid)
- pm2 manages 13 servers (ecosystem.config.js at ~/)
- Session API provides per-agent token usage
- Twitter API provides engagement metrics
- GitHub repos track shipping velocity

## Data Sources Available
- Agent feed files: ~/.openclaw/workspace/org/feed/*.md (real-time activity)
- Agent inboxes: ~/.openclaw/workspace-{agent}/inbox/ (pending work)
- pm2 status: `pm2 jlist` (server health)
- Twitter metrics: API (engagement, followers)
- GitHub: `gh` CLI (commits, pushes, PRs)
- Session tokens: OpenClaw sessions API (token usage per agent)
- org/facts.md: ground truth
- Build logs, posted-logs, QA scores from agent workspaces

## Important
- This is NOT a replacement for the org architecture mind map (:3402). That stays separate.
- The mind map shows org STRUCTURE. This shows org ACTIVITY + DATA + GOALS.
- Could link to the mind map from within the dashboard, but they're distinct tools.

## Constraints
- Single HTML file + Node.js server (our standard stack)
- Port 3400 (replace existing dashboard)
- Must be accessible via Tailscale: http://0xs-mac-mini.tailacc337.ts.net:3400/
- Desktop-first, modern browser
- Real-time or near-real-time data (poll every 30-60s)
- No external dependencies (CDN OK for libraries, but must work offline too)

## Quality Bar
"Would Deadly be blown away?" — This should feel like a mission control center, not a Grafana knockoff. Think: information flowing visually between nodes, interactive drill-downs, clean dark UI, the kind of thing you'd screenshot and share.

## Project Directory
~/projects/command-center/

## Ship To
- Port 3400, pm2 managed
- Push to GitHub: 0xClawAI/command-center
