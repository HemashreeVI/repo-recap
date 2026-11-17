// Adds a "Recap" tab to the right edge of every GitHub repo page. Click it to open the sidebar.
(() => {
  const RESERVED = new Set(['settings', 'orgs', 'organizations', 'marketplace', 'explore', 'topics', 'notifications', 'pulls', 'issues',
    'login', 'logout', 'join', 'signup', 'sponsors', 'features', 'enterprise', 'about', 'pricing', 'search', 'collections', 'trending',
    'new', 'codespaces', 'users', 'apps', 'site', 'security', 'customer-stories', 'readme', 'events', 'dashboard', 'copilot', 'stars',
    'watching', 'account', 'contact', 'team', 'resources', 'solutions', 'github-copilot', 'blog', 'home']);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = d => { const x = Math.floor((Date.now() - new Date(d)) / 864e5); return x <= 0 ? 'today' : x === 1 ? 'yesterday' : x < 60 ? `${x} days ago` : x < 730 ? `${Math.round(x / 30)} months ago` : `${Math.round(x / 365)} years ago`; };
  const LANG = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555',
    'C#': '#178600', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Ruby: '#701516', PHP: '#4F5D95', Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB',
    'Jupyter Notebook': '#DA5B0B', Vue: '#41b883', Svelte: '#ff3e00', SCSS: '#c6538c', Dockerfile: '#384d54' };

  function repoFromUrl() {
    const [owner, repo] = location.pathname.split('/').filter(Boolean);
    if (!owner || !repo || RESERVED.has(owner.toLowerCase()) || owner.startsWith('.')) return null;
    if (!document.querySelector('meta[name="octolytics-dimension-repository_nwo"]') && !document.querySelector('#repository-container-header, [data-testid="repository-container-header"]')) return null;
    return { owner, repo: repo.replace(/\.git$/, '') };
  }

  let host, root, current = '', open = false;
  function mount() {
    if (host) return;
    host = document.createElement('div'); host.id = 'repo-recap-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<link rel="stylesheet" href="${chrome.runtime.getURL('sidebar.css')}">
      <button class="tab" title="Repo Recap">⚡<span>Recap</span></button>
      <aside class="panel" aria-label="Repo Recap"><header><img src="${chrome.runtime.getURL('icons/32.png')}" alt=""><b>Repo Recap</b>
      <button class="refresh" title="Refresh">↻</button><button class="close" title="Close">×</button></header><div class="body"></div></aside>`;
    document.documentElement.appendChild(host);
    root.querySelector('.tab').onclick = () => toggle(true);
    root.querySelector('.close').onclick = () => toggle(false);
    root.querySelector('.refresh').onclick = () => load(true);
  }
  function toggle(v) { open = v; root.querySelector('.panel').classList.toggle('open', v); if (v) load(); }

  async function load(fresh = false) {
    const r = repoFromUrl(); if (!r) return;
    const body = root.querySelector('.body');
    body.innerHTML = `<p class="muted">Reading ${esc(r.owner)}/${esc(r.repo)}…</p>`;
    const d = await chrome.runtime.sendMessage({ type: 'recap', ...r, fresh });
    if (!d || d.error) {
      const why = { RATE_LIMIT: `GitHub's free limit (60 requests an hour) is used up. Add a token in <a href="${chrome.runtime.getURL('options.html')}" target="_blank">settings</a> for 5,000 an hour.`,
        NOT_FOUND: 'This repo is private or doesn\'t exist.', FORBIDDEN: 'GitHub refused the request.' }[d?.error] || `Something went wrong (${esc(d?.error)}).`;
      body.innerHTML = `<p class="err">${why}</p>`; return;
    }
    body.innerHTML = render(d);
    body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
      navigator.clipboard.writeText(b.previousElementSibling.textContent); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200);
    });
  }

  function render(d) {
    const a = d.activity;
    const bar = d.languages.map(l => `<i style="width:${l.pct}%;background:${LANG[l.name] || '#8b949e'}" title="${esc(l.name)} ${l.pct}%"></i>`).join('');
    return `
      <h2>${esc(d.full)}</h2>
      <p class="meta">★ ${d.stars.toLocaleString()} · ⑂ ${d.forks.toLocaleString()}${d.license ? ` · ${esc(d.license)}` : ''}${d.fork ? ' · fork' : ''}</p>
      <section><h3>What it does</h3>
        ${d.description ? `<p class="lead">${esc(d.description)}</p>` : ''}
        ${d.summary && d.summary !== d.description ? `<p>${esc(d.summary)}</p>` : ''}
        ${!d.description && !d.summary ? '<p class="muted">No description or README summary.</p>' : ''}
        ${d.topics.length ? `<div class="chips">${d.topics.slice(0, 8).map(t => `<span class="chip t">${esc(t)}</span>`).join('')}</div>` : ''}
        ${d.homepage ? `<p><a href="${esc(d.homepage)}" target="_blank">↗ ${esc(d.homepage.replace(/^https?:\/\//, ''))}</a></p>` : ''}
      </section>
      <section><h3>Tech stack</h3>
        ${d.languages.length ? `<div class="bar">${bar}</div><div class="langs">${d.languages.map(l => `<span><i style="background:${LANG[l.name] || '#8b949e'}"></i>${esc(l.name)} <b>${l.pct}%</b></span>`).join('')}</div>` : ''}
        ${d.tools.length ? `<div class="chips">${d.tools.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
        ${d.mentioned.length ? `<p class="muted small">Also mentioned in the README: ${d.mentioned.map(esc).join(', ')}</p>` : ''}
      </section>
      <section><h3>How to run</h3>
        ${d.run ? d.run.commands.map(c => `<div class="code"><pre>${esc(c)}</pre><button data-copy>Copy</button></div>`).join('') + `<p class="muted small">From: ${esc(d.run.from)}</p>`
          : '<p class="muted">No setup steps found. Check the README.</p>'}
      </section>
      <section><h3>Activity</h3>
        <p><span class="pill ${a.level}">${esc(a.label)}</span></p>
        <ul class="stats">
          <li><b>${d.lastCommit ? ago(d.lastCommit) : '—'}</b><span>last commit</span></li>
          <li><b>${d.commits30}${d.commits30Capped ? '+' : ''}</b><span>commits in 30 days</span></li>
          <li><b>${d.openIssues}</b><span>open issues + PRs</span></li>
          <li><b>${d.goodFirstIssues}</b><span>good first issues</span></li>
        </ul>
        ${d.goodFirstIssues && a.level !== 'cold' && a.level !== 'archived' ? `<p class="good">✓ Good for a first contribution: <a href="${esc(d.url)}/issues?q=is%3Aopen+label%3A%22good+first+issue%22" target="_blank">see the issues</a></p>` : ''}
        <p class="muted small">Created ${ago(d.created)} · default branch ${esc(d.defaultBranch)}</p>
      </section>`;
  }

  function check() {
    const r = repoFromUrl(), key = r ? `${r.owner}/${r.repo}`.toLowerCase() : '';
    if (key === current) return;
    current = key;
    if (!r) { if (host) host.style.display = 'none'; return; }
    mount(); host.style.display = '';
    if (open) load();
  }
  // GitHub swaps pages without reloading, so watch for URL changes
  document.addEventListener('turbo:load', check);
  window.addEventListener('popstate', check);
  setInterval(check, 1000);
  check();
})();
