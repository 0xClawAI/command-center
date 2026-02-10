const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = 3400;

const HOME = process.env.HOME;
const WORKSPACE = path.join(HOME, '.openclaw', 'workspace');
const FEED_DIR = path.join(WORKSPACE, 'org', 'feed');
const PROJECTS_DIR = path.join(HOME, 'projects');

const AGENTS = ['ceo', 'engineering', 'content', 'comms', 'research', 'qa'];

const WORKSPACE_DIRS = {
  ceo: WORKSPACE,
  engineering: WORKSPACE + '-engineering',
  content: WORKSPACE + '-content',
  comms: WORKSPACE + '-comms',
  research: WORKSPACE + '-research',
  qa: WORKSPACE + '-qa',
};

const INBOX_DIRS = {};
for (const a of AGENTS) INBOX_DIRS[a] = path.join(WORKSPACE_DIRS[a] || WORKSPACE, 'inbox');

const AGENT_COLORS = {
  ceo: '#ffffff',
  engineering: '#00d4ff',
  content: '#ff6b9d',
  research: '#a78bfa',
  comms: '#34d399',
  qa: '#f59e0b',
};

app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ────────────────────────────────────────────────

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
}

function parseFeed(agent) {
  const raw = readFile(path.join(FEED_DIR, agent + '.md'));
  const lines = raw.split('\n').filter(l => /^\*\*\[/.test(l));
  return lines.slice(-50).map(line => {
    const tm = line.match(/\*\*\[(\d{1,2}:\d{2})\]\*\*/);
    const text = line.replace(/\*\*\[\d{1,2}:\d{2}\]\*\*\s*/, '').trim();
    return { time: tm ? tm[1] : '??:??', text };
  });
}

function countInbox(agent) {
  const dir = INBOX_DIRS[agent];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    let pending = 0, items = [];
    for (const f of files) {
      const content = readFile(path.join(dir, f));
      const isDone = content.includes('Status:** done');
      if (!isDone) pending++;
      const titleMatch = content.match(/^#\s+(.+)/m);
      const priorityMatch = content.match(/Priority:\*\*\s*(\w+)/);
      const statusMatch = content.match(/Status:\*\*\s*([\w-]+)/);
      items.push({
        file: f,
        title: titleMatch ? titleMatch[1] : f,
        priority: priorityMatch ? priorityMatch[1] : 'unknown',
        status: statusMatch ? statusMatch[1] : 'unknown',
        done: isDone,
      });
    }
    return { total: files.length, pending, items };
  } catch { return { total: 0, pending: 0, items: [] }; }
}

function getPm2List() {
  return safe(() => JSON.parse(execSync('pm2 jlist', { timeout: 5000 }).toString()), []);
}

// ─── API: /api/agents ───────────────────────────────────────

app.get('/api/agents', (req, res) => {
  const pm2 = getPm2List();
  const agents = AGENTS.map(name => {
    const feed = parseFeed(name);
    const inbox = countInbox(name);
    const lastActivity = feed.length > 0 ? feed[feed.length - 1] : null;

    // Check if agent has a running pm2 process or recent feed
    const pm2Proc = pm2.find(p => p.name.toLowerCase().includes(name));
    const isRunning = pm2Proc ? pm2Proc.pm2_env.status === 'online' : false;

    // Determine status from feed recency
    let status = 'idle';
    if (isRunning) status = 'active';
    else if (feed.length > 0) status = 'idle';

    return {
      name,
      displayName: name === 'ceo' ? 'CEO' : name.charAt(0).toUpperCase() + name.slice(1),
      color: AGENT_COLORS[name],
      feed: feed.slice().reverse(),
      inbox,
      lastActivity,
      status,
      isRunning,
    };
  });
  res.json(agents);
});

// ─── API: /api/health ───────────────────────────────────────

app.get('/api/health', (req, res) => {
  const list = getPm2List();
  const services = list.map(p => ({
    name: p.name,
    status: p.pm2_env ? p.pm2_env.status : 'unknown',
    cpu: p.monit ? p.monit.cpu : 0,
    memory: p.monit ? Math.round(p.monit.memory / 1024 / 1024) : 0,
    uptime: p.pm2_env ? p.pm2_env.pm_uptime : 0,
    restarts: p.pm2_env ? p.pm2_env.restart_time : 0,
    pid: p.pid,
  }));
  const online = services.filter(s => s.status === 'online').length;
  res.json({ services, summary: { total: services.length, online, stopped: services.length - online } });
});

// ─── API: /api/projects ─────────────────────────────────────

app.get('/api/projects', (req, res) => {
  const projects = [];
  try {
    const dirs = fs.readdirSync(PROJECTS_DIR);
    for (const d of dirs) {
      const pdir = path.join(PROJECTS_DIR, d);
      if (!fs.statSync(pdir).isDirectory()) continue;
      
      const stateFile = path.join(pdir, 'state.json');
      const prdFile = path.join(pdir, 'PRD.md');
      const tasksFile = path.join(pdir, 'TASKS.md');
      const progressFile = path.join(pdir, 'progress.txt');

      let state = safe(() => JSON.parse(readFile(stateFile)), {});
      const hasPrd = fs.existsSync(prdFile);
      const hasTasks = fs.existsSync(tasksFile);
      const progress = readFile(progressFile).trim();

      // Determine phase
      let phase = 'unknown';
      if (state.phase) phase = state.phase;
      else if (!hasPrd) phase = 'init';
      else if (!hasTasks) phase = 'prd';
      else phase = 'build';

      // Parse tasks for progress percentage
      const tasksRaw = readFile(tasksFile);
      const totalTasks = (tasksRaw.match(/- \[[ x]\]/g) || []).length;
      const doneTasks = (tasksRaw.match(/- \[x\]/gi) || []).length;
      const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      projects.push({
        name: d,
        phase,
        progress: pct,
        totalTasks,
        doneTasks,
        progressNote: progress || state.progressNote || '',
        assignedTo: state.assignedTo || 'engineering',
        status: state.status || (pct === 100 ? 'complete' : 'active'),
      });
    }
  } catch (e) { /* projects dir may not exist */ }
  res.json(projects);
});

// ─── API: /api/changelog ────────────────────────────────────

app.get('/api/changelog', (req, res) => {
  const since = req.query.since || '24h';
  const hoursMap = { '1h': 1, '4h': 4, '12h': 12, '1d': 24, '24h': 24, '7d': 168 };
  const hours = hoursMap[since] || 24;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  const entries = [];
  for (const agent of AGENTS) {
    const feed = parseFeed(agent);
    // We don't have real timestamps in feed, so include all recent entries
    for (const entry of feed) {
      entries.push({ agent, color: AGENT_COLORS[agent], ...entry });
    }
  }
  // Return newest first, limit 100
  res.json({ since, entries: entries.reverse().slice(0, 100) });
});

// ─── API: /api/blocked ──────────────────────────────────────

app.get('/api/blocked', (req, res) => {
  const blocked = [];
  for (const agent of AGENTS) {
    const inbox = countInbox(agent);
    for (const item of inbox.items) {
      if (item.priority === 'urgent' && !item.done) {
        blocked.push({ agent, ...item });
      }
    }
    // Also check feed for "blocked" mentions
    const feed = parseFeed(agent);
    for (const entry of feed) {
      if (/block|waiting|stuck|need.*input/i.test(entry.text)) {
        blocked.push({ agent, type: 'feed', time: entry.time, text: entry.text });
      }
    }
  }
  res.json(blocked);
});

// ─── API: /api/metrics ──────────────────────────────────────

app.get('/api/metrics', (req, res) => {
  const feedCounts = {};
  let totalFeed = 0;
  for (const a of AGENTS) {
    const f = parseFeed(a);
    feedCounts[a] = f.length;
    totalFeed += f.length;
  }

  const inboxCounts = {};
  let totalPending = 0;
  for (const a of AGENTS) {
    const c = countInbox(a);
    inboxCounts[a] = c.pending;
    totalPending += c.pending;
  }

  // Git stats
  const gitStats = safe(() => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    let commitsToday = 0, commitsWeek = 0;
    const dirs = fs.readdirSync(PROJECTS_DIR);
    for (const d of dirs) {
      const gd = path.join(PROJECTS_DIR, d, '.git');
      if (!fs.existsSync(gd)) continue;
      commitsToday += parseInt(safe(() => execSync(`git -C ${path.join(PROJECTS_DIR, d)} rev-list --count --since="${today}" HEAD 2>/dev/null`, { timeout: 3000 }).toString().trim(), '0')) || 0;
      commitsWeek += parseInt(safe(() => execSync(`git -C ${path.join(PROJECTS_DIR, d)} rev-list --count --since="${weekAgo}" HEAD 2>/dev/null`, { timeout: 3000 }).toString().trim(), '0')) || 0;
    }
    return { commitsToday, commitsWeek };
  }, { commitsToday: 0, commitsWeek: 0 });

  res.json({
    feedEntries: { total: totalFeed, perAgent: feedCounts },
    inboxDepth: { total: totalPending, perAgent: inboxCounts },
    git: gitStats,
    lastUpdated: new Date().toISOString(),
  });
});

// ─── API: /api/content ──────────────────────────────────────

app.get('/api/content', (req, res) => {
  // Read content agent feed for tweet-like data
  const feed = parseFeed('content');
  
  // Try to read any content-specific data files
  const contentWs = WORKSPACE_DIRS.content;
  let tweetData = [];
  
  // Check for tweet log or similar
  const tweetLog = path.join(contentWs, 'tweet-log.md');
  const tweetContent = readFile(tweetLog);
  if (tweetContent) {
    const tweets = tweetContent.split('\n---\n').filter(Boolean);
    tweetData = tweets.slice(-10).map((t, i) => {
      const lines = t.trim().split('\n');
      return { id: i, text: lines[0] || '', raw: t.trim() };
    });
  }

  res.json({
    feed: feed.reverse(),
    tweets: tweetData,
    lastUpdated: new Date().toISOString(),
  });
});

// ─── API: /api/research ─────────────────────────────────────

app.get('/api/research', (req, res) => {
  const feed = parseFeed('research');
  const findingsDir = path.join(WORKSPACE_DIRS.research || WORKSPACE, 'findings');
  let findings = [];
  try {
    const files = fs.readdirSync(findingsDir).filter(f => f.endsWith('.md'));
    findings = files.slice(-20).map(f => {
      const content = readFile(path.join(findingsDir, f));
      const titleMatch = content.match(/^#\s+(.+)/m);
      const requestedBy = content.match(/Requested by:\*?\*?\s*(\w+)/i);
      return {
        file: f,
        title: titleMatch ? titleMatch[1] : f.replace('.md', ''),
        routedTo: requestedBy ? requestedBy[1].toLowerCase() : 'unknown',
        size: content.length,
      };
    });
  } catch { /* no findings dir */ }
  
  res.json({ feed: feed.reverse(), findings, lastUpdated: new Date().toISOString() });
});

// ─── Serve ──────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Mission Control V2 "The Constellation" on http://localhost:${PORT}`));
