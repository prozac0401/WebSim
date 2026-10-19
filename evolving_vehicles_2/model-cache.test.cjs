'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const encode = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
const spec = { lengthMm: 4500, widthMm: 1850, heightMm: 1450, wheelbaseMm: 2700 };
function source(id, marker = 'ready') {
  const primitive = {
    vertices: encode(new Float32Array([0,0,0, 0,0,1, 0,0, 4,0,0, 0,0,1, 1,0, 0,0,1, 0,0,1, 0,1])),
    indices: encode(new Uint16Array([0,1,2])), indexType: 2, color: [.2,.4,.6]
  };
  return { id, marker, bounds: { min: [0,0,0], max: [4,2,1] }, source: { kind: 'community-mesh' },
    primitives: [{ ...primitive }], fallbackPrimitives: [{ ...primitive }], triangles: 1 };
}
function fixture(id) {
  const context = vm.createContext({ atob, Uint8Array, Uint16Array, Uint32Array, Float32Array,
    VehicleMeshes: { create: () => ({ faces: [], procedural: true }) } });
  for (const file of ['vehicle-paints.js', 'manufacturer-models.js', 'circuit-renderer.js'])
    vm.runInContext(fs.readFileSync(require.resolve('./' + file), 'utf8'), context);
  const renderer = Object.assign(Object.create(context.CircuitRenderer.prototype), {
    meshCache: new Map(), options:{}, _makeRoad() {}, _makeContextGround() {}
  });
  const race = () => ({ circuit: {}, track: { points: [] }, cars: [{ id: 0, index: 0, vehicleId: id, spec }] });
  renderer.setRace(race());
  return { renderer, api: context.ManufacturerModels, race };
}

test('a required model arriving after a same-vehicle race reset replaces the empty cached body', () => {
  const { renderer, api, race } = fixture('bmw_m2');
  const empty = renderer._mesh(renderer.race.cars[0]);
  assert.equal(empty.faces.length, 0);
  renderer.setRace(race());
  assert.equal(renderer._mesh(renderer.race.cars[0]), empty, 'reset keeps the same loading cache');
  api.register(source('bmw_m2'));
  const body = renderer._mesh(renderer.race.cars[0]);
  assert.notEqual(body, empty);
  assert.equal(body.manufacturer, api.get('bmw_m2'));
  assert.equal(body.faces.length, 1, 'the loaded source also supplies the software body');
  assert.equal(renderer._mesh(renderer.race.cars[0]), body, 'a ready body is reused across frames');
  assert.equal(renderer.meshCache.size, 1);
});

test('a late ordinary-car asset replaces its temporary procedural appearance', () => {
  const { renderer, api } = fixture('ray'), car = renderer.race.cars[0];
  const temporary = renderer._mesh(car);
  assert.equal(temporary.procedural, true);
  api.register(source('ray'));
  const body = renderer._mesh(car);
  assert.notEqual(body, temporary);
  assert.equal(body.manufacturer, api.get('ray'));
  assert.equal(body.faces.length, 1);
});

test('registering a new source for the same identity replaces the body without accumulating cache entries', () => {
  const { renderer, api } = fixture('supra'), car = renderer.race.cars[0];
  api.register(source('supra', 'first'));
  const first = renderer._mesh(car);
  api.register(source('supra', 'replacement'));
  const replacement = renderer._mesh(car);
  assert.notEqual(replacement, first);
  assert.equal(replacement.manufacturer.marker, 'replacement');
  assert.equal(renderer._mesh(car), replacement);
  assert.equal(renderer.meshCache.size, 1);
});

test('factory paint choices stay per observed car and never change race or shared asset state', () => {
  const {renderer,api}=fixture('gr86'),car=renderer.race.cars[0];api.register(source('gr86'));
  const saved=JSON.stringify(car),asset=api.get('gr86'),original=renderer._mesh(car);
  assert.equal(renderer.getPaintInfo(car).code,'DCK');assert.equal(original.paint,'#ce171f');
  assert.equal(renderer.setPaint(car,'crystal-white-pearl'),true);
  const pearl=renderer._mesh(car);assert.notEqual(pearl,original);assert.equal(pearl.paintFinish.finish,'pearl');
  assert.equal(pearl.paintFinish.code,'K1X');assert.equal(pearl.manufacturer,asset);
  assert.equal(renderer._mesh(car),pearl);assert.equal(JSON.stringify(car),saved);
  assert.equal(renderer.setPaint(car,'not-a-factory-color'),false);assert.equal(renderer._mesh(car),pearl);
  const other={...car,id:2,index:2};assert.equal(renderer.getPaintInfo(other).code,'D4S');
  assert.equal(renderer.getPaintInfo(car).code,'K1X');
});

test('a sourced default paint retains its surface finish without inventing selectable colors', () => {
  const {renderer,api}=fixture('k5'),car=renderer.race.cars[0],asset=source('k5');
  asset.paintReference={name:'스노우 화이트 펄',code:'SWP',hex:'#e7e9e5',finish:'pearl',roughness:.22,clearcoat:.92};
  api.register(asset);
  const mesh=renderer._mesh(car);
  assert.equal(mesh.paint,'#e7e9e5');assert.equal(mesh.paintFinish.finish,'pearl');
  assert.equal(mesh.paintFinish.code,'SWP');assert.equal(renderer.getPaintInfo(car),null);
  assert.equal(renderer.setPaint(car,'invented-color'),false);
});
