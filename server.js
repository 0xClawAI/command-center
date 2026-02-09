const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 3400;
const HOST = '0.0.0.0';
const PROJECTS_JSON = path.join(os.homedir(), '.openclaw', 'workspace', 'projects.json');
const ROOT = __dirname;
const MAX_ENTRIES = 50;
const STALE_DAYS = 7;
const ALLOWED_EXT = new Set(['.json', '.txt', '.md']);

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function err(res, status, msg) { json(res, status, { error: msg }); }
function slugify(name) { return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }

function loadProjects() {
  const data = JSON.parse(fs.readFileSync(PROJECTS_JSON, 'utf8'));
  if (!data || !Array.isArray(data.projects)) throw new Error('projects.json must have "projects" array');
  return data.projects;
}

function findBySlug(projects, slug) {
  return projects.find(p => (p.slug || slugify(p.name)) === slug);
}

function readSafe(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return null; } }

function safePath(base, fp) {
  const resolved = path.resolve(fp);
  const resolvedBase = path.resolve(base);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) return null;
  if (!ALLOWED_EXT.has(path.extname(resolved))) return null;
  return resolved;
}

function readState(projPath) {
  const fp = safePath(projPath, path.join(projPath, 'state.json'));
  if (!fp) return null;
  const raw = readSafe(fp);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function parseProgress(raw) {
  if (!raw) return [];
  return raw.split(/^={80,}$/m).filter(e => e.trim()).slice(-MAX_ENTRIES);
}

function withProjects(res, fn) {
  let projects;
  try { projects = loadProjects(); } catch (e) { return err(res, 500, `Failed to load projects: ${e.message}`); }
  return fn(projects);
}

function withProject(res, slug, fn) {
  return withProjects(res, projects => {
    const proj = findBySlug(projects, slug);
    if (!proj) return err(res, 404, 'Project not found');
    return fn(proj);
  });
}

// --- Route handlers ---
function serveIndex(res) {
  const fp = path.join(ROOT, 'index.html');
  const content = readSafe(fp);
  if (!content) return err(res, 500, 'index.html not found');
  res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(content) });
  res.end(content);
}

function apiProjects(res) {
  withProjects(res, projects => json(res, 200, { projects }));
}

function apiProjectState(res, slug) {
  withProject(res, slug, proj => {
    const fp = safePath(proj.path, path.join(proj.path, 'state.json'));
    if (!fp) return err(res, 404, 'Invalid path');
    const raw = readSafe(fp);
    if (!raw) return err(res, 404, 'No state.json — project may not be migrated');
    try { json(res, 200, JSON.parse(raw)); } catch { err(res, 500, 'state.json is malformed'); }
  });
}

function apiProjectProgress(res, slug) {
  withProject(res, slug, proj => {
    const fp = safePath(proj.path, path.join(proj.path, 'progress.txt'));
    if (!fp) return json(res, 200, { entries: [] });
    json(res, 200, { entries: parseProgress(readSafe(fp)) });
  });
}

function apiProjectTasks(res, slug) {
  withProject(res, slug, proj => {
    const fp = safePath(proj.path, path.join(proj.path, 'TASKS.md'));
    if (!fp) return err(res, 404, 'Invalid path');
    const raw = readSafe(fp);
    if (!raw) return err(res, 404, 'TASKS.md not found');
    json(res, 200, { content: raw });
  });
}

function apiOverview(res) {
  withProjects(res, projects => {
    const now = Date.now();
    let active = 0, paused = 0, complete = 0;
    const attention = [], activity = [], content = [], research = [];

    for (const p of projects) {
      if (p.status === 'active') active++;
      else if (p.status === 'paused') paused++;
      else if (p.status === 'complete') complete++;

      const slug = p.slug || slugify(p.name);
      const state = readState(p.path);

      if (!state) {
        if (p.status === 'active') {
          attention.push({ project: p.name, slug, reason: 'Not migrated to orchestrator', severity: 'medium' });
        }
        continue;
      }

      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const failed = tasks.filter(t => t.status === 'failed');
      if (failed.length > 0) {
        attention.push({
          project: p.name, slug,
          reason: `${failed.length} failed task${failed.length > 1 ? 's' : ''} (${failed.map(t => t.id).join(', ')})`,
          severity: 'high',
        });
      }

      if (p.status === 'active' && state.lastUpdated) {
        const days = (now - new Date(state.lastUpdated).getTime()) / 864e5;
        if (days > STALE_DAYS) {
          attention.push({ project: p.name, slug, reason: `No activity in ${Math.floor(days)} days`, severity: 'medium' });
        }
      }

      if (Array.isArray(state.activity)) {
        for (const a of state.activity) {
          activity.push({ project: p.name, slug, message: a.message, type: a.type, time: a.time });
        }
      }

      for (const t of tasks) {
        const entry = { id: t.id, title: t.title, type: t.type, status: t.status, project: p.name, slug, milestone: t.milestone };
        if (t.type === 'content' || t.type === 'marketing') content.push(entry);
        if (t.type === 'research' || t.type === 'analysis') research.push(entry);
      }
    }

    const sev = { high: 0, medium: 1, low: 2, info: 3 };
    attention.sort((a, b) => (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9));
    activity.sort((a, b) => (b.time ? new Date(b.time).getTime() : 0) - (a.time ? new Date(a.time).getTime() : 0));

    json(res, 200, {
      totalProjects: projects.length, activeProjects: active, pausedProjects: paused, completeProjects: complete,
      needsAttention: attention, recentActivity: activity.slice(0, 50),
      crossProjectTasks: { content, research },
    });
  });
}

// --- Router ---
const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
    const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);

    if (pathname === '/' || pathname === '/index.html') return serveIndex(res);
    if (pathname === '/api/projects') return apiProjects(res);
    if (pathname === '/api/overview') return apiOverview(res);

    const m = pathname.match(/^\/api\/project\/([^/]+)\/(state|progress|tasks)$/);
    if (m) {
      const [, slug, resource] = m;
      if (slug.includes('..') || slug.includes('/') || slug.includes('\\') || slug.includes('%')) {
        return err(res, 404, 'Project not found');
      }
      if (resource === 'state') return apiProjectState(res, slug);
      if (resource === 'progress') return apiProjectProgress(res, slug);
      if (resource === 'tasks') return apiProjectTasks(res, slug);
    }

    err(res, 404, 'Not found');
  } catch (e) { err(res, 500, `Internal server error: ${e.message}`); }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use. Choose a different port with PORT=<number> node server.js`);
    process.exit(1);
  }
  console.error(`Server error: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Command Center API server running at http://${HOST}:${PORT}/`);
  console.log(`Projects registry: ${PROJECTS_JSON}`);
});
