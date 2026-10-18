// Run against a live static server (local prefix or public Pages deployment).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = new URL((process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/'));
const phase = process.argv[2] || 'final';
const output = path.resolve(process.env.WEBSIM_EVIDENCE || `output/playwright/routine-bot/${phase}`);
const checks = [], visited = new Set();
async function get(url, expectedType) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  if (expectedType) assert.match(response.headers.get('content-type') || '', expectedType, `${url}: MIME type`);
  checks.push({ url: url.toString(), status: response.status, contentType: response.headers.get('content-type') });
  return response.text();
}
const attributes = (html, tag, attr) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'gi'))].map(match => match[1]);
async function localAssets(html, pageUrl) {
  const files = [...attributes(html, 'script', 'src'), ...attributes(html, 'link', 'href'), ...attributes(html, 'img', 'src')];
  for (const file of files) {
    const url = new URL(file, pageUrl);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || visited.has(url.href)) continue;
    visited.add(url.href);
    const content = await get(url, /\.css$/.test(url.pathname) ? /text\/css/ : /\.js$/.test(url.pathname) ? /javascript/ : undefined);
    if (/\.css$/.test(url.pathname)) {
      for (const match of content.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) {
        if (match[1].startsWith('data:') || match[1].startsWith('#')) continue;
        const asset = new URL(match[1], url);
        if (asset.origin === base.origin && !visited.has(asset.href)) { visited.add(asset.href); await get(asset); }
      }
    }
  }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    const menu = await get(base, /text\/html/);
    const entry = attributes(menu, 'a', 'href').find(href => href === 'routine_bot/routine_bot.html' || href.endsWith('/routine_bot/routine_bot.html'));
    assert.ok(entry, 'The static game catalog must contain the Routine Bot entry');
    const gameUrl = new URL(entry, base);
    const game = await get(gameUrl, /text\/html/);
    assert.match(game, /루틴봇/);
    assert.ok(attributes(game, 'a', 'href').some(href => {
      const url = new URL(href, gameUrl); return url.href === base.href || url.href === new URL('index.html', base).href;
    }), 'Game must offer a relative path back to the WebSim list');
    await localAssets(menu, base); await localAssets(game, gameUrl);
    // Existing game links remain reachable; checking their HTML is a smoke test,
    // not a claim that every legacy simulator was interactively re-tested.
    const legacy = new Set(attributes(menu, 'a', 'href').filter(href => /\.html(?:$|[?#])/.test(href) && !/^(https?:)?\/\//.test(href) && !href.includes('routine_bot/')));
    for (const href of legacy) await get(new URL(href, base), /text\/html/);
    const report = { status: 'PASS', phase, base: base.href, generatedAt: new Date().toISOString(), legacyLinks: legacy.size, checks };
    fs.writeFileSync(path.join(output, 'deployment.json'), JSON.stringify(report, null, 2));
    console.log(`PASS static menu entry, game resources, return link and ${legacy.size} existing HTML links at ${base.href}`);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ status: 'FAIL', phase, base: base.href, checks, error: error.message }, null, 2));
    console.error(error); process.exitCode = 1;
  }
})();
