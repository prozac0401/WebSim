const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cards = [...home.matchAll(/<article class="tool-card"[\s\S]*?<\/article>/g)].map(match => match[0]);
const saturday = cards.find(card => card.includes('<h3>멈춘 토요일</h3>'));
const legacyLaunches = [
  'evolving_vehicles_2/evolving_vehicles_2.html', 'weekend_season2/index.html',
  'routine_bot/routine_bot.html', 'braess_city/braess_city.html', 'treasure_lab/treasure_lab.html',
  'microbial_commons/microbial_commons.html', 'reef_market/reef_market.html',
  'music_worlds/music_worlds.html', 'information_cascade/information_cascade.html',
  'shadow_sculpture/shadow_sculpture.html', 'auxetic_workshop/auxetic_workshop.html',
  'rolling_shutter/rolling_shutter.html', 'ink_time_machine/ink_time_machine.html',
  'sound_maze/sound_maze.html', 'evolving_vehicles/evolving_vehicles.html',
  'weekend_recovery_simulator/weekend_recovery_simulator.html', 'qr_generator/qr_generator.html',
  'conway-game-of-life/conway-game-of-life.html', 'aco_simulator/aco_simulator.html',
  'boids_simulation/boids_simulation.html', 'cosmic-simulator-single-div/cosmic-simulator-single-div.html',
  'gravity_simulator/gravity_simulator.html', 'langtons_ant_simulator/langtons_ant_simulator.html',
  'ulam_spiral/ulam_spiral.html', 'fractal_tree_simulator/fractal_tree_simulator.html',
  'dla_simulator/standalone.html', 'predator_prey_simulator/predator_prey_simulator.html',
  'ant_nitrogen_cycle_simulator/ant_nitrogen_cycle_simulator.html',
  'schelling_segregation_simulator/schelling_segregation_simulator.html',
  'vicsek_boids_simulator/vicsek_boids_simulator.html'
];

test('catalog counts agree with all 31 unique cards and retain the season 2 feature', () => {
  assert.equal(cards.length, 31);
  const titles = cards.map(card => card.match(/<h3>(.*?)<\/h3>/)[1]);
  assert.equal(new Set(titles).size, cards.length);
  assert.match(home, /<title>WebSim · 주말 계획표 시즌2와 31가지 생활·과학 실험<\/title>/);
  assert.match(home, /생활·사회·물리 등 31개 WebSim 도구/);
  assert.match(home, />31개 도구 둘러보기 /);
  assert.match(home, />전체 31개 도구<\/p>/);
  assert.match(home, /data-category="all"[^>]*>전체 <span>31<\/span>/);
  assert.match(home, /class="hero-link" href="weekend_season2\/index.html"/);
  assert.match(home, /class="featured-link" href="weekend_season2\/index.html"/);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /시뮬레이터와 도구 31개/);
});

test('new card exposes the requested category, exact description, tags, and every search keyword', () => {
  assert.ok(saturday);
  assert.match(saturday, /data-category="생활·도구"/);
  assert.ok(saturday.includes('시간이 남아도는데 할 수 있는 일은 줄어든 토요일. 다섯 번의 선택으로 나만의 하루를 만들어보세요.'));
  for (const tag of ['선택형 이야기', '일상의 발견']) assert.ok(saturday.includes(`<span>${tag}</span>`));
  const keywords = saturday.match(/data-keywords="([^"]+)"/)[1];
  for (const keyword of ['주말', '토요일', '선택', '이야기', '무료함', '몰입', '접근성', '이동 제약', '경험', 'saturday', 'interactive story']) {
    assert.ok(keywords.includes(keyword), `Missing keyword: ${keyword}`);
  }
  assert.match(saturday, /class="try-link" href="stopped_saturday\/stopped_saturday.html"/);
  assert.match(saturday, /href="stopped_saturday\/stopped_saturday_doc.html"/);
});

test('all 30 previous launches remain registered and every catalog local page still exists', () => {
  const launches = cards.map(card => card.match(/class="try-link" href="([^"]+)"/)[1]);
  assert.deepEqual(launches.filter(href => !href.startsWith('stopped_saturday/')), legacyLaunches);
  const links = cards.flatMap(card => [...card.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]));
  const localLinks = links.filter(href => !/^(?:https?:|#)/.test(href));
  assert.equal(localLinks.length, 62);
  for (const href of localLinks) assert.ok(fs.existsSync(path.join(root, href.split(/[?#]/)[0])), `Missing catalog destination: ${href}`);
});

test('guide uses the shared documentation shell and preserves local navigation', () => {
  const guidePath = path.join(root, 'stopped_saturday/stopped_saturday_doc.html');
  const guide = fs.readFileSync(guidePath, 'utf8');
  assert.match(guide, /href="\.\.\/assets\/docs.css"/);
  assert.match(guide, /src="\.\.\/assets\/docs.js"/);
  for (const href of ['../index.html', '../index.html#catalog', 'stopped_saturday.html']) {
    assert.ok(guide.includes(`href="${href}"`));
    assert.ok(fs.existsSync(path.resolve(path.dirname(guidePath), href.split('#')[0])));
  }
  for (const name of ['시간 도둑을 만난 토요일', '누군가에게 닿은 토요일', '300미터의 대모험', '제대로 멈춘 토요일', '창가의 탐험가', '아직 끝나지 않은 토요일']) {
    assert.ok(guide.includes(name));
  }
  assert.ok(guide.includes('의료적 판단이나 조언을 제공하지 않습니다.'));
  assert.ok(guide.includes('개인정보나 플레이 결과를 서버에 전송하지 않으며'));
});
