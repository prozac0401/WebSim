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
  assert.ok(p.some(s => s.anticipationDemand > .9 && s.nextBrakeM > 40 && s.nextBrakeM < 100 && s.brake === 0), 'compact preparation demand before red');
  assert.ok(p.every(s => s.nextBrakeM === null || s.nextBrakeM <= 100 || s.anticipation === 0), 'no warning beyond 100 metres');
  const warningStart = p.find(s => s.anticipationDemand > 0);
  assert.ok(warningStart.nextBrakeM <= warningStart.lookaheadM && warningStart.lookaheadM >= 40 && warningStart.lookaheadM <= 100);
  const redCore = red.find(s => s.color[0] > 235 && s.color[1] < 90);
  const greenCore = p.find(s => s.color[0] < 40 && s.color[1] > 190);
  const yellowCore = coast.find(s => s.color[0] > 200 && s.color[1] > 195 && s.acceleration < 0);
  assert.ok(redCore && greenCore && yellowCore, 'all three requested control colors appear where acceleration permits');
});

test('grade distinguishes wheel braking from natural speed loss, and changes the modeled release plan', () => {
  const flat = fixture(), uphill = fixture(600,.12), downhill = fixture(600,-.12);
  const a = Guidance.profile(flat.race,flat.car), b = Guidance.profile(uphill.race,uphill.car), c = Guidance.profile(downhill.race,downhill.car);
  const climbCoast = b.samples.filter(s => s.coast && s.acceleration < -.5 && s.brake < .01);
  const descendCoast = c.samples.filter(s => s.coastDemand && s.acceleration > .3 && s.throttle < .01);
  assert.ok(climbCoast.length > 5, 'uphill natural deceleration is release, not red braking');
  assert.ok(descendCoast.length > 5, 'gravity-assisted acceleration does not become full throttle');
  for(const p of descendCoast) {
    assert.equal(p.coast,0,'accelerating release is not shown as yellow coast');
    assert.equal(p.anticipation,0,'accelerating release is not shown as yellow preparation');
    noYellowWhileAccelerating(p);
  }
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
  assert.ok(data.samples.slice(-60).some(p => p.anticipationDemand > .9), 'preparation distance wraps around the timing line');
});

function noYellowWhileAccelerating(p) {
  if(p.acceleration<0)return;
  assert.equal(p.yellowWeight,0);
  assert.equal(p.coast,0);assert.equal(p.anticipation,0);
  // Check the actual final RGB, not only an eligibility metadata flag. With
  // yellow absent, the color must lie on the green/red segment of the palette.
  const red=Guidance.COLORS.brake,green=Guidance.COLORS.accelerate,t=(p.color[0]-green[0])/(red[0]-green[0]);
  for(let c=1;c<3;c++)close(p.color[c],green[c]+(red[c]-green[c])*t,1e-7);
}

test('color interpolation never leaks yellow into positive planned acceleration',()=>{
  for(const grade of [0,.12,-.12]) {
    const {race,car}=fixture(12,grade),data=Guidance.profile(race,car);
    for(let s=-10;s<data.length+10;s+=data.spacing/9) noYellowWhileAccelerating(Guidance.sampleProfile(data,s));
  }
});

test('live preview starts from actual launch and rolling speed, overriding a conflicting advisory coast',()=>{
  const {race,car}=fixture();
  car.acceleration=0;
  const launch=Guidance.preview(race,car,[0,15,30,60,120]);
  assert.equal(launch[0].forecastSpeed,0);assert.equal(launch[0].forecastAcceleration,0);
  assert.ok(launch.slice(1).every(p=>p.forecastSpeed>0&&p.forecastAcceleration>0));
  launch.forEach(noYellowWhileAccelerating);
  car.distance=550;car.speed=10;car.acceleration=3;
  assert.ok(Guidance.sample(race,car,550).acceleration<0,'static coast model conflicts with slow actual car');
  const before=JSON.stringify(car),rolling=Guidance.preview(race,car,[580,550,557.5,565,580]);
  assert.equal(JSON.stringify(car),before,'preview leaves all car state unchanged');
  assert.equal(rolling[1].forecastAcceleration,car.acceleration);
  assert.equal(rolling[1].forecastSpeed,car.speed);
  assert.deepEqual(rolling[0],rolling[4],'unsorted and duplicate requests retain their order');
  for(const p of rolling) {
    assert.equal(p.basis,'actual-speed-force-preview');
    assert.ok(p.forecastAcceleration>0);noYellowWhileAccelerating(p);
  }
});

test('live preview preserves downhill braking even when net speed still increases',()=>{
  const {race,car}=fixture(600,-.9);race._brakingCapacity=()=>1;
  car.speed=60;car.acceleration=3;
  const future=Guidance.preview(race,car,[5,15,40]);
  for(const p of future) {
    assert.ok(p.forecastAcceleration>0);assert.ok(p.brake>.99);assert.equal(p.phase,'brake');
    noYellowWhileAccelerating(p);assert.deepEqual(p.color,Guidance.COLORS.brake);
  }
});

test('live preview reports instantaneous exit acceleration rather than the last braking metre average',()=>{
  const {race,car}=fixture();
  race._target=(_car,s)=>Math.sqrt(400+8*Math.abs(s-600));
  car.distance=590.7;car.speed=race._target(car,car.distance);car.acceleration=-4;
  // The final half-metre crosses the apex at 600: its speed-squared still
  // decreases overall, but the endpoint 600.2 is already a full-power exit.
  const p=Guidance.preview(race,car,[600.2])[0];
  assert.ok(p.forecastAcceleration>3);assert.ok(p.throttle>.99);assert.equal(p.brake,0);
  assert.equal(p.phase,'accelerate');noYellowWhileAccelerating(p);
});

test('live preview rejects nonfinite and excessive ranges and stays finite across a lap boundary',()=>{
  const {race,car}=fixture();car.distance=1195;car.speed=24;car.acceleration=2;
  for(const distances of [[NaN],[Infinity],[1194],[1696],new Array(257).fill(1195)]) assert.throws(()=>Guidance.preview(race,car,distances),RangeError);
  assert.deepEqual(Guidance.preview(race,car,[]),[]);
  for(const p of Guidance.preview(race,car,[1195,1200,1210,1310,1695])) {
    for(const key of ['forecastSpeed','forecastAcceleration','yellowWeight','throttle','brake'])assert.ok(Number.isFinite(p[key]),key);
    assert.ok(p.forecastSpeed>=0);noYellowWhileAccelerating(p);
  }
});

test('live preview current color follows actual tuned Supra acceleration through launch and the first corners',()=>{
  const T=require('./tuning-evolution.js'),entrant=T.createPopulation({vehicleId:'supra',count:8,budget:30,seed:31415})[0];
  const race=new Race({circuit:circuits.find(c=>c.id==='inje'),entrants:[entrant],laps:1,surface:'dry'}),car=race.cars[0];
  let accelerating=0,braking=0;
  for(let i=0;i<2000&&car.distance<900;i++) {
    race.step(.08);
    const current=Guidance.preview(race,car,[car.distance,car.distance+30,car.distance+80,car.distance+115]);
    close(current[0].forecastAcceleration,car.acceleration);
    if(car.acceleration>0)accelerating++;
    if(current[0].brake>.8)braking++;
    current.forEach(noYellowWhileAccelerating);
  }
  assert.ok(car.distance>=900);assert.ok(accelerating>100);assert.ok(braking>10);
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
    assert.ok(p.lookaheadM >= 40 && p.lookaheadM <= 100);
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

function displayFixture(target, distance = 0, speed = 34.6) {
  const {race,car} = fixture();
  race.pathPoints = race.pathPoints.map(p=>({...p,curvature:0}));
  car.speedProfile = car.speedProfile.map(()=>60);
  race._target = (_car,s)=>target(s);
  car.distance = distance; car.speed = speed; car.acceleration = 0;
  const first = Math.ceil((distance+5)/7.5)*7.5;
  return {race,car,distances:Array.from({length:15},(_,i)=>first+i*7.5)};
}

function assertSixYellow(result) {
  const bands = result[0].displayTransitionBands;
  assert.ok(bands.length>0,'a visible strong-phase transition was detected');
  for(const band of bands) {
    assert.equal(band.lastIndex-band.firstIndex+1,6);
    assert.ok(band.firstIndex>=0&&band.lastIndex<15,'all six stay in the visible window');
    for(const p of result.slice(band.firstIndex,band.lastIndex+1)) {
      assert.equal(p.displayTransitionWeight,1);
      assert.equal(p.displayYellowWeight,1);
      assert.deepEqual(p.color,Guidance.COLORS.coast,'all six have the actual yellow RGB');
    }
  }
}

test('display transitions keep six yellow arrows at either window edge in both directions',()=>{
  for(const boundary of [10,55,110]) {
    const {race,car,distances}=displayFixture(s=>Math.sqrt(Math.max(100,1200-14*Math.max(0,s-boundary))));
    const p=Guidance.displayPreview(race,car,distances);
    assertSixYellow(p);
    assert.ok(p[0].displayTransitionBands.some(b=>b.direction==='accelerate-to-brake'));
  }
  for(const distance of [500,550,585]) {
    const {race,car,distances}=displayFixture(s=>Math.sqrt(400+14*Math.abs(s-600)),distance,Math.sqrt(400+14*(600-distance)));
    const p=Guidance.displayPreview(race,car,distances);
    assertSixYellow(p);
    assert.ok(p[0].displayTransitionBands.some(b=>b.direction==='brake-to-accelerate'));
    assert.ok(p.some(q=>q.brake>=.85&&q.displayTransitionWeight===0)||!p.some(q=>q.brake>=.85), 'strong braking retains a visible red core');
  }
});

test('a single moderate-braking arrow still gets six yellow arrows on both sides of its transition',()=>{
  const target=s=>Math.sqrt(1200-12*Math.max(0,Math.min(7.5,s-60))+8*Math.max(0,s-67.5));
  const {race,car,distances}=displayFixture(target),raw=Guidance.preview(race,car,distances);
  const red=raw.filter(p=>p.brake>=.55);
  assert.equal(red.length,1);assert.ok(red[0].brake<.85,'the short red run is not a full-brake exception');
  const display=Guidance.displayPreview(race,car,distances);
  assertSixYellow(display);
  assert.deepEqual(display[0].displayTransitionBands.map(b=>b.direction),['accelerate-to-brake','brake-to-accelerate']);
  const briefExit=s=>Math.sqrt(Math.max(100,1500-12*Math.min(s,42)+8*Math.max(0,Math.min(7,s-42))-12*Math.max(0,s-49)));
  const reverse=displayFixture(briefExit,0,Math.sqrt(1500)),reverseRaw=Guidance.preview(reverse.race,reverse.car,reverse.distances);
  assert.equal(reverseRaw.filter(p=>p.forecastAcceleration>0).length,1,'also exercise a single green arrow between red runs');
  const reverseDisplay=Guidance.displayPreview(reverse.race,reverse.car,reverse.distances);
  assertSixYellow(reverseDisplay);
  assert.deepEqual(reverseDisplay[0].displayTransitionBands.map(b=>b.direction),['brake-to-accelerate','accelerate-to-brake']);
});

test('display bands preserve force forecasts and do not invent transitions on a pure straight or braking zone',()=>{
  for(const [target,speed] of [[()=>70,20],[()=>5,45]]) {
    const {race,car,distances}=displayFixture(target,0,speed),raw=Guidance.preview(race,car,distances),before=JSON.stringify(car);
    const display=Guidance.displayPreview(race,car,distances);
    assert.equal(JSON.stringify(car),before,'display policy leaves the real vehicle unchanged');
    assert.equal(display[0].displayTransitionBands.length,0);
    for(let i=0;i<raw.length;i++) {
      assert.deepEqual(display[i].color,raw[i].color);
      assert.equal(display[i].fill,raw[i].fill);
      assert.equal(display[i].displayTransitionWeight,0);
    }
  }
  const {race,car,distances}=displayFixture(s=>Math.sqrt(Math.max(100,1200-14*Math.max(0,s-55))));
  const raw=Guidance.preview(race,car,distances),display=Guidance.displayPreview(race,car,distances);
  assertSixYellow(display);
  for(let i=0;i<raw.length;i++)for(const key of Object.keys(raw[i]))if(key!=='color'&&key!=='fill')
    assert.deepEqual(display[i][key],raw[i][key],key+' remains a physical forecast');
  assert.ok(display.some(p=>p.forecastAcceleration>=0&&p.displayTransitionWeight===1),'explicit display priority can show yellow before speed loss');
});

test('paused, restarted and later-lap displays are deterministic without hidden temporal state',()=>{
  const target=s=>Math.sqrt(Math.max(100,1200-14*Math.max(0,wrap(s,1200)-55)));
  const {race,car,distances}=displayFixture(target),initial=Guidance.displayPreview(race,car,distances);
  assertSixYellow(initial);
  assert.deepEqual(Guidance.displayPreview(race,car,distances),initial,'a paused render cannot flicker');
  car.speed=2;
  const slow=Guidance.displayPreview(race,car,distances);
  assert.notDeepEqual(slow[0].displayTransitionBands,initial[0].displayTransitionBands,'a changed physical state is reflected immediately');
  assert.ok(slow[0].forecastSpeed<initial[0].forecastSpeed);
  car.speed=34.6;
  assert.deepEqual(Guidance.displayPreview(race,car,distances),initial,'returning to the original state is exact');
  car.distance=1200;
  const later=Guidance.displayPreview(race,car,distances.map(s=>s+1200));
  assertSixYellow(later);
  for(let i=0;i<15;i++) {
    close(later[i].forecastSpeed,initial[i].forecastSpeed);
    assert.deepEqual(later[i].color,initial[i].color,'absolute arrow order is retained across a lap seam');
  }
  assert.deepEqual(Guidance.displayPreview(race,car,[]),[]);
  assert.throws(()=>Guidance.displayPreview(race,car,[1207.5,1207.5]),RangeError);
});

test('real Inje transition bands keep all six yellow arrows through overlaps and reserve strong-brake red',()=>{
  const T=require('./tuning-evolution.js'),entrant=T.createPopulation({vehicleId:'supra',count:8,budget:30,seed:31415})[0];
  const race=new Race({circuit:circuits.find(c=>c.id==='inje'),entrants:[entrant],laps:1}),car=race.cars[0];
  const step=car.trackLength/Math.ceil(car.trackLength/7.5);
  let transitions=0,overlaps=0,reversals=0,previous=null,older=null;
  while(car.distance<900) {
    race.step(1/60);
    const first=Math.ceil((car.distance+5)/step),distances=Array.from({length:15},(_,i)=>(first+i)*step);
    const result=Guidance.displayPreview(race,car,distances),bands=result[0].displayTransitionBands;
    if(bands.length) {
      transitions++;assertSixYellow(result);
      if(bands.length>1)overlaps++;
      if(result.some(p=>p.brake>=.85))assert.ok(result.some(p=>p.brake>=.85&&p.displayTransitionWeight===0),'do not hide the entire full-brake zone');
    }
    const signature=result.map(p=>p.displayTransitionWeight).join(',');
    if(previous?.first===first&&older?.first===first&&signature===older.signature&&signature!==previous.signature)reversals++;
    older=previous;previous={first,signature};
  }
  assert.ok(transitions>100&&overlaps>10,'exercise actual entry, exit and overlapping corner windows');
  assert.equal(reversals,0,'the same grid window has no one-frame band flash');
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

test('every view keeps fifteen road-fixed arrows ahead of the watched car across lap boundaries', () => {
  const race = new Race({circuit:circuits.find(c=>c.id==='spa'),vehicleIds:['supra'],racingLine:true}),car = race.cars[0];
  const renderer = Object.assign(Object.create(Renderer.prototype),{race,mode:'top',_queue:(face,camera,queue)=>queue.push(face)});
  const length=car.trackLength||race.track.length,step=length/Math.ceil(length/7.5);
  for(const mode of ['top','overview','follow','eau-rouge'])for(const distance of [0,61.2,length-9,length+1,length*2+1000]){
    renderer.mode=mode;car.distance=distance;
    const arrows=[];renderer._queueRacingGuidance(car,{},arrows);
    assert.equal(arrows.length,15);assert.ok(arrows.every(face=>face.vertices.length===3&&face.fill.endsWith(',0.52)')));
    const first=Math.ceil((distance+5)/step)*step;
    assert.ok(first-2>distance,'entire first arrow is ahead of the car');
    assert.ok(first+14*step+2.6-distance<121,'bounded forward window including grid alignment and triangle tip');
    for(let i=0;i<15;i++){
      const expected=renderer._racingGuidanceTriangle(car,first+i*step);
      for(let v=0;v<3;v++)for(const key of ['x','y','z'])close(arrows[i].vertices[v][key],expected[v][key]);
    }
  }
  car.distance=70;renderer.mode='follow';const before=[];renderer._queueRacingGuidance(car,{},before);
  car.distance+=step;const after=[];renderer._queueRacingGuidance(car,{},after);
  for(let i=0;i<14;i++){
    close(before[i+1].vertices[0].x,after[i].vertices[0].x);
    close(before[i+1].vertices[0].y,after[i].vertices[0].y);
  }
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

test('condition-aware forecasts reflect EV thermal derating and hot brakes without changing any vehicle state',()=>{
  const T=require('./tuning-evolution.js');
  const entrant=T.createEntrant({vehicleId:'ioniq5',variantId:'ioniq5-long-awd',budget:0});
  const race=new Race({circuit:circuits.find(c=>c.id==='monza'),entrants:[entrant],laps:3}),car=race.cars[0];
  car.distance=100;car.speed=20;car.acceleration=0;
  const distances=[100,110,130,160],healthy=Guidance.preview(race,car,distances),healthyProfile=Guidance.profile(race,car);
  const healthyBefore=JSON.stringify(car);
  assert.deepEqual(Guidance.preview(race,car,distances),healthy);
  assert.equal(JSON.stringify(car),healthyBefore,'healthy forecast is observational');
  car.condition.motorTemperatureC=140;car.condition.batteryTemperatureC=58;
  car.condition.brakes.front.temperatureC=900;car.condition.brakes.rear.temperatureC=900;
  const hotBefore=JSON.stringify(car),hot=Guidance.preview(race,car,distances),hotProfile=Guidance.profile(race,car);
  assert.notEqual(hotProfile,healthyProfile,'changed condition limits invalidate advisory cache');
  assert.ok(hot.at(-1).forecastSpeed<healthy.at(-1).forecastSpeed,'high temperature reduces actual available acceleration');
  assert.ok(hotProfile.samples.some((p,i)=>p.targetSpeed<healthyProfile.samples[i].targetSpeed-.1),'reduced brake capacity lowers pre-corner advisory targets');
  assert.equal(JSON.stringify(car),hotBefore,'heat/regen forecast does not cool, charge, wear, shift or move the real vehicle');
  hot.forEach(noYellowWhileAccelerating);
  car.brakeDemand=.73;
  assert.equal(Guidance.preview(race,car,[car.distance])[0].brake,.73,'current-point brake ratio is the solver observation, not a stale healthy estimate');
});
