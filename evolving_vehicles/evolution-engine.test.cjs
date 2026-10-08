const test = require('node:test');
const assert = require('node:assert/strict');
const EvolutionLab = require('./evolution-engine.js');
const Matter = require('./vendor/matter.min.js');

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}
function finish(lab, dt = 1 / 120) {
  while (!lab.complete) lab.step(dt);
  return lab;
}
function world(body, point) {
  return {
    x: body.position.x + point.x * Math.cos(body.angle) - point.y * Math.sin(body.angle),
    y: body.position.y + point.x * Math.sin(body.angle) + point.y * Math.cos(body.angle)
  };
}
function without(genome, gene) {
  const result = { ...genome }; delete result[gene]; return result;
}

test('six silhouettes have matching collision outlines and preserve space above the pickup deck', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat' });
  assert.equal(new Set(lab.vehicles.map(vehicle => vehicle.design.style)).size, 6);
  for (const vehicle of lab.vehicles) {
    const outline = vehicle.design.outline.map(point => world(vehicle.body, point));
    const parts = vehicle.body.parts.slice(1);
    near(parts.reduce((sum, part) => sum + part.area, 0), Matter.Vertices.area(outline));
    for (const point of parts.flatMap(part => part.vertices)) {
      assert.ok(outline.some(vertex => Math.hypot(vertex.x - point.x, vertex.y - point.y) < 1e-8),
        'compound triangles must retain their own positions instead of sharing one centroid');
    }
    near(world(vehicle.body, vehicle.design.frame).x, lab.startX);
    for (const [i, name] of ['rearAxle', 'frontAxle'].entries()) {
      const axle = world(vehicle.body, vehicle.design[name]);
      near(axle.x, vehicle.wheels[i].position.x); near(axle.y, vehicle.wheels[i].position.y);
    }
  }
  const pickup = lab.vehicles.find(vehicle => vehicle.design.style === 'pickup');
  const origin = world(pickup.body, pickup.design.frame), { width, height } = pickup.genome;
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x - width * .3, y: origin.y - height * .6 }).length, 0);
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x + width * .03, y: origin.y - height * .5 }).length, 1);
});

test('output comparison changes only torque and pays for its power with real body mass', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', surface: 'snow', initialExperiment: 'power' });
  const vehicles = lab.vehicles;
  for (const vehicle of vehicles) {
    assert.deepEqual(without(vehicle.genome, 'motorTorque'), without(vehicles[0].genome, 'motorTorque'));
    const design = vehicle.design;
    near(design.totalMass, vehicle.body.mass + vehicle.wheels.reduce((sum, wheel) => sum + wheel.mass, 0));
    near(design.totalMass, design.shellMass + design.powertrainMass + design.wheelMass);
    near(design.peakPower, vehicle.genome.motorTorque * vehicle.genome.motorSpeed / 2);
    near(design.powerToWeight, design.peakPower / design.totalMass);
  }
  for (let i = 1; i < vehicles.length; i++) {
    assert.ok(vehicles[i].design.peakPower > vehicles[i - 1].design.peakPower);
    assert.ok(vehicles[i].body.mass > vehicles[i - 1].body.mass);
  }
  const strongest = vehicles.at(-1), balanced = vehicles[5];
  assert.ok(balanced.design.powerToWeight > strongest.design.powerToWeight);
  finish(lab);
  assert.ok(lab.best.score > 500);
  assert.ok(balanced.finished && strongest.finished);
  assert.ok(balanced.finishTime + .2 < strongest.finishTime, 'the heavier maximum motor must pay a measurable travel-time cost on limited grip');
});

test('higher free speed also adds real powertrain mass', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat', population: 2, initialExperiment: 'balance' });
  lab.genomes = [
    { ...lab.genomes[0], powertrainPosition: 0, motorSpeed: .22 },
    { ...lab.genomes[0], powertrainPosition: 0, motorSpeed: .38 }
  ];
  lab.restartTrial();
  const [slow, fast] = lab.vehicles;
  assert.ok(fast.design.powertrainMass > slow.design.powertrainMass + 5);
  assert.ok(fast.body.mass > slow.body.mass + 5);
  assert.ok(fast.design.peakPower > slow.design.peakPower);
});

test('moving the same powertrain shifts real COM, axle loads and inertia without changing the start', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', initialExperiment: 'balance' });
  const first = lab.vehicles[0], last = lab.vehicles.at(-1);
  for (const vehicle of lab.vehicles) {
    assert.deepEqual(without(vehicle.genome, 'powertrainPosition'), without(first.genome, 'powertrainPosition'));
    near(vehicle.body.mass, first.body.mass);
    near(vehicle.design.totalMass, first.design.totalMass);
    near(vehicle.design.peakPower, first.design.peakPower);
    near(world(vehicle.body, vehicle.design.frame).x, lab.startX);
    near(vehicle.wheels[0].position.x, first.wheels[0].position.x);
    near(vehicle.wheels[1].position.x, first.wheels[1].position.x);
    const total = vehicle.design.totalMass;
    const com = world(vehicle.body, vehicle.design.centerOfMass);
    near(com.x, (vehicle.body.mass * vehicle.body.position.x + vehicle.wheels.reduce((sum, wheel) => sum + wheel.mass * wheel.position.x, 0)) / total);
    near(vehicle.design.frontLoad + vehicle.design.rearLoad, 1);
    near(vehicle.design.frontLoad, (com.x - vehicle.wheels[0].position.x) / (vehicle.wheels[1].position.x - vehicle.wheels[0].position.x));
  }
  assert.ok(last.body.position.x > first.body.position.x + 40);
  assert.ok(last.design.frontLoad > first.design.frontLoad + .6);
  const reference = lab.vehicles[3];
  const reducedMass = first.design.shellMass * first.design.powertrainMass / first.body.mass;
  const separationSquared = vehicle => {
    const shellCenter = Matter.Vertices.centre(vehicle.design.outline), unit = vehicle.design.powerUnit;
    return (unit.x - shellCenter.x) ** 2 + (unit.y - shellCenter.y) ** 2;
  };
  // Moving two unchanged mass distributions changes only their parallel-axis
  // term. Matter scales polygon inertia by 4; the silhouette need not have a
  // particular ratio of shell inertia to the localized powertrain inertia.
  for (const vehicle of lab.vehicles) {
    near(vehicle.body.inertia - reference.body.inertia,
      4 * reducedMass * (separationSquared(vehicle) - separationSquared(reference)));
  }
  for (let i = 0; i < 360; i++) lab.step();
  const pitches = lab.vehicles.map(vehicle => vehicle.body.angle);
  assert.ok(Math.max(...pitches) - Math.min(...pitches) > .04, 'load position must change physical pitch on the slope');
  finish(lab);
  assert.ok(lab.vehicles.every(vehicle => vehicle.finished));
  assert.ok(Math.max(...lab.vehicles.map(v => v.finishTime)) - Math.min(...lab.vehicles.map(v => v.finishTime)) > 5);
});

test('comparison trials replay deterministically and preserve every elite gene through evolution', () => {
  for (const initialExperiment of ['power', 'balance', 'drive']) {
    const lab = finish(new EvolutionLab({ seed: 42, terrain: 'rolling', initialExperiment }), 1 / 60);
    const scores = lab.vehicles.map(vehicle => [vehicle.score, vehicle.finishTime, vehicle.stopReason]);
    const winner = structuredClone(lab.best.genome), score = lab.best.score;
    assert.ok(score > 500);
    lab.restartTrial(); finish(lab);
    assert.deepEqual(lab.vehicles.map(vehicle => [vehicle.score, vehicle.finishTime, vehicle.stopReason]), scores);
    assert.ok(lab.nextGeneration());
    assert.deepEqual(lab.vehicles[0].genome, winner);
    finish(lab); near(lab.vehicles[0].score, score);
    assert.ok(lab.vehicles.every(vehicle => Number.isFinite(vehicle.body.position.x + vehicle.body.position.y + vehicle.body.angle)));
  }
});

test('drive comparison varies only the driven axles and keeps power, mass and balance equal', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', surface: 'snow', initialExperiment: 'drive' });
  assert.deepEqual(lab.vehicles.map(vehicle => vehicle.design.driveType), ['fwd', 'rwd', 'awd', 'fwd', 'rwd', 'awd', 'fwd', 'rwd']);
  const first = lab.vehicles[0];
  for (const vehicle of lab.vehicles) {
    assert.deepEqual(without(vehicle.genome, 'drivetrain'), without(first.genome, 'drivetrain'));
    for (const key of ['totalMass', 'peakPower', 'powerToWeight', 'frontLoad', 'rearLoad']) near(vehicle.design[key], first.design[key]);
    near(vehicle.body.mass, first.body.mass); near(vehicle.body.inertia, first.body.inertia);
    assert.deepEqual(vehicle.design.centerOfMass, first.design.centerOfMass);
    near(vehicle.design.driveShares.reduce((sum, share) => sum + share, 0), 1);
  }
  for (const initialExperiment of ['power', 'balance']) {
    const comparison = new EvolutionLab({ seed: 42, initialExperiment });
    assert.ok(comparison.vehicles.every(vehicle => vehicle.design.driveType === 'awd'));
  }
  const evolution = new EvolutionLab({ seed: 42, population: 3 });
  assert.equal(new Set(evolution.vehicles.map(vehicle => vehicle.design.driveType)).size, 3);
  finish(lab);
  for (let i = 3; i < lab.vehicles.length; i++) near(lab.vehicles[i].score, lab.vehicles[i % 3].score);
  assert.ok(Math.max(...lab.vehicles.map(v => v.score)) - Math.min(...lab.vehicles.map(v => v.score)) > 100,
    'the drive allocation must affect actual travel with identical rated output');
});

test('implicit motors preserve the rated budget, passive axles and equal opposite chassis reaction', () => {
  const lab = new EvolutionLab({ population: 3, initialExperiment: 'drive' });
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.driveShares.reduce((a, b) => a + b, 0), 1);
    near(vehicle.design.peakPower, vehicle.genome.motorTorque * vehicle.genome.motorSpeed / 2);
    for (const relativeRatio of [0, .5, 1, 3]) {
      vehicle.body.angularVelocity = .073;
      vehicle.body.torque = 0;
      vehicle.wheels.forEach(wheel => { wheel.angularVelocity = .073 + vehicle.genome.motorSpeed * relativeRatio; wheel.torque = 0; });
      lab._applyDrive(vehicle);
      let motorTotal = 0;
      vehicle.wheels.forEach((wheel, i) => {
        const share = vehicle.design.driveShares[i];
        if (!share) near(wheel.torque, 0);
        assert.ok(Math.abs(wheel.torque) <= 2 * vehicle.genome.motorTorque * share + 1e-10);
        if (relativeRatio < 1 && share) assert.ok(wheel.torque > 0);
        if (relativeRatio > 1 && share) assert.ok(wheel.torque < 0);
        if (relativeRatio === 1) near(wheel.torque, 0);
        motorTotal += wheel.torque;
      });
      near(vehicle.body.torque, -motorTotal);
    }
  }
});

test('weight distribution interacts with the driven axle through actual traction on a hill', () => {
  const lab = new EvolutionLab({ population: 4, seed: 42, terrain: 'rolling', initialExperiment: 'drive' });
  const base = lab.genomes[0];
  lab.genomes = [0, 1].flatMap(drivetrain => [-.32, .32].map(powertrainPosition => ({ ...base, drivetrain, powertrainPosition })));
  lab.restartTrial();
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.totalMass, lab.vehicles[0].design.totalMass);
    near(vehicle.design.peakPower, lab.vehicles[0].design.peakPower);
  }
  finish(lab);
  const [frontDriveRearHeavy, frontDriveFrontHeavy, rearDriveRearHeavy, rearDriveFrontHeavy] = lab.vehicles;
  assert.ok(frontDriveFrontHeavy.score > frontDriveRearHeavy.score + 300, 'front drive should lose traction when its driven axle is lightly loaded');
  assert.ok(rearDriveRearHeavy.score > rearDriveFrontHeavy.score + 30, 'rear drive should benefit from moving mass toward its driven axle');
});

test('drivetrain mutation selects another discrete layout while preserving the exact elite', () => {
  const lab = new EvolutionLab({ population: 16, seed: 42, mutation: 1, initialExperiment: 'drive' });
  lab.genomes = lab.genomes.map(genome => ({ ...genome, drivetrain: 1 }));
  lab.restartTrial();
  lab._finish();
  const elite = structuredClone(lab.vehicles[0].genome);
  assert.ok(lab.nextGeneration());
  assert.deepEqual(lab.genomes[0], elite);
  assert.ok(lab.genomes.slice(1).every(genome => genome.drivetrain === 0 || genome.drivetrain === 2));
  assert.equal(new Set(lab.genomes.slice(1).map(genome => genome.drivetrain)).size, 2);
});


test('material changes preserve genomes and course geometry while changing only road physics', () => {
  const baseline = new EvolutionLab({ seed: 42, terrain: 'rolling', surface: 'asphalt' });
  for (const surface of ['asphalt', 'snow', 'gravel', 'sand', 'mixed']) {
    const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', surface });
    assert.deepEqual(lab.genomes, baseline.genomes);
    assert.deepEqual(lab.terrainPoints, baseline.terrainPoints);
    assert.equal(lab.surface, surface);
    assert.ok(lab.surfaceAt(140).grip > 0);
    assert.ok(lab.surfaceAt(140).rollingResistance > 0);
    if (surface !== 'mixed') assert.equal(lab.surfaceAt(1000).id, surface);
    else {
      assert.deepEqual(lab.surfaceSegments.map(segment => segment.id), ['asphalt', 'gravel', 'snow', 'sand']);
      for (let i = 1; i < lab.surfaceSegments.length; i++) {
        const edge = lab.surfaceSegments[i].start;
        assert.equal(lab.surfaceAt(edge - .01).id, lab.surfaceSegments[i - 1].id);
        assert.equal(lab.surfaceAt(edge).id, lab.surfaceSegments[i].id);
      }
    }
    lab.reset({ terrain: 'flat' });
    assert.equal(lab.surface, surface, 'terrain selection preserves chosen material');
  }
});

test('ordinary asphalt courses finish across seeds and all final rankings prefer elapsed finish time', () => {
  for (const seed of [1, 42, 123, 999]) for (const terrain of ['flat', 'rolling']) {
    const lab = finish(new EvolutionLab({ seed, terrain }), 1);
    assert.equal(lab.vehicles.filter(v => v.finished).length, lab.population, seed + ' / ' + terrain);
    const first = Math.min(...lab.vehicles.map(v => v.finishTime));
    near(lab.best.finishTime, first);
    near(lab.champion.finishTime, first);
    near(lab.history[0].bestTime, first);
    assert.equal(lab.history[0].finishers, lab.population);
    assert.ok(lab.vehicles.every(v => v.finishTime > 0 && v.finishTime <= lab.duration));
    assert.ok(lab.vehicles.every(v => v.telemetry.speed === 0 && v.stopReason === 'finished'));
    const winner = structuredClone(lab.best.genome);
    assert.ok(lab.nextGeneration());
    assert.deepEqual(lab.genomes[0], winner);
  }
});

test('Coulomb tire force is limited by each material and each axle load', () => {
  const lab = new EvolutionLab({ population: 3, initialExperiment: 'drive', surface: 'snow', terrain: 'flat' });
  for (let n = 0; n < 30; n++) lab.step();
  for (const vehicle of lab.vehicles) {
    const t = vehicle.telemetry;
    assert.ok(t.contact.every(Boolean));
    near(t.load[0] + t.load[1], 1);
    // Force a large slip so the capacity rather than motor output binds.
    vehicle.wheels.forEach(wheel => { wheel.angularVelocity = 2; wheel.force.x = 0; wheel.force.y = 0; wheel.torque = 0; });
    vehicle.body.torque = 0;
    lab._applyDrive(vehicle);
    vehicle.wheels.forEach((wheel, i) => {
      const capacity = lab.surfaceAt(wheel.position.x).grip * vehicle.design.totalMass * lab.engine.gravity.scale * t.load[i];
      assert.ok(Math.abs(wheel.force.x) <= capacity + 1e-10);
      assert.ok(Number.isFinite(wheel.torque));
    });
  }
});

test('snow and sand create repeatable traction losses while AWD retains a usable route', () => {
  for (const surface of ['snow', 'sand']) {
    const lab = finish(new EvolutionLab({ seed: 42, terrain: 'rolling', surface, population: 3, initialExperiment: 'drive' }), 1);
    const [fwd, rwd, awd] = lab.vehicles;
    assert.ok(awd.finished);
    assert.ok(!fwd.finished && !rwd.finished);
    assert.ok(awd.score > Math.max(fwd.score, rwd.score) + 500);
    const result = lab.vehicles.map(v => [v.score, v.finishTime, v.stopReason]);
    lab.restartTrial(); finish(lab, 1 / 60);
    assert.deepEqual(lab.vehicles.map(v => [v.score, v.finishTime, v.stopReason]), result);
  }
});

test('airborne tires cannot generate road thrust, load, rolling resistance or slip', () => {
  const lab = new EvolutionLab({ population: 2, terrain: 'flat' });
  const vehicle = lab.vehicles[0];
  lab._updateTyres(vehicle);
  assert.deepEqual(vehicle.telemetry.contact, [false, false]);
  assert.deepEqual(vehicle.telemetry.load, [0, 0]);
  assert.deepEqual(vehicle.telemetry.slip, [0, 0]);
  lab._applyDrive(vehicle);
  assert.ok(vehicle.wheels.every(wheel => wheel.force.x === 0 && wheel.force.y === 0));
  near(vehicle.body.torque + vehicle.wheels.reduce((sum, wheel) => sum + wheel.torque, 0), 0);
});

test('evolving proportions stay within production-like envelopes and matching tire sizes', () => {
  const lab = new EvolutionLab({ seed: 42, mutation: 1, population: 16 });
  for (let generation = 0; generation < 12; generation++) {
    for (const genome of lab.genomes) {
      assert.ok(genome.rearRadius / genome.width >= .077 - 1e-10 && genome.rearRadius / genome.width <= .115 + 1e-10);
      assert.ok(genome.frontRadius / genome.rearRadius >= .98 - 1e-10 && genome.frontRadius / genome.rearRadius <= 1.02 + 1e-10);
      assert.ok(genome.height / genome.width >= .185 - 1e-10 && genome.height / genome.width <= .4 + 1e-10);
      assert.ok(Number.isInteger(genome.drivetrain));
    }
    lab._finish();
    lab.nextGeneration();
  }
});


test('finish times improve the champion record while equal-time elites retain its original generation', () => {
  const lab = new EvolutionLab({ population: 3 });
  lab.vehicles.forEach((v, i) => { v.score = 2460; v.finished = true; v.finishTime = [20, 18, 16][i]; });
  lab._finish();
  assert.equal(lab.best.id, 3);
  assert.equal(lab.champion.generation, 1);
  assert.equal(lab.champion.finishTime, 16);
  lab.nextGeneration();
  lab.vehicles.forEach((v, i) => { v.score = 2460; v.finished = true; v.finishTime = [16, 20, 21][i]; });
  lab._finish();
  assert.equal(lab.best.id, 1);
  assert.equal(lab.champion.generation, 1);
  lab.nextGeneration();
  lab.vehicles.forEach((v, i) => { v.score = 2460; v.finished = true; v.finishTime = [16, 15, 21][i]; });
  lab._finish();
  assert.equal(lab.champion.generation, 3);
  assert.equal(lab.champion.id, 2);
  assert.equal(lab.champion.finishTime, 15);
});
