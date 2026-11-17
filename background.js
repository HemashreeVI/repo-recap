// Fetches and summarises a repo with the GitHub REST API. Results are cached for 15 minutes,
// because without a token GitHub allows 60 requests an hour (each recap uses about 6).
const API = 'https://api.github.com';
const TTL = 15 * 60 * 1000;
const DAY = 864e5;

async function gh(path, token, accept = 'application/vnd.github+json') {
  const res = await fetch(API + path, { headers: { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    const left = res.headers.get('x-ratelimit-remaining');
    throw new Error(left === '0' ? 'RATE_LIMIT' : 'FORBIDDEN');
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { body: accept.includes('raw') ? await res.text() : await res.json(), headers: res.headers };
}

// ---------------------------------------------------------------- README helpers
function readmeSections(md) {
  const lines = md.replace(/\r/g, '').split('\n'), out = [];
  let cur = { title: '', level: 0, lines: [] }, fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const h = !fence && (l.match(/^(#{1,6})\s+(.*)/) || l.match(/^<h([1-6])[^>]*>(.*?)<\/h\1>/i));
    if (h) { out.push(cur); cur = { title: h[2].replace(/<[^>]+>|[*_`]|:[a-z_]+:/g, '').trim(), level: String(h[1]).length || +h[1], lines: [] }; }
    else cur.lines.push(l);
  }
  out.push(cur);
  return out;
}
function firstParagraph(md) {
  for (const s of readmeSections(md)) {
    const paras = s.lines.join('\n').split(/\n\s*\n/);
    for (let p of paras) {
      p = p.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim();
      if (p.length > 60 && /[a-z]{3,}\s+[a-z]{2,}/i.test(p) && !/^[-=\s]+$/.test(p)) return p.length > 420 ? p.slice(0, 417).replace(/\s\S*$/, '') + '…' : p;
    }
  }
  return '';
}
function runSteps(md) {
  const want = /(getting started|quick ?start|install|setup|set up|usage|how to run|running|run locally|build|development|local)/i;
  for (const s of readmeSections(md)) {
    if (!want.test(s.title)) continue;
    const blocks = [...s.lines.join('\n').matchAll(/(```|~~~)[^\n]*\n([\s\S]*?)\1/g)].map(m => m[2].trim()).filter(b => b && b.length < 600);
    if (blocks.length) return { from: s.title, commands: blocks.slice(0, 3) };
  }
  return null;
}

// ---------------------------------------------------------------- stack detection
const FILES = {
  'package.json': 'Node.js', 'tsconfig.json': 'TypeScript', 'requirements.txt': 'Python (pip)', 'pyproject.toml': 'Python',
  'Pipfile': 'Python (pipenv)', 'pom.xml': 'Maven', 'build.gradle': 'Gradle', 'build.gradle.kts': 'Gradle', 'go.mod': 'Go modules',
  'Cargo.toml': 'Rust (Cargo)', 'Gemfile': 'Ruby (Bundler)', 'composer.json': 'PHP (Composer)', 'pubspec.yaml': 'Flutter/Dart',
  'Dockerfile': 'Docker', 'docker-compose.yml': 'Docker Compose', 'docker-compose.yaml': 'Docker Compose', 'compose.yaml': 'Docker Compose',
  'Makefile': 'Make', 'manage.py': 'Django', 'next.config.js': 'Next.js', 'next.config.mjs': 'Next.js', 'next.config.ts': 'Next.js',
  'vite.config.js': 'Vite', 'vite.config.ts': 'Vite', 'tailwind.config.js': 'Tailwind CSS', 'tailwind.config.ts': 'Tailwind CSS',
  'angular.json': 'Angular', 'svelte.config.js': 'Svelte', 'nuxt.config.ts': 'Nuxt', 'CMakeLists.txt': 'CMake', 'platformio.ini': 'PlatformIO',
  'vercel.json': 'Vercel', 'netlify.toml': 'Netlify', 'k8s': 'Kubernetes', 'helm': 'Helm', 'terraform': 'Terraform', '.github': 'GitHub Actions',
};
const WORDS = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Express', 'NestJS', 'Spring Boot', 'FastAPI', 'Django', 'Flask', 'Rails',
  'Laravel', 'PyTorch', 'TensorFlow', 'scikit-learn', 'OpenCV', 'LangChain', 'Kafka', 'Redis', 'PostgreSQL', 'MySQL', 'MongoDB', 'SQLite',
  'GraphQL', 'Kubernetes', 'Terraform', 'Prometheus', 'Grafana', 'Electron', 'Tauri', 'Flutter', 'React Native', 'Tailwind'];

function guessRun(files, pkg) {
  const has = f => files.includes(f), cmds = [];
  if (has('docker-compose.yml') || has('docker-compose.yaml') || has('compose.yaml')) cmds.push('docker compose up --build');
  if (pkg) {
    const s = pkg.scripts || {};
    cmds.push('npm install', s.dev ? 'npm run dev' : s.start ? 'npm start' : s.build ? 'npm run build' : 'npm start');
  }
  if (has('requirements.txt')) cmds.push('pip install -r requirements.txt');
  else if (has('pyproject.toml')) cmds.push('pip install -e .');
  if (has('manage.py')) cmds.push('python manage.py runserver');
  if (has('pom.xml')) cmds.push(has('mvnw') ? './mvnw spring-boot:run   # or ./mvnw package' : 'mvn package');
  if (has('build.gradle') || has('build.gradle.kts')) cmds.push(has('gradlew') ? './gradlew build' : 'gradle build');
  if (has('go.mod')) cmds.push('go run .');
  if (has('Cargo.toml')) cmds.push('cargo run');
  if (has('Makefile') && !cmds.length) cmds.push('make');
  if (has('index.html') && !cmds.length) cmds.push('# static site: open index.html in a browser');
  return cmds.length ? { from: 'guessed from the repo files', commands: [[...new Set(cmds)].join('\n')] } : null;
}

function activity(repo, commits, lastCommit) {
  const days = lastCommit ? (Date.now() - new Date(lastCommit)) / DAY : Infinity;
  if (repo.archived) return { level: 'archived', label: 'Archived (read-only)' };
  if (days <= 7 && commits >= 10) return { level: 'hot', label: 'Very active' };
  if (days <= 30) return { level: 'ok', label: 'Active' };
  if (days <= 180) return { level: 'slow', label: 'Slowing down' };
  return { level: 'cold', label: 'Inactive' };
}

async function recap(owner, name) {
  const { token = '' } = await chrome.storage.local.get('token');
  const base = `/repos/${owner}/${name}`;
  const repoRes = await gh(base, token);
  if (!repoRes) return { error: 'NOT_FOUND' };
  const repo = repoRes.body;
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [langs, readme, commits, root, gfi] = await Promise.all([
    gh(base + '/languages', token),
    gh(base + '/readme', token, 'application/vnd.github.raw+json').catch(() => null),
    gh(`${base}/commits?per_page=100&since=${since}`, token).catch(() => null),
    gh(base + '/contents', token).catch(() => null),
    gh(`${base}/issues?labels=${encodeURIComponent('good first issue')}&state=open&per_page=100`, token).catch(() => null),
  ]);
  const md = readme?.body || '';
  const files = Array.isArray(root?.body) ? root.body.map(f => f.name) : [];
  let pkg = null;
  if (files.includes('package.json')) {
    try { pkg = JSON.parse((await gh(base + '/contents/package.json', token, 'application/vnd.github.raw+json')).body); } catch { /* ignore */ }
  }
  let last = commits?.body?.[0]?.commit?.committer?.date;
  if (!last) last = (await gh(`${base}/commits?per_page=1`, token).catch(() => null))?.body?.[0]?.commit?.committer?.date || repo.pushed_at;

  const totalBytes = Object.values(langs?.body || {}).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langs?.body || {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([n, b]) => ({ name: n, pct: Math.round((b / totalBytes) * 1000) / 10 }));
  const tools = [...new Set(files.map(f => FILES[f]).filter(Boolean))];
  const deps = pkg ? Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) : [];
  const depHits = { react: 'React', vue: 'Vue', 'next': 'Next.js', express: 'Express', '@nestjs/core': 'NestJS', svelte: 'Svelte',
    'three': 'Three.js', electron: 'Electron', tailwindcss: 'Tailwind CSS', typescript: 'TypeScript', jest: 'Jest', vitest: 'Vitest' };
  for (const d of deps) if (depHits[d]) tools.push(depHits[d]);
  const mentioned = WORDS.filter(w => new RegExp(`(^|[^A-Za-z])${w.replace(/[.+]/g, '\\$&')}(?![A-Za-z])`).test(md) && !tools.includes(w));
  const commitCount = commits?.body?.length ?? 0;

  return {
    full: repo.full_name, url: repo.html_url, description: repo.description || '', homepage: repo.homepage || '',
    summary: firstParagraph(md), topics: repo.topics || [], stars: repo.stargazers_count, forks: repo.forks_count,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : (repo.license ? 'Custom' : ''),
    languages, tools: [...new Set(tools)], mentioned: mentioned.slice(0, 10),
    run: runSteps(md) || guessRun(files, pkg),
    lastCommit: last, commits30: commitCount, commits30Capped: commitCount >= 100,
    openIssues: repo.open_issues_count, goodFirstIssues: Array.isArray(gfi?.body) ? gfi.body.filter(i => !i.pull_request).length : 0,
    created: repo.created_at, archived: repo.archived, fork: repo.fork, defaultBranch: repo.default_branch,
    activity: activity(repo, commitCount, last),
  };
}

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type !== 'recap') return;
  const key = `recap:${msg.owner}/${msg.repo}`.toLowerCase();
  (async () => {
    const hit = (await chrome.storage.session.get(key))[key];
    if (hit && Date.now() - hit.at < TTL && !msg.fresh) return reply(hit.data);
    try {
      const data = await recap(msg.owner, msg.repo);
      if (!data.error) await chrome.storage.session.set({ [key]: { at: Date.now(), data } });
      reply(data);
    } catch (e) { reply({ error: e.message }); }
  })();
  return true;   // reply asynchronously
});
