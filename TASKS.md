# Command Center QA Sprint Tasks

## BUG-1: Overview "Agent Status" shows "No health data"
- **Status:** in-progress
- **Priority:** high
- `parseAgentHealth()` in server.js expects pipe-delimited table rows but `dept-health.md` uses `## DeptName — 🟢 Status` format with bullet points
- Fix: rewrite parser to match actual markdown structure

## BUG-2: Overview "Key Issues" shows "No issues"  
- **Status:** in-progress
- **Priority:** high
- `parseKeyIssues()` looks for `## Key Issues` section that doesn't exist
- Fix: extract "Issue:" lines from each department block in dept-health.md

## BUG-3: Content tab shows "ORIGINAL" for all posts including replies
- **Status:** deferred
- **Priority:** low
- Badge should distinguish original vs reply posts
