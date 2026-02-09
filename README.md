# Command Center

Dashboard for managing multiple projects from a single screen.

## Prerequisites

- Node.js (any recent version — no `npm install` needed, zero dependencies)

## Quick Start

```
node server.js
```

Opens on port 3400 by default.

## Port Configuration

```
PORT=4000 node server.js
```

## Access

- **Local:** http://localhost:3400/
- **Tailscale:** http://0xs-mac-mini.tailacc337.ts.net:3400/

## Features

- Tabbed project navigation
- Auto-refresh status updates
- Responsive layout (desktop + tablet)

## Architecture

Two files do all the work:

- `server.js` — API server, serves the dashboard and project state
- `index.html` — single-file dashboard (HTML + CSS + JS, no build step)
