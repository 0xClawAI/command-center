const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 3400;
const HOST = '0.0.0.0';
const PROJECTS_JSON = path.join(os.homedir(), '.openclaw', 'workspace', 'projects.json');
const DEPARTMENTS_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'org', 'departments');
const CONTENT_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'content');
const KNOWLEDGE_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'knowledge');
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
  let raw;
  try { raw = fs.readFileSync(PROJECTS_JSON, 'utf8'); } catch { return []; }
  if (!raw || !raw.trim()) return [];
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!data || !Array.isArray(data.projects)) return [];
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
    // Check if the project directory exists
    try {
      fs.accessSync(proj.path, fs.constants.F_OK);
    } catch {
      return json(res, 404, { error: 'Directory not found', code: 'DIR_NOT_FOUND' });
    }
    const fp = safePath(proj.path, path.join(proj.path, 'state.json'));
    if (!fp) return err(res, 404, 'Invalid path');
    const raw = readSafe(fp);
    if (!raw) return json(res, 404, { error: 'No state.json — project may not be migrated', code: 'NO_STATE' });
    try { json(res, 200, JSON.parse(raw)); } catch { json(res, 500, { error: 'state.json is malformed', code: 'MALFORMED' }); }
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

      // Check if directory exists
      let dirExists = true;
      try { fs.accessSync(p.path, fs.constants.F_OK); } catch { dirExists = false; }

      if (!dirExists) {
        attention.push({ project: p.name, slug, reason: 'Directory not found', severity: 'high' });
        continue;
      }

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

// --- Ideas endpoint ---
const IDEAS_GLOBAL = path.join(os.homedir(), '.openclaw', 'workspace', 'IDEAS.md');

function parseIdeasMd(raw, source) {
  if (!raw) return [];
  const ideas = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    // Match: - [ ] **Title** — description #tags  OR  - [x] **Title** — description #tags
    const m = line.match(/^-\s+\[([ xX])\]\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === 'x';
    const title = m[2].trim();
    const rest = m[3].trim();

    // Extract tags (#word or #key:value)
    const tags = [];
    let blocker = null;
    let doneDate = null;
    let status = checked ? 'done' : 'open';
    const tagRe = /#([a-z0-9_-]+(?::[^\s#]+)?)/gi;
    let tm;
    while ((tm = tagRe.exec(rest)) !== null) {
      const tag = tm[1];
      tags.push(tag);
      if (tag.startsWith('blocked:')) {
        status = 'blocked';
        blocker = tag.slice(8);
      }
      if (tag.startsWith('done:')) {
        status = 'done';
        doneDate = tag.slice(5);
      }
    }

    // Description = rest without tags
    const description = rest.replace(/#[a-z0-9_:+-]+/gi, '').trim();

    const idea = { text: line.trim(), title, description, status, tags, source };
    if (blocker) idea.blocker = blocker;
    if (doneDate) idea.doneDate = doneDate;
    ideas.push(idea);
  }
  return ideas;
}

function apiIdeas(res) {
  withProjects(res, projects => {
    const result = [];

    // Build lookup: lowercased project name/slug -> display name
    const projLookup = {};
    for (const p of projects) {
      const name = p.name || 'unknown';
      projLookup[name.toLowerCase()] = name;
      projLookup[(p.slug || slugify(name))] = name;
    }

    // Global IDEAS.md
    const globalRaw = readSafe(IDEAS_GLOBAL);
    const globalIdeas = parseIdeasMd(globalRaw, 'global');
    result.push(...globalIdeas);

    // Per-project IDEAS.md
    for (const p of projects) {
      const fp = path.join(p.path, 'IDEAS.md');
      const raw = readSafe(fp);
      if (!raw) continue;
      const name = p.name || 'unknown';
      result.push(...parseIdeasMd(raw, name));
    }

    // Re-route ideas with #project:name tags to the named project
    for (const idea of result) {
      for (const tag of idea.tags) {
        if (tag.toLowerCase().startsWith('project:')) {
          const target = tag.slice(8);
          const match = projLookup[target.toLowerCase()];
          if (match) {
            idea.source = match;
          } else {
            // Use the tag value as-is if no project match
            idea.source = target;
          }
          // Remove #project:name from display tags
          idea.tags = idea.tags.filter(t => t !== tag);
          break;
        }
      }
    }

    json(res, 200, { ideas: result });
  });
}

// --- Departments endpoint ---
function apiDepartments(res) {
  let dirs;
  try {
    dirs = fs.readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch { return json(res, 200, { departments: [] }); }

  const now = Date.now();
  const departments = [];
  const allEntries = [];

  for (const name of dirs) {
    const base = path.join(DEPARTMENTS_DIR, name);
    const statusRaw = readSafe(path.join(base, 'status.md'));
    const inboxRaw = readSafe(path.join(base, 'inbox.md'));
    const outboxRaw = readSafe(path.join(base, 'outbox.md'));

    // Parse status.md
    let currentFocus = '';
    let lastUpdated = null;
    if (statusRaw) {
      // Look for "Currently Working On" or "Current focus" or "## Current: ..."
      const focusMatch = statusRaw.match(/^## Current(?:ly Working On)?[:\s]*(.+)/im)
        || statusRaw.match(/\*\*Current focus:\*\*\s*(.+)/i);
      if (focusMatch) currentFocus = focusMatch[1].trim();

      // Look for timestamps
      const tsMatch = statusRaw.match(/(?:Last updated|Updated)[:\s]*(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?\s*(?:PST|PT|UTC)?)/i);
      if (tsMatch) {
        const parsed = new Date(tsMatch[1].replace(/\s*(PST|PT)$/i, ' GMT-0800'));
        if (!isNaN(parsed.getTime())) lastUpdated = parsed.toISOString();
      }
    }

    // If no parsed timestamp, use file mtime
    if (!lastUpdated) {
      try {
        const stat = fs.statSync(path.join(base, 'status.md'));
        lastUpdated = stat.mtime.toISOString();
      } catch {}
    }

    // Count ## [ entries in inbox/outbox
    const entryPattern = /^## \[/gm;
    const inboxCount = inboxRaw ? (inboxRaw.match(entryPattern) || []).length : 0;
    const outboxCount = outboxRaw ? (outboxRaw.match(entryPattern) || []).length : 0;

    // Parse outbox entries
    const outboxEntries = [];
    if (outboxRaw) {
      const entryRegex = /^## \[([^\]]+)\]\s*(.+)?$/gm;
      let m;
      while ((m = entryRegex.exec(outboxRaw)) !== null) {
        const ts = m[1].trim();
        const title = (m[2] || '').trim();
        // Get first non-empty line after the heading as description
        const afterIdx = m.index + m[0].length;
        const rest = outboxRaw.slice(afterIdx, afterIdx + 500);
        const descMatch = rest.match(/\n(?:[-*]\s*)?(?:\*\*What(?::|\*\*)|)?\s*(.+)/);
        const desc = descMatch ? descMatch[1].replace(/\*\*/g, '').trim() : '';
        const entry = { timestamp: ts, title, description: desc, department: name };

        // Try to parse timestamp for sorting
        let parsedTs = new Date(ts.replace(/\s*(PST|PT)$/i, ' GMT-0800'));
        if (isNaN(parsedTs.getTime())) {
          // Try without timezone
          parsedTs = new Date(ts);
        }
        entry.parsedTime = !isNaN(parsedTs.getTime()) ? parsedTs.toISOString() : null;

        outboxEntries.push(entry);
        allEntries.push(entry);
      }
    }

    // Latest inbox/outbox
    const inboxLatest = inboxRaw ? (inboxRaw.match(/^## \[([^\]]+)\]\s*(.+)?$/m) || []) : [];
    const outboxLatest = outboxEntries.length > 0 ? outboxEntries[0] : null;

    departments.push({
      name,
      status: {
        currentFocus,
        lastUpdated
      },
      inbox: {
        count: inboxCount,
        latest: inboxLatest.length > 2 ? (inboxLatest[2] || '').trim() : null
      },
      outbox: {
        count: outboxCount,
        latest: outboxLatest ? outboxLatest.title : null,
        entries: outboxEntries
      }
    });
  }

  // Sort all entries by timestamp descending
  allEntries.sort((a, b) => {
    const ta = a.parsedTime ? new Date(a.parsedTime).getTime() : 0;
    const tb = b.parsedTime ? new Date(b.parsedTime).getTime() : 0;
    return tb - ta;
  });

  json(res, 200, { departments, activityFeed: allEntries.slice(0, 20) });
}

// --- Per-department detail endpoint ---
function formatDeptName(name) {
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function parseMarkdownEntries(raw) {
  if (!raw) return [];
  const entries = [];
  const parts = raw.split(/^## /m).slice(1);
  for (const part of parts) {
    const lines = part.split('\n');
    const heading = lines[0].trim();
    const tsMatch = heading.match(/^\[([^\]]+)\]\s*(.*)/);
    let timestamp = null, title = heading;
    if (tsMatch) {
      timestamp = tsMatch[1].trim();
      title = tsMatch[2].trim();
    }
    const body = lines.slice(1).join('\n').trim();
    entries.push({ timestamp, title, body });
  }
  return entries;
}

function parseStatusMd(raw) {
  if (!raw) return {};
  const result = {};
  // Current focus
  const focusMatch = raw.match(/^## Current(?:ly Working On)?[:\s]*(.+)/im)
    || raw.match(/\*\*Current focus:\*\*\s*(.+)/i);
  if (focusMatch) result.currentFocus = focusMatch[1].trim();

  // Parse all bullet items under "Currently Working On"
  const workingSection = raw.match(/## Currently Working On\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (workingSection) {
    result.workingItems = workingSection[1].split('\n')
      .filter(l => l.match(/^[-*]\s/))
      .map(l => l.replace(/^[-*]\s+/, '').trim());
  }

  // Blocked
  const blockedSection = raw.match(/## Blocked On\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (blockedSection) {
    result.blockedItems = blockedSection[1].split('\n')
      .filter(l => l.match(/^[-*]\s/) && !l.match(/nothing/i))
      .map(l => l.replace(/^[-*]\s+/, '').trim());
  }

  // Next Up
  const nextSection = raw.match(/## Next Up\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (nextSection) {
    result.nextItems = nextSection[1].split('\n')
      .filter(l => l.match(/^[-*]\s/))
      .map(l => l.replace(/^[-*]\s+/, '').trim());
  }

  // Remaining Queue (content)
  const queueSection = raw.match(/## Remaining Queue\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (queueSection) {
    result.queue = queueSection[1].split('\n')
      .filter(l => l.match(/^[-*]\s/))
      .map(l => l.replace(/^[-*]\s+/, '').trim());
  }

  // Completed items
  const completedSection = raw.match(/## (?:Completed This Wake|What Got Done This Wake)\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (completedSection) {
    result.completed = completedSection[1].split('\n')
      .filter(l => l.match(/^[-*\d]\s|^\d+\./))
      .map(l => l.replace(/^[-*\d]+[.)]\s*/, '').trim());
  }

  // Posted This Wake (content)
  const postedSection = raw.match(/## Posted This Wake\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (postedSection) {
    result.posted = postedSection[1].split('\n')
      .filter(l => l.match(/^\d+\./))
      .map(l => l.replace(/^\d+\.\s*/, '').trim());
  }

  return result;
}

function parsePostedLog(raw) {
  if (!raw) return [];
  const posts = [];
  const tweetBlocks = raw.split(/^### /m).slice(1);
  for (const block of tweetBlocks) {
    const lines = block.split('\n');
    const title = lines[0].trim();
    const post = { title };
    for (const line of lines) {
      const idMatch = line.match(/\*\*ID:\*\*\s*(\d+)/);
      if (idMatch) post.id = idMatch[1];
      const urlMatch = line.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
      if (urlMatch) post.url = urlMatch[1];
      const pillarMatch = line.match(/\*\*Pillar:\*\*\s*(.+)/);
      if (pillarMatch) post.pillar = pillarMatch[1].trim();
      const textMatch = line.match(/\*\*Text:\*\*\s*(.+)/);
      if (textMatch) post.text = textMatch[1].trim();
    }
    posts.push(post);
  }
  return posts;
}

function parseTweetIdeas(raw) {
  if (!raw) return [];
  const ideas = [];
  const blocks = raw.split(/^### /m).slice(1);
  for (const block of blocks) {
    const title = block.split('\n')[0].trim();
    ideas.push({ title, posted: block.includes('POSTED') || block.includes('posted') });
  }
  return ideas;
}

function getFileMtime(fp) {
  try { return fs.statSync(fp).mtime.toISOString(); } catch { return null; }
}

function apiDepartmentDetail(res, name) {
  const base = path.join(DEPARTMENTS_DIR, name);
  try { fs.accessSync(base, fs.constants.F_OK); } catch {
    return err(res, 404, 'Department not found');
  }

  const statusRaw = readSafe(path.join(base, 'status.md'));
  const inboxRaw = readSafe(path.join(base, 'inbox.md'));
  const outboxRaw = readSafe(path.join(base, 'outbox.md'));

  const status = parseStatusMd(statusRaw);
  const inboxEntries = parseMarkdownEntries(inboxRaw);
  const outboxEntries = parseMarkdownEntries(outboxRaw);

  const result = {
    name,
    displayName: formatDeptName(name),
    status,
    statusRaw: statusRaw || '',
    inbox: inboxEntries,
    outbox: outboxEntries,
  };

  // Department-specific data
  if (name === 'content') {
    result.postedLog = parsePostedLog(readSafe(path.join(CONTENT_DIR, 'posted-log.md')));
    result.tweetIdeas = parseTweetIdeas(readSafe(path.join(CONTENT_DIR, 'tweet-ideas.md')));
    result.engagementTracker = readSafe(path.join(CONTENT_DIR, 'engagement-tracker.md'));
  }

  if (name === 'research') {
    // Knowledge base file stats
    const kbFiles = ['technical.md', 'social.md', 'engagement.md'];
    result.knowledgeBase = kbFiles.map(f => ({
      name: f.replace('.md', ''),
      lastUpdated: getFileMtime(path.join(KNOWLEDGE_DIR, f)),
      exists: !!readSafe(path.join(KNOWLEDGE_DIR, f)),
    }));

    // Parse key trends from status
    if (statusRaw) {
      const trendsSection = statusRaw.match(/## Key Trends\n([\s\S]*?)(?=\n##|\n$|$)/);
      if (trendsSection) {
        const trends = trendsSection[1].split(/^### /m).slice(1).map(t => {
          const lines = t.split('\n');
          return { name: lines[0].trim(), detail: lines.slice(1).join(' ').trim().substring(0, 200) };
        });
        result.trends = trends;
      }
    }
  }

  if (name === 'engineering') {
    // Include projects data
    result.projects = loadProjects();

    // Parse active leads table from status.md
    if (statusRaw) {
      const leadsSection = statusRaw.match(/## Active Leads\n([\s\S]*?)(?=\n##|\n$|$)/);
      if (leadsSection) {
        const rows = leadsSection[1].split('\n').filter(l => l.match(/^\|/) && !l.match(/^[\|\s-]+$/));
        if (rows.length > 1) {
          result.activeLeads = rows.slice(1).map(row => {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            return { project: cols[0] || '', task: cols[1] || '', priority: cols[2] || '', status: cols[3] || '' };
          });
        }
      }

      // Parse capacity
      const capacityMatch = statusRaw.match(/(\d+)\/(\d+)\s*lead\s*slots/i);
      if (capacityMatch) {
        result.capacity = { used: parseInt(capacityMatch[1]), total: parseInt(capacityMatch[2]) };
      }
    }
  }

  if (name === 'engagement') {
    result.engagementTracker = readSafe(path.join(CONTENT_DIR, 'engagement-tracker.md'));
    result.pendingReplies = readSafe(path.join(CONTENT_DIR, 'pending-replies.md'));

    // Parse engagement tracker stats
    const etRaw = readSafe(path.join(CONTENT_DIR, 'engagement-tracker.md'));
    if (etRaw) {
      const followersMatch = etRaw.match(/Followers:\s*(\d+)/i);
      const followingMatch = etRaw.match(/Following:\s*(\d+)/i);
      const tweetsMatch = etRaw.match(/Tweets:\s*(\d+)/i);
      result.accountStats = {
        followers: followersMatch ? parseInt(followersMatch[1]) : 0,
        following: followingMatch ? parseInt(followingMatch[1]) : 0,
        tweets: tweetsMatch ? parseInt(tweetsMatch[1]) : 0,
      };

      // Count mentions
      const mentionRows = etRaw.match(/^\|[^|]+\|[^|]+\|[^|]+\|/gm);
      result.mentionsCount = mentionRows ? Math.max(0, mentionRows.length - 2) : 0;

      // Count draft replies from outbox
      const draftCount = (outboxRaw && outboxRaw.match(/Draft \d+/g)) || [];
      result.draftRepliesCount = draftCount.length;
    }
  }

  if (name === 'marketing') {
    const timingRaw = readSafe(path.join(base, 'timing-data.json'));
    if (timingRaw) {
      try { result.timingData = JSON.parse(timingRaw); } catch {}
    }
    const playbookRaw = readSafe(path.join(base, 'distribution-playbook.md'));
    if (playbookRaw) {
      const insights = [];
      const bulletMatches = playbookRaw.match(/^[-*]\s+\*\*[^*]+\*\*/gm) || [];
      for (var b of bulletMatches.slice(0, 5)) {
        insights.push(b.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''));
      }
      result.playbookInsights = insights;
    }
  }

  json(res, 200, result);
}

// --- Router ---
const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
    const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);

    if (pathname === '/' || pathname === '/index.html') return serveIndex(res);
    if (pathname === '/api/projects') return apiProjects(res);
    if (pathname === '/api/overview') return apiOverview(res);
    if (pathname === '/api/ideas') return apiIdeas(res);
    if (pathname === '/api/departments') return apiDepartments(res);

    const deptMatch = pathname.match(/^\/api\/departments\/([a-z0-9-]+)$/);
    if (deptMatch) return apiDepartmentDetail(res, deptMatch[1]);

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
