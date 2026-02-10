const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 3400;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const HOME = os.homedir();

// Data source paths
const PATHS = {
  feeds: path.join(HOME, '.openclaw', 'workspace', 'org', 'feed'),
  deptHealth: path.join(HOME, '.openclaw', 'workspace', 'org', 'dept-health.md'),
  contentDir: path.join(HOME, '.openclaw', 'workspace-content'),
  researchFindings: path.join(HOME, '.openclaw', 'workspace-research', 'findings'),
  projectsDir: path.join(HOME, 'projects'),
  projectsJson: path.join(HOME, '.openclaw', 'workspace', 'projects.json'),
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
function err(res, status, msg) { json(res, status, { error: msg }); }
function readSafe(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return null; } }
function readdirSafe(fp) { try { return fs.readdirSync(fp); } catch { return []; } }

// ─── Agent Health ───
function parseAgentHealth() {
  const raw = readSafe(PATHS.deptHealth);
  if (!raw) return [];
  const agents = [];

  // Match department headers: ## DeptName — 🟢/🟡/🔴 StatusText
  const deptSections = raw.split(/^## /m).slice(1); // Skip the first empty part

  for (const section of deptSections) {
    const lines = section.split('\n');
    const header = lines[0].trim();

    // Parse header: "DeptName — 🟢/🟡/🔴 StatusText"
    const headerMatch = header.match(/^(.+?)\s+—\s+(🟢|🟡|🔴)\s+(.+)$/);
    if (!headerMatch) continue;

    const [, name, emoji, statusText] = headerMatch;
    let status = 'unknown';
    if (emoji === '🟢') status = 'green';
    else if (emoji === '🟡') status = 'yellow';
    else if (emoji === '🔴') status = 'red';

    // Parse bullet points for lastAction and issue
    let lastAction = null;
    let issue = null;

    for (const line of lines) {
      const lastActionMatch = line.match(/^- Last action:\s*(.+)$/);
      if (lastActionMatch) {
        lastAction = lastActionMatch[1].trim();
      }

      const issueMatch = line.match(/^- Issue:\s*(.+)$/);
      if (issueMatch) {
        issue = issueMatch[1].trim();
      }
    }

    agents.push({
      name,
      status,
      statusText,
      lastAction,
      issue,
    });
  }

  return agents;
}

function parseKeyIssues() {
  const raw = readSafe(PATHS.deptHealth);
  if (!raw) return [];
  const issues = [];

  // Split by department sections
  const deptSections = raw.split(/^## /m).slice(1); // Skip the first empty part

  for (const section of deptSections) {
    const lines = section.split('\n');
    const header = lines[0].trim();

    // Extract department name from header
    const headerMatch = header.match(/^(.+?)\s+—/);
    const deptName = headerMatch ? headerMatch[1] : header;

    // Find Issue: bullet points in this section
    for (const line of lines) {
      const issueMatch = line.match(/^- Issue:\s*(.+)$/);
      if (issueMatch) {
        issues.push(`${deptName}: ${issueMatch[1].trim()}`);
      }
    }
  }

  return issues;
}

// ─── Feed Parser ───
function parseFeed(agentName) {
  const raw = readSafe(path.join(PATHS.feeds, `${agentName}.md`));
  if (!raw) return [];
  const entries = [];
  const lines = raw.split('\n');
  let currentDate = '';
  for (const line of lines) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) { currentDate = dateMatch[1]; continue; }
    const entryMatch = line.match(/^\*\*\[(\d{2}:\d{2})\]\*\*\s+(.+)/);
    if (entryMatch) {
      entries.push({
        time: `${currentDate} ${entryMatch[1]}`,
        message: entryMatch[2],
      });
    }
  }
  return entries;
}

// ─── Content Data ───
function parsePostedLog() {
  const raw = readSafe(path.join(PATHS.contentDir, 'posted-log.md'));
  if (!raw) return [];
  const posts = [];
  const blocks = raw.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0].trim();
    const post = { header };
    for (const line of lines) {
      const m = line.match(/- \*\*(\w+):\*\*\s*(.+)/);
      if (m) post[m[1].toLowerCase()] = m[2].trim();
    }
    // Extract context line
    const ctx = lines.find(l => l.startsWith('- **Context:**'));
    if (ctx) post.context = ctx.replace('- **Context:** ', '');
    posts.push(post);
  }
  return posts.reverse().slice(0, 20); // newest first, limit 20
}

function parseEngagement() {
  const raw = readSafe(path.join(PATHS.contentDir, 'engagement-tracker.md'));
  if (!raw) return { conversations: [], metrics: {} };
  const conversations = [];
  const blocks = raw.split(/^### /m).slice(1);
  for (const block of blocks) {
    const title = block.split('\n')[0].trim();
    const lines = block.split('\n');
    const conv = { title };
    for (const line of lines) {
      const m = line.match(/- \*\*(\w[\w\s]*):\*\*\s*(.+)/);
      if (m) conv[m[1].toLowerCase().replace(/\s+/g, '_')] = m[2].trim();
    }
    conversations.push(conv);
  }
  // Extract performance metrics
  const metrics = {};
  const perfBlock = blocks.find(b => b.includes('Performance Check') || b.includes('Tweet Performance'));
  if (perfBlock) {
    const impressionMatches = perfBlock.match(/\*\*(\d+) impressions?\*\*/g);
    if (impressionMatches) {
      metrics.totalImpressions = impressionMatches.reduce((sum, m) => {
        const n = m.match(/\d+/);
        return sum + (n ? parseInt(n[0]) : 0);
      }, 0);
    }
  }
  return { conversations, metrics };
}

// ─── Engineering Data ───
function loadProjects() {
  const raw = readSafe(PATHS.projectsJson);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data.projects) ? data.projects : [];
  } catch { return []; }
}

function getProjectStats() {
  const projects = loadProjects();
  let totalTasks = 0, doneTasks = 0, inProgress = 0, failed = 0;
  const projectSummaries = [];

  for (const p of projects) {
    const stateRaw = readSafe(path.join(p.path, 'state.json'));
    let state = null;
    try { state = stateRaw ? JSON.parse(stateRaw) : null; } catch {}

    const summary = {
      name: p.name,
      slug: p.slug || p.name.toLowerCase().replace(/\s+/g, '-'),
      status: p.status,
      path: p.path,
    };

    if (state && Array.isArray(state.tasks)) {
      const tasks = state.tasks;
      summary.total = tasks.length;
      summary.done = tasks.filter(t => t.status === 'done').length;
      summary.inProgress = tasks.filter(t => t.status === 'in_progress').length;
      summary.failed = tasks.filter(t => t.status === 'failed').length;
      summary.lastUpdated = state.lastUpdated;
      totalTasks += summary.total;
      doneTasks += summary.done;
      inProgress += summary.inProgress;
      failed += summary.failed;
    }

    projectSummaries.push(summary);
  }

  return { totalTasks, doneTasks, inProgress, failed, projects: projectSummaries };
}

function getProjectTasks(slug) {
  const projects = loadProjects();
  const proj = projects.find(p => (p.slug || p.name.toLowerCase().replace(/\s+/g, '-')) === slug);
  if (!proj) return null;
  const stateRaw = readSafe(path.join(proj.path, 'state.json'));
  if (!stateRaw) return null;
  try { return JSON.parse(stateRaw); } catch { return null; }
}

function getTasksMd(slug) {
  const projects = loadProjects();
  const proj = projects.find(p => (p.slug || p.name.toLowerCase().replace(/\s+/g, '-')) === slug);
  if (!proj) return null;
  return readSafe(path.join(proj.path, 'TASKS.md'));
}

// ─── Research Data ───
function getResearchFindings() {
  const files = readdirSafe(PATHS.researchFindings).filter(f => f.endsWith('.md'));
  const findings = [];
  for (const file of files) {
    const raw = readSafe(path.join(PATHS.researchFindings, file));
    if (!raw) continue;
    const titleMatch = raw.match(/^# (.+)/m);
    const dateMatch = raw.match(/\*\*Date:\*\*\s*(.+)/);
    // Get first paragraph as summary
    const lines = raw.split('\n');
    let summary = '';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('---') && i > 2) {
        // find first real paragraph after frontmatter
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('## ')) {
            summary = lines[j].replace('## ', '');
            break;
          }
        }
        break;
      }
    }
    findings.push({
      file: file.replace('.md', ''),
      title: titleMatch ? titleMatch[1] : file.replace('.md', ''),
      date: dateMatch ? dateMatch[1] : null,
      summary,
      size: raw.length,
      sections: (raw.match(/^## /gm) || []).length,
    });
  }
  return findings;
}

// ─── Git Stats (lightweight) ───
function getGitPushCount() {
  // Count recent commits across projects
  let count = 0;
  const projects = loadProjects();
  for (const p of projects) {
    try {
      const gitLog = require('child_process').execSync(
        `cd "${p.path}" && git log --oneline --since="midnight" 2>/dev/null | wc -l`,
        { encoding: 'utf8', timeout: 2000 }
      ).trim();
      count += parseInt(gitLog) || 0;
    } catch {}
  }
  return count;
}

// ─── Aggregate Dashboard ───
function apiDashboard(res) {
  const agents = parseAgentHealth();
  const issues = parseKeyIssues();
  const eng = getProjectStats();
  const content = {
    posts: parsePostedLog(),
    engagement: parseEngagement(),
    feed: parseFeed('content'),
  };
  const research = {
    findings: getResearchFindings(),
    feed: parseFeed('research'),
  };
  const comms = {
    feed: parseFeed('comms'),
  };
  const engineering = {
    ...eng,
    feed: parseFeed('engineering'),
    commits: getGitPushCount(),
  };

  // Count today's tweets
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPosts = content.posts.filter(p => p.header && p.header.includes(todayStr)).length;

  json(res, 200, {
    overview: {
      agents,
      issues,
      todayTweets: todayPosts,
      todayCommits: engineering.commits,
      todayFindings: research.findings.length,
    },
    content,
    engineering,
    research,
    comms,
    timestamp: new Date().toISOString(),
  });
}

// ─── Serve Static ───
function serveFile(res, filename, contentType) {
  const fp = path.join(ROOT, filename);
  const data = readSafe(fp);
  if (!data) return err(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

// ─── Router ───
const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);

    if (p === '/' || p === '/index.html') return serveFile(res, 'index.html', 'text/html');
    if (p === '/api/dashboard') return apiDashboard(res);

    // Per-project task detail
    const projMatch = p.match(/^\/api\/project\/([a-z0-9-]+)\/(state|tasks)$/);
    if (projMatch) {
      const [, slug, type] = projMatch;
      if (type === 'state') {
        const state = getProjectTasks(slug);
        return state ? json(res, 200, state) : err(res, 404, 'Not found');
      }
      if (type === 'tasks') {
        const md = getTasksMd(slug);
        return md ? json(res, 200, { content: md }) : err(res, 404, 'Not found');
      }
    }

    err(res, 404, 'Not found');
  } catch (e) { err(res, 500, e.message); }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use`);
    process.exit(1);
  }
  console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard V2 running at http://${HOST}:${PORT}/`);
});
