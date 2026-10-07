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
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x - width * .3, y: origin.y - height * .4 }).length, 0);
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x + width * .03, y: origin.y - height * .5 }).length, 1);
});

test('output comparison changes only torque and pays for its power with real body mass', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat', initialExperiment: 'power' });
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
  assert.ok(balanced.score > strongest.score + 50, 'extra motor mass must affect actual travel, not only displayed metrics');
});

test('higher free speed also adds real powertrain mass', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat', population: 2, initialExperiment: 'balance' });
  lab.genomes = [
    { ...lab.genomes[0], powertrainPosition: 0, motorSpeed: .06 },
    { ...lab.genomes[0], powertrainPosition: 0, motorSpeed: .18 }
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
  assert.ok(Math.max(...lab.vehicles.map(v => v.score)) - Math.min(...lab.vehicles.map(v => v.score)) > 100);
});

test('comparison trials replay deterministically and preserve every elite gene through evolution', () => {
  for (const initialExperiment of ['power', 'balance', 'drive']) {
    const lab = finish(new EvolutionLab({ seed: 42, terrain: 'rolling', initialExperiment }), 1 / 60);
    const scores = lab.vehicles.map(vehicle => vehicle.score);
    const winner = structuredClone(lab.best.genome), score = lab.best.score;
    assert.ok(score > 500);
    lab.restartTrial(); finish(lab);
    assert.deepEqual(lab.vehicles.map(vehicle => vehicle.score), scores);
    assert.ok(lab.nextGeneration());
    assert.deepEqual(lab.vehicles[0].genome, winner);
    finish(lab); near(lab.vehicles[0].score, score);
    assert.ok(lab.vehicles.every(vehicle => Number.isFinite(vehicle.body.position.x + vehicle.body.position.y + vehicle.body.angle)));
  }
});

test('drive comparison varies only the driven axles and keeps power, mass and balance equal', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', initialExperiment: 'drive' });
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

test('only driven wheels receive torque or motor braking, with equal total power and chassis reaction', () => {
  const lab = new EvolutionLab({ population: 3, initialExperiment: 'drive' });
  const expectedShares = [[0, 1], [1, 0], [.5, .5]];
  for (const [index, vehicle] of lab.vehicles.entries()) {
    assert.deepEqual(vehicle.design.driveShares, expectedShares[index]);
    for (const relativeRatio of [0, .5, 1, 3]) {
      // A rotating chassis must shift motor speed by the same amount; this is
      // relative axle speed, not the wheels' world-space angular velocity.
      vehicle.body.angularVelocity = .073;
      vehicle.body.torque = .17;
      vehicle.wheels.forEach(wheel => { wheel.angularVelocity = .073 + vehicle.genome.motorSpeed * relativeRatio; wheel.torque = .031; });
      lab._applyDrive(vehicle);
      const totalTorque = 2 * vehicle.genome.motorTorque * Math.max(-1, Math.min(1, 1 - relativeRatio));
      for (let i = 0; i < vehicle.wheels.length; i++) near(vehicle.wheels[i].torque - .031, totalTorque * expectedShares[index][i]);
      near(vehicle.body.torque - .17, -totalTorque);
      if (relativeRatio === .5) near(totalTorque * vehicle.genome.motorSpeed * relativeRatio, vehicle.design.peakPower);
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
