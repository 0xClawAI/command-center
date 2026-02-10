const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = 3400;

const WORKSPACE = path.join(process.env.HOME, '.openclaw', 'workspace');
const FEED_DIR = path.join(WORKSPACE, 'org', 'feed');

const AGENTS = ['ceo', 'engineering', 'content', 'comms', 'research', 'qa'];

const INBOX_DIRS = {
  ceo: path.join(WORKSPACE, 'inbox'),
  engineering: path.join(WORKSPACE + '-engineering', 'inbox'),
  content: path.join(WORKSPACE + '-content', 'inbox'),
  comms: path.join(WORKSPACE + '-comms', 'inbox'),
  research: path.join(WORKSPACE + '-research', 'inbox'),
  qa: path.join(WORKSPACE + '-qa', 'inbox'),
};

app.use(express.static(path.join(__dirname, 'public')));

function parseFeed(agentName) {
  const feedPath = path.join(FEED_DIR, agentName + '.md');
  try {
    const raw = fs.readFileSync(feedPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.match(/^\*\*\[/));
    return lines.slice(-20).map(line => {
      const timeMatch = line.match(/\*\*\[(\d{1,2}:\d{2})\]\*\*/);
      const text = line.replace(/\*\*\[\d{1,2}:\d{2}\]\*\*\s*/, '').trim();
      return { time: timeMatch ? timeMatch[1] : '??:??', text };
    });
  } catch (e) { return []; }
}

function countInbox(agentName) {
  const dir = INBOX_DIRS[agentName];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    let pending = 0;
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        if (content.includes('Status:** done')) continue;
        pending++;
      } catch (e) { pending++; }
    }
    return { total: files.length, pending };
  } catch (e) { return { total: 0, pending: 0 }; }
}

app.get('/api/agents', (req, res) => {
  const agents = AGENTS.map(name => {
    const feed = parseFeed(name);
    const inbox = countInbox(name);
    const lastActivity = feed.length > 0 ? feed[feed.length - 1] : null;
    return {
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      feed: feed.reverse(),
      inbox,
      lastActivity,
      status: feed.length > 0 ? 'active' : 'idle',
    };
  });
  res.json(agents);
});

app.get('/api/health', (req, res) => {
  try {
    const raw = execSync('pm2 jlist', { timeout: 5000 }).toString();
    const list = JSON.parse(raw);
    const services = list.map(p => ({
      name: p.name,
      status: p.pm2_env.status,
      cpu: p.monit ? p.monit.cpu : 0,
      memory: p.monit ? Math.round(p.monit.memory / 1024 / 1024) : 0,
      uptime: p.pm2_env.pm_uptime,
      restarts: p.pm2_env.restart_time,
      pid: p.pid,
    }));
    const online = services.filter(s => s.status === 'online').length;
    res.json({ services, summary: { total: services.length, online, stopped: services.length - online } });
  } catch (e) {
    res.json({ services: [], summary: { total: 0, online: 0, stopped: 0 }, error: e.message });
  }
});

app.get('/api/inboxes', (req, res) => {
  const inboxes = {};
  let totalPending = 0;
  for (const agent of AGENTS) {
    const counts = countInbox(agent);
    inboxes[agent] = counts;
    totalPending += counts.pending;
  }
  res.json({ inboxes, totalPending });
});

// Token usage tracking
function getTokenUsage() {
  // TODO: Integrate with OpenClaw sessions API when available
  // For now, simulate realistic token usage based on agent activity
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

  // Base token usage simulation (would be replaced with real data)
  const baseUsage = {
    ceo: Math.floor(Math.random() * 5000) + 15000,      // High usage - strategic thinking
    engineering: Math.floor(Math.random() * 8000) + 25000, // Highest - code generation
    content: Math.floor(Math.random() * 4000) + 12000,     // Medium - content creation
    comms: Math.floor(Math.random() * 3000) + 8000,        // Low-medium - social posts
    research: Math.floor(Math.random() * 6000) + 18000,    // High - research analysis
    qa: Math.floor(Math.random() * 3000) + 10000           // Medium - testing analysis
  };

  const totalTokensToday = Object.values(baseUsage).reduce((a, b) => a + b, 0);
  const totalTokensWeek = totalTokensToday * 6.2; // Simulate week usage

  // Token cost calculation (Claude pricing: ~$0.003/1K tokens input, ~$0.015/1K tokens output)
  const avgCostPer1kTokens = 0.009; // Mixed input/output average
  const costToday = (totalTokensToday / 1000) * avgCostPer1kTokens;
  const costWeek = (totalTokensWeek / 1000) * avgCostPer1kTokens;

  return {
    tokens: {
      today: totalTokensToday,
      week: Math.floor(totalTokensWeek),
      perAgent: baseUsage
    },
    costs: {
      today: costToday,
      week: costWeek,
      currency: 'USD'
    },
    lastUpdated: now.toISOString()
  };
}

app.get('/api/metrics', (req, res) => {
  let totalEntries = 0;
  const perAgent = {};
  for (const agent of AGENTS) {
    const feed = parseFeed(agent);
    perAgent[agent] = feed.length;
    totalEntries += feed.length;
  }
  const inboxDepth = {};
  let totalPending = 0;
  for (const agent of AGENTS) {
    const c = countInbox(agent);
    inboxDepth[agent] = c.pending;
    totalPending += c.pending;
  }

  const tokenUsage = getTokenUsage();

  res.json({
    feedEntries: { total: totalEntries, perAgent },
    inboxDepth: { total: totalPending, perAgent: inboxDepth },
    tokenUsage: tokenUsage.tokens,
    costs: tokenUsage.costs,
    lastUpdated: tokenUsage.lastUpdated
  });
});

// GitHub activity tracking
function getGitHubActivity() {
  try {
    // Get current user info
    const userInfo = JSON.parse(execSync('gh api user', { timeout: 5000 }).toString());
    const username = userInfo.login;

    // Get recent commits across repositories in the last 7 days
    const since = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
    const commitsQuery = `author:${username} author-date:>${since.split('T')[0]}`;

    let recentCommits = [];
    let pushesToday = 0;
    let activeRepos = [];

    try {
      // Try GitHub search API first
      const searchResults = JSON.parse(execSync(`gh api search/commits -q "${commitsQuery}" --jq '.items[:10]'`, { timeout: 10000 }).toString());

      const today = new Date().toISOString().split('T')[0];
      const repoSet = new Set();

      recentCommits = searchResults.map(commit => {
        const repo = commit.repository.full_name;
        const commitDate = commit.commit.author.date.split('T')[0];

        repoSet.add(repo);
        if (commitDate === today) {
          pushesToday++;
        }

        return {
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0].substring(0, 80),
          repo: repo,
          date: commit.commit.author.date,
          url: commit.html_url
        };
      });

      activeRepos = Array.from(repoSet).slice(0, 5);

    } catch (searchError) {
      console.warn('GitHub search API failed:', searchError.message);
      // Fallback: Get commits from command-center repo specifically
      try {
        const commitsCmd = `gh api repos/0xClawAI/command-center/commits --jq 'map({sha: .sha[0:7], message: .commit.message | split("\\n")[0], author: .commit.author.name, date: .commit.author.date, url: .html_url}) | .[0:10]'`;
        const commandCenterCommits = JSON.parse(execSync(commitsCmd, { timeout: 10000 }).toString());

        const today = new Date().toISOString().split('T')[0];
        recentCommits = commandCenterCommits.map(commit => ({
          sha: commit.sha,
          message: commit.message.substring(0, 80),
          repo: 'command-center',
          date: commit.date,
          url: commit.url
        }));

        // Count today's pushes
        pushesToday = commandCenterCommits.filter(c => c.date.startsWith(today)).length;
        activeRepos = ['command-center'];

      } catch (repoError) {
        console.warn('Failed to get repo commits:', repoError.message);
        // Final fallback: try git log in current directory
        try {
          const currentRepoCommits = execSync(`git log --oneline --since="7 days ago" --author="${username}" | head -5`, { timeout: 5000 }).toString().trim();
          if (currentRepoCommits) {
            const lines = currentRepoCommits.split('\n');
            const today = new Date().toISOString().split('T')[0];
            recentCommits = lines.map(line => {
              const [sha, ...msgParts] = line.split(' ');
              return {
                sha: sha.substring(0, 7),
                message: msgParts.join(' ').substring(0, 80),
                repo: 'current',
                date: new Date().toISOString(),
                url: '#'
              };
            });
            pushesToday = lines.length; // Approximate since we can't easily get just today
            activeRepos = ['current'];
          }
        } catch (gitError) {
          console.warn('Git log fallback failed:', gitError.message);
        }
      }
    }

    // Get user's public repositories
    let totalRepos = 0;
    try {
      const repos = JSON.parse(execSync('gh api user/repos --jq ". | length"', { timeout: 5000 }).toString());
      totalRepos = repos;
    } catch (repoError) {
      console.warn('Failed to get repo count:', repoError.message);
    }

    return {
      recentCommits,
      pushesToday,
      activeRepos,
      totalRepos,
      username,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.warn('GitHub API unavailable:', error.message);
    return {
      recentCommits: [],
      pushesToday: 0,
      activeRepos: [],
      totalRepos: 0,
      username: 'unknown',
      lastUpdated: new Date().toISOString(),
      error: 'GitHub CLI not available or not authenticated'
    };
  }
}

app.get('/api/github', (req, res) => {
  const activity = getGitHubActivity();
  res.json(activity);
});

// Twitter activity tracking
function getTwitterActivity() {
  // TODO: Replace with real Twitter API integration when available
  // For now, simulate realistic Twitter metrics based on typical engagement patterns
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Simulate follower count with some daily variation
  const baseFollowers = 1250; // Base follower count
  const dailyVariation = Math.floor(Math.random() * 20) - 10; // +/- 10 followers per day
  const followerCount = baseFollowers + dailyVariation;

  // Simulate engagement metrics for today
  const tweetsToday = Math.floor(Math.random() * 5) + 1; // 1-5 tweets per day
  const likesReceived = Math.floor(Math.random() * 150) + 50; // 50-200 likes
  const retweets = Math.floor(Math.random() * 25) + 5; // 5-30 retweets
  const replies = Math.floor(Math.random() * 30) + 10; // 10-40 replies
  const impressions = Math.floor(Math.random() * 5000) + 2000; // 2k-7k impressions

  // Engagement rate calculation (likes + retweets + replies) / impressions
  const totalEngagement = likesReceived + retweets + replies;
  const engagementRate = impressions > 0 ? (totalEngagement / impressions * 100) : 0;

  // Simulate recent top tweets
  const topTweets = [
    {
      id: 'tweet_1',
      text: 'Just shipped a major update to our AI orchestration dashboard. Real-time agent coordination feels like mission control now 🚀',
      likes: Math.floor(Math.random() * 50) + 20,
      retweets: Math.floor(Math.random() * 15) + 5,
      replies: Math.floor(Math.random() * 10) + 3,
      timestamp: new Date(now.getTime() - (Math.random() * 6 * 60 * 60 * 1000)).toISOString(), // Within last 6 hours
      url: 'https://twitter.com/0xclaw/status/123456789'
    },
    {
      id: 'tweet_2',
      text: 'Working with 6 AI agents simultaneously. The coordination patterns that emerge are fascinating - each agent develops its own "personality" in task routing.',
      likes: Math.floor(Math.random() * 40) + 15,
      retweets: Math.floor(Math.random() * 12) + 3,
      replies: Math.floor(Math.random() * 8) + 2,
      timestamp: new Date(now.getTime() - (Math.random() * 12 * 60 * 60 * 1000)).toISOString(), // Within last 12 hours
      url: 'https://twitter.com/0xclaw/status/123456790'
    },
    {
      id: 'tweet_3',
      text: 'The future of software engineering isn\'t just AI tools - it\'s AI organizations. Watching autonomous agents coordinate complex projects is incredible.',
      likes: Math.floor(Math.random() * 60) + 30,
      retweets: Math.floor(Math.random() * 20) + 8,
      replies: Math.floor(Math.random() * 15) + 5,
      timestamp: new Date(now.getTime() - (Math.random() * 24 * 60 * 60 * 1000)).toISOString(), // Within last 24 hours
      url: 'https://twitter.com/0xclaw/status/123456791'
    }
  ];

  // Sort tweets by engagement (likes + retweets + replies)
  topTweets.sort((a, b) => {
    const engagementA = a.likes + a.retweets + a.replies;
    const engagementB = b.likes + b.retweets + b.replies;
    return engagementB - engagementA;
  });

  return {
    followers: followerCount,
    tweetsToday,
    engagement: {
      likes: likesReceived,
      retweets,
      replies,
      impressions,
      rate: Number(engagementRate.toFixed(2))
    },
    topTweets: topTweets.slice(0, 3), // Top 3 performing tweets
    lastUpdated: now.toISOString(),
    username: '0xclaw'
  };
}

app.get('/api/twitter', (req, res) => {
  const activity = getTwitterActivity();
  res.json(activity);
});

app.listen(PORT, () => console.log('Mission Control on http://localhost:' + PORT));
