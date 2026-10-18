const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('./routine-bot-server.cjs');

function request(port, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}
async function running(t) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}
test('project prefix serves the actual catalog and JavaScript MIME type', async t => {
  const port = await running(t);
  const home = await request(port, '/WebSim/');
  assert.equal(home.status, 200); assert.match(home.headers['content-type'], /text\/html/); assert.match(home.body, /WebSim/);
  const script = await request(port, '/WebSim/routine_bot/storage.js?v=1');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /javascript/);
  assert.match(script.body, /RoutineBotStorage/);
});
test('prefix redirect, absent assets and HEAD behave like a static site', async t => {
  const port = await running(t);
  const redirect = await request(port, '/WebSim');
  assert.equal(redirect.status, 302); assert.equal(redirect.headers.location, '/WebSim/');
  assert.equal((await request(port, '/routine_bot/storage.js')).status, 404);
  assert.equal((await request(port, '/WebSim/missing-file.css')).status, 404);
  const head = await request(port, '/WebSim/routine_bot/storage.js', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, ''); assert.ok(Number(head.headers['content-length']) > 100);
});
test('encoded traversal, hidden repository metadata, malformed and write requests are rejected', async t => {
  const port = await running(t);
  for (const url of ['/WebSim/../README.md', '/WebSim/%2e%2e/README.md', '/WebSim/routine_bot%5c..%5cREADME.md', '/WebSim/.git', '/WebSim/%00']) {
    assert.equal((await request(port, url)).status, 403, url);
  }
  assert.equal((await request(port, '/WebSim/%EA%')).status, 400);
  assert.equal((await request(port, '/WebSim/', 'POST')).status, 405);
});
