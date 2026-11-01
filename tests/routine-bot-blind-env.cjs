// Isolated local playtest entry. Never shipped by the production HTML.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./routine-bot-server.cjs');
const ids = ['wait-beat', 'condition-fork', 'coop-finale'];
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: 'narrow', viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true }
];
function fixture(id) {
  if (!ids.includes(id)) throw new Error('Unsupported playtest stage');
  return { version: 2, currentLevel: id, unlocked: ids, completed: {}, programs: {}, records: {}, challenges: {}, tutorialSeen: {}, settings: { speed: 1, muted: true } };
}
function createBlindServer() {
  const assets = createServer();
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/blind-play') { assets.emit('request', req, res); return; }
    const id = url.searchParams.get('level') || ids[0];
    if (!ids.includes(id)) { res.writeHead(400); res.end('Unknown stage'); return; }
    // A fresh browser context is required for each first-time exploration.
    // Reload retains authored programs, failures and naturally earned results.
    const seed = JSON.stringify(fixture(id));
    const bootstrap = `<base href="/WebSim/routine_bot/"><script>if(localStorage.getItem('routinebot-save-v1')===null)localStorage.setItem('routinebot-save-v1',JSON.stringify(${seed}));</script>`;
    const html = fs.readFileSync(path.join(__dirname, '../routine_bot/routine_bot.html'), 'utf8').replace('<head>', '<head>' + bootstrap);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });
}
if (require.main === module) {
  const server = createBlindServer();
  const port = Number(process.env.PORT || 8125);
  server.listen(port, '127.0.0.1', () => {
    for (const id of ids) console.log(`http://127.0.0.1:${port}/blind-play?level=${id}`);
    console.log('Use a fresh browser context per stage/profile; profiles:', JSON.stringify(profiles));
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { fixture, profiles, createBlindServer };
