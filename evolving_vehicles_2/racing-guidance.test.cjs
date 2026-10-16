'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Guidance = require('./racing-guidance.js');
const Race = require('./race-engine.js');
const circuits = require('./circuits.js');
const Pose = require('./driving-pose.js');
const Renderer = require('./circuit-renderer.js');
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const wrap = (x, n) => ((x % n) + n) % n;
const at = (race, car, s) => Pose.sampleCar ? Pose.sampleCar(race, car, s) : Pose.sample(race, s);

// A single smooth bend with analytically bounded speed, braking, and traction.
// The centre can cross the timing seam without changing the physical problem.
function fixture(center = 600, grade = 0) {
  const length = 1200, count = 300, spacing = length / count;
  const points = Array.from({length:count}, (_, i) => {
    const offset = wrap(i * spacing - center + length / 2, length) - length / 2;
    return {x:i * spacing,y:0,z:0,s:i * spacing,grade,curvature:.025 * Math.exp(-((offset / 65) ** 2))};
  });
  const car = {massKg:1500,powerPs:500,torqueNm:1000,driveReduction:10,efficiency:.9,dragArea:.7,rollingCoefficient:.015,
    spec:{factoryDrive:'rwd',frontTireRadiusMm:335,rearTireRadiusMm:335},speed:0,distance:0,
    speedProfile:points.map(p => Math.min(45, Math.sqrt(8 / Math.max(p.curvature, 1e-8))))};
  for (let pass = 0; pass < 2; pass++) for (let i = count - 1; i >= 0; i--) {
    car.speedProfile[i] = Math.min(car.speedProfile[i], Math.sqrt(car.speedProfile[(i + 1) % count] ** 2 + 16 * spacing));
  }
  const race = {track:{length,spacing,width:12},pathPoints:points,cars:[car],surface:'dry',
    _tractionAcceleration:() => 4,_brakingCapacity:() => 8,_lateralCapacity:() => 8};
  return {race,car};
}

test('a physically limited bend gets advance warning, strong braking, release to apex, and full exit acceleration', () => {
  const {race,car} = fixture(), profile = Guidance.profile(race,car), p = profile.samples;
  assert.equal(profile.apexCount,1);
  const red = p.filter(s => s.brake > .95), coast = p.filter(s => s.coast && s.throttle < .08 && s.brake < .08);
  assert.ok(red.length > 3, 'full-brake zone before entry');
  assert.ok(coast.length > 5, 'physical zero-drive coast to apex');
  assert.ok(Math.max(...red.map(s => s.s)) < Math.min(...coast.map(s => s.s)), 'braking precedes throttle release');
  assert.ok(coast.some(s => Math.abs(s.s - 600) < 9), 'release reaches the apex');
  assert.ok(p.some(s => s.s > 630 && s.s < 850 && s.throttle > .99 && s.anticipation === 0), 'full acceleration on exit');
  assert.ok(p.some(s => s.anticipation > .9 && s.nextBrakeM > 100 && s.brake === 0), 'yellow warning more than 100 metres before red');
  const warningStart = p.find(s => s.anticipation > 0);
  assert.ok(warningStart.nextBrakeM <= warningStart.lookaheadM && warningStart.lookaheadM >= 100 && warningStart.lookaheadM <= 250);
  const redCore = red.find(s => s.color[0] > 235 && s.color[1] < 90);
  const greenCore = p.find(s => s.color[0] < 40 && s.color[1] > 190);
  const yellowCore = coast.find(s => s.color[0] > 240 && s.color[1] > 195);
  assert.ok(redCore && greenCore && yellowCore, 'all three requested control colors have interior plateaus');
});

test('grade distinguishes wheel braking from natural speed loss, and changes the modeled release plan', () => {
  const flat = fixture(), uphill = fixture(600,.12), downhill = fixture(600,-.12);
  const a = Guidance.profile(flat.race,flat.car), b = Guidance.profile(uphill.race,uphill.car), c = Guidance.profile(downhill.race,downhill.car);
  const climbCoast = b.samples.filter(s => s.coast && s.acceleration < -.5 && s.brake < .01);
  const descendCoast = c.samples.filter(s => s.coast && s.acceleration > .3 && s.throttle < .01);
  assert.ok(climbCoast.length > 5, 'uphill natural deceleration is release, not red braking');
  assert.ok(descendCoast.length > 5, 'gravity-assisted acceleration does not become full throttle');
  assert.notDeepEqual(a.samples.map(s => s.targetSpeed), b.samples.map(s => s.targetSpeed));
  assert.notDeepEqual(a.samples.map(s => s.targetSpeed), c.samples.map(s => s.targetSpeed));
});

test('colors interpolate continuously at every knot and across the closed-lap seam', () => {
  const {race,car} = fixture(12), data = Guidance.profile(race,car);
  for (let i = 0; i < data.samples.length; i++) {
    const s = i * data.spacing, a = Guidance.sample(race,car,s-1e-5), b = Guidance.sample(race,car,s+1e-5);
    for (let c = 0; c < 3; c++) close(a.color[c],b.color[c],.00001);
    assert.equal(a.alpha,.52); assert.equal(b.alpha,.52);
  }
  assert.deepEqual(Guidance.sample(race,car,0),Guidance.sample(race,car,data.length * 3));
  const before = Guidance.sample(race,car,-30), after = Guidance.sample(race,car,data.length-30);
  assert.deepEqual(before,after);
  assert.ok(data.samples.slice(-60).some(p => p.anticipation > .9), 'brake warnings wrap around the timing line');
});

test('selected vehicle, wet tyres and power limits change advice without mutating race state', () => {
  const circuit = circuits.find(c => c.id === 'spa');
  const dry = new Race({circuit,vehicleIds:['supra','ray'],racingLine:true,surface:'dry'});
  const wet = new Race({circuit,vehicleIds:['supra'],racingLine:true,surface:'wet'});
  const before = JSON.stringify(dry.cars.map(car => ({speed:car.speed,distance:car.distance,speedProfile:car.speedProfile,pathPoints:car.pathPoints})));
  const fast = Guidance.profile(dry,dry.cars[0]), slow = Guidance.profile(dry,dry.cars[1]), slippery = Guidance.profile(wet,wet.cars[0]);
  assert.equal(Guidance.profile(dry,dry.cars[0]),fast, 'cached per watched car');
  assert.ok(Math.max(...fast.samples.map(p=>p.targetSpeed)) > Math.max(...slow.samples.map(p=>p.targetSpeed)) + 5);
  const mean = profile => profile.samples.reduce((sum,p)=>sum+p.targetSpeed,0)/profile.samples.length;
  assert.ok(mean(slippery) < mean(fast) * .94, 'wet tyre limits reduce planned pace');
  assert.notDeepEqual(fast.samples.map(p=>p.color),slow.samples.map(p=>p.color));
  assert.notDeepEqual(fast.samples.map(p=>p.color),slippery.samples.map(p=>p.color));
  for (const profile of [fast,slow,slippery]) for (const p of profile.samples) {
    assert.ok(Number.isFinite(p.targetSpeed) && p.targetSpeed <= p.sourceTargetSpeed + 1e-8);
    assert.ok(p.lookaheadM >= 100 && p.lookaheadM <= 250);
    for (const key of ['throttle','brake','coast','anticipation']) assert.ok(p[key] >= 0 && p[key] <= 1);
  }
  assert.equal(JSON.stringify(dry.cars.map(car => ({speed:car.speed,distance:car.distance,speedProfile:car.speedProfile,pathPoints:car.pathPoints}))),before);
});

test('guidance uses a watched-car path and lap length independently of the shared fallback path', () => {
  const {race,car} = fixture();
  const base = Guidance.profile(race,car);
  car.pathPoints = race.pathPoints.map(p=>({...p,grade:.12}));
  car.trackLength = race.track.length * 1.025;
  car.pathSpacing = car.trackLength / car.pathPoints.length;
  const owned = Guidance.profile(race,car);
  assert.notEqual(owned,base); close(owned.length,car.trackLength); close(owned.spacing,car.pathSpacing);
  assert.ok(owned.samples.every(p=>p.grade === .12));
  assert.deepEqual(Guidance.sample(race,car,0),Guidance.sample(race,car,car.trackLength));
});

test('world triangles follow the exact watched trajectory and 3D elevation, including later laps', () => {
  const race = new Race({circuit:circuits.find(c=>c.id==='spa'),vehicleIds:['supra'],racingLine:true});
  const car = race.cars[0], renderer = Object.assign(Object.create(Renderer.prototype),{race});
  const length = car.trackLength || race.track.length;
  for (const distance of [-8,0,950,1050,length-2,length+1050]) {
    const triangle = renderer._racingGuidanceTriangle(car,distance), tip = at(race,car,distance+2.6), rear = at(race,car,distance-2);
    close(triangle[0].x,tip.x); close(triangle[0].y,tip.y);
    close(triangle[0].z,renderer._displayHeight(tip.elevation??tip.z)+.11);
    close((triangle[1].x+triangle[2].x)/2,rear.x); close((triangle[1].y+triangle[2].y)/2,rear.y);
    close(triangle[1].z,renderer._displayHeight(rear.elevation??rear.z)+.11);
    assert.ok(Math.hypot(triangle[1].x-triangle[2].x,triangle[1].y-triangle[2].y) <= 1.441);
    assert.ok((triangle[0].x-rear.x)*Math.cos(rear.angle)+(triangle[0].y-rear.y)*Math.sin(rear.angle)>4, 'triangle points forward along the actual path');
  }
  close(renderer._racingGuidanceTriangle(car,1050)[0].z,renderer._racingGuidanceTriangle(car,length+1050)[0].z);
});

test('overview closes with uniform arrow spacing and close views only queue the nearby section', () => {
  const race = new Race({circuit:circuits.find(c=>c.id==='spa'),vehicleIds:['supra'],racingLine:true}),car = race.cars[0];
  const renderer = Object.assign(Object.create(Renderer.prototype),{race,mode:'top',_queue:(face,camera,queue)=>queue.push(face)});
  const whole=[];renderer._queueRacingGuidance(car,{},whole);
  assert.equal(whole.length,Math.ceil((car.trackLength||race.track.length)/7.5));
  assert.ok(whole.every(face=>face.vertices.length===3 && face.fill.endsWith(',0.52)')));
  const length=car.trackLength||race.track.length;car.distance=length*1.2;
  const flying=[];renderer._queueRacingGuidance(car,{},flying);
  assert.equal(flying.length,whole.length);
  const tip=Pose.sampleCar(race,car,length+2.6);
  close(flying[0].vertices[0].x,tip.x);close(flying[0].vertices[0].y,tip.y);
  assert.notDeepEqual(flying[0].vertices,whole[0].vertices,'later laps do not redraw the standing-start transition');
  renderer.mode='follow';car.distance=(car.trackLength||race.track.length)+1000;
  const nearby=[];renderer._queueRacingGuidance(car,{},nearby);
  assert.ok(nearby.length>=38&&nearby.length<=43);
});

test('near-plane clipping keeps a partially visible guidance arrow and finite projected points', () => {
  const renderer = Object.assign(Object.create(Renderer.prototype),{width:800,height:600});
  const camera = renderer._createCamera({x:0,y:0,z:0},10,0,.24,400,400,300);
  const vertex = (right,vertical,depth) => {
    const along=camera.distance-depth,h=vertical*camera.sinPitch+along*camera.cosPitch;
    return {x:right,y:h,z:-vertical*camera.cosPitch+along*camera.sinPitch};
  };
  const queue=[];
  renderer._queue({vertices:[vertex(0,0,.1),vertex(-.6,0,5),vertex(.6,1,5)],fill:'rgba(239,68,68,0.52)'},camera,queue);
  assert.equal(queue.length,1);assert.equal(queue[0].points.length,4);
  for (const p of queue[0].points) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.depth>=.3009);
});
