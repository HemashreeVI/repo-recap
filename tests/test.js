const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const SHOTS = process.argv[2];
const now = Date.now(), iso = d => new Date(now - d * 864e5).toISOString();

const README = `<p align="center"><img src="logo.png"></p>
# Rocket
[![CI](https://x/badge.svg)](https://x) [![npm](https://x/npm.svg)](https://x)

Rocket is a tiny, fast web framework for Node.js that turns a folder of files into a REST API, with built-in validation, OpenAPI docs and hot reload. It uses Redis for caching and PostgreSQL for storage.

## Features
- Zero config

## Getting started
\`\`\`bash
git clone https://github.com/acme/rocket
cd rocket
npm install
npm run dev
\`\`\`

## Contributing
PRs welcome.`;

const API = {
  '/repos/acme/rocket': { full_name: 'acme/rocket', html_url: 'https://github.com/acme/rocket', description: 'Turn a folder into a REST API in seconds',
    homepage: 'https://rocket.dev', topics: ['nodejs', 'rest-api', 'framework', 'openapi'], stargazers_count: 18342, forks_count: 1204,
    license: { spdx_id: 'MIT' }, open_issues_count: 87, created_at: iso(1200), archived: false, fork: false, default_branch: 'main', pushed_at: iso(1) },
  '/repos/acme/rocket/languages': { TypeScript: 812000, JavaScript: 120400, Shell: 8300, Dockerfile: 2100 },
  '/repos/acme/rocket/readme': README,
  '/repos/acme/rocket/commits': Array.from({ length: 37 }, (_, i) => ({ commit: { committer: { date: iso(1 + i * 0.7) } } })),
  '/repos/acme/rocket/contents': ['package.json', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml', '.github', 'src', 'README.md'].map(name => ({ name })),
  '/repos/acme/rocket/contents/package.json': JSON.stringify({ scripts: { dev: 'tsx watch src', build: 'tsc' }, dependencies: { express: '^4' }, devDependencies: { typescript: '^5', vitest: '^1' } }),
  '/repos/acme/rocket/issues': [{ id: 1 }, { id: 2 }, { id: 3, pull_request: {} }, { id: 4 }],
};

(async () => {
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    const p = req.url.split('?')[0], body = API[p];
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (body === undefined) { res.statusCode = 404; return res.end('{}'); }
    res.setHeader('Content-Type', typeof body === 'string' ? 'text/plain' : 'application/json');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;

  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  fs.cpSync(path.resolve(__dirname, '..'), ext, { recursive: true });
  const bg = path.join(ext, 'background.js');
  fs.writeFileSync(bg, fs.readFileSync(bg, 'utf8').replace("const API = 'https://api.github.com'", `const API = '${base}'`));
  const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); m.host_permissions.push(base + '/*');
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));

  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const page_html = `<!doctype html><html><head><meta name="octolytics-dimension-repository_nwo" content="acme/rocket"><title>acme/rocket</title></head>
    <body style="font-family:system-ui;margin:0;background:#0d1117;color:#e6edf3"><div id="repository-container-header" style="padding:24px 32px;border-bottom:1px solid #30363d">
    <b style="font-size:20px">acme / rocket</b></div><div style="padding:32px;max-width:760px"><h2>README.md</h2><p>Rocket is a tiny, fast web framework…</p></div></body></html>`;
  await ctx.route('https://github.com/**', r => r.fulfill({ contentType: 'text/html', body: page_html }));
  const errors = [];
  const page = await ctx.newPage(); page.on('console', c => c.type() === 'error' && errors.push(c.text()));
  await page.goto('https://github.com/acme/rocket');
  await page.waitForTimeout(1200);
  const tab = page.locator('#repo-recap-host >> css=.tab');
  console.log('Recap tab shown on repo page:', await tab.isVisible());
  await tab.click();
  await page.waitForFunction(() => document.querySelector('#repo-recap-host').shadowRoot.querySelector('.stats'), null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => document.querySelector('#repo-recap-host').shadowRoot.querySelector('.body').innerText);
  console.log(text.replace(/\n+/g, ' | ').slice(0, 900));
  await page.screenshot({ path: `${SHOTS}/rr-sidebar.png` });
  console.log('API requests for first open:', hits);
  // second open should come from the cache
  const before = hits;
  await page.evaluate(() => { const r = document.querySelector('#repo-recap-host').shadowRoot; r.querySelector('.close').click(); });
  await tab.click(); await page.waitForTimeout(600);
  console.log('API requests for re-open (cached):', hits - before);
  // non-repo page: no tab
  const p2 = await ctx.newPage(); await ctx.route('https://github.com/settings/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>settings</body></html>' }));
  await p2.goto('https://github.com/settings/profile'); await p2.waitForTimeout(1200);
  console.log('Recap tab on /settings:', await p2.locator('#repo-recap-host').count() ? 'present (should be hidden)' : 'absent ✓');
  console.log('console errors:', errors.length ? errors : 'none');
  await ctx.close(); srv.close();
})();
