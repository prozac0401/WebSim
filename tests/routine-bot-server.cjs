// Local development/test server only. Emulates the GitHub Pages /WebSim/ prefix.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };
function createServer({ root = path.resolve(__dirname, '..'), mount = '/WebSim/' } = {}) {
  const absoluteRoot = fs.realpathSync(root);
  return http.createServer(async (request, response) => {
    function finish(code, text) { response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text); }
    if (!['GET', 'HEAD'].includes(request.method)) { finish(405, 'Method not allowed'); return; }
    let pathname;
    try { pathname = decodeURIComponent(request.url.split('?')[0]); }
    catch (_) { finish(400, 'Malformed path'); return; }
    if (pathname === mount.slice(0, -1)) { response.writeHead(302, { Location: mount }); response.end(); return; }
    if (!pathname.startsWith(mount)) { finish(404, 'Use the /WebSim/ project path'); return; }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.slice(mount.length).split('/').some(part => part === '.' || part === '..' || part.startsWith('.'))) { finish(403, 'Forbidden path'); return; }
    let target = path.resolve(absoluteRoot, pathname.slice(mount.length));
    if (target !== absoluteRoot && !target.startsWith(absoluteRoot + path.sep)) { finish(403, 'Forbidden path'); return; }
    try {
      let stat = await fs.promises.stat(target);
      if (stat.isDirectory()) { target = path.join(target, 'index.html'); stat = await fs.promises.stat(target); }
      const actual = await fs.promises.realpath(target);
      if (actual !== absoluteRoot && !actual.startsWith(absoluteRoot + path.sep)) { finish(403, 'Forbidden path'); return; }
      if (!stat.isFile()) { finish(404, 'Not found'); return; }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = fs.createReadStream(target);
      stream.on('error', () => response.destroy()); stream.pipe(response);
    } catch (_) { finish(404, 'Not found'); }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8123);
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`Routine Bot static server: http://127.0.0.1:${port}/WebSim/`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createServer };
