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
function without(genome, ...genes) {
  const result = { ...genome };
  for (const gene of [...genes, 'motorTorque', 'motorSpeed']) delete result[gene];
  return result;
}

test('all thirteen silhouettes have matching collision outlines and preserve space above the pickup deck', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat', population: 16 });
  assert.equal(new Set(lab.vehicles.map(vehicle => vehicle.design.style)).size, 13);
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
  const pickup = lab.vehicles.find(vehicle => vehicle.design.style === 'musso_ev');
  const origin = world(pickup.body, pickup.design.frame), { width, height } = pickup.genome;
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x - width * .3, y: origin.y - height * .6 }).length, 0);
  assert.equal(Matter.Query.point([pickup.body], { x: origin.x + width * .03, y: origin.y - height * .5 }).length, 1);
});

test('all factory dimensions, curb masses and base output match their named production references', () => {
  const catalogue = new EvolutionLab({ population: 16 });
  assert.deepEqual([...new Set(catalogue.vehicles.map(v => v.design.style))].sort(), Object.keys(EvolutionLab.SPECS).sort());
  for (const { id } of EvolutionLab.STYLES) {
    const lab = new EvolutionLab({ seed: 42, startingStyle: id });
    const { design, genome } = lab.vehicles[0], spec = EvolutionLab.SPECS[id];
    near(genome.width, spec.lengthMm * .023);
    near(genome.wheelBase, spec.wheelbaseMm / spec.lengthMm);
    near(genome.rearRadius, spec.rearTireRadiusMm * .023);
    near(genome.frontRadius, spec.frontTireRadiusMm * .023);
    const totalHeight = design.rearAxle.y + genome.rearRadius - Math.min(...design.outline.map(p => p.y));
    near(totalHeight, spec.heightMm * .023);
    near(design.massKg, spec.curbMassKg);
    near(design.powerPs, spec.powerPs);
    near(design.torqueNm, spec.torqueNm);
    near(genome.powerMultiplier, 1); near(genome.torqueMultiplier, 1);
    near(design.performanceRatio, 1);
    near(design.frontLoad, design.estimatedFactoryFrontLoad);
    assert.equal(design.driveType, spec.factoryDrive);
  }
  const porter = new EvolutionLab({ startingStyle: 'porter2' }).vehicles[0];
  assert.ok(porter.genome.frontRadius > porter.genome.rearRadius);
  near(porter.design.rearAxle.y + porter.genome.rearRadius, porter.design.frontAxle.y + porter.genome.frontRadius);
  const origin = world(porter.body, porter.design.frame), { width, height } = porter.genome;
  assert.equal(Matter.Query.point([porter.body], { x: origin.x - width * .3, y: origin.y - height * .6 }).length, 0);
  assert.equal(Matter.Query.point([porter.body], { x: origin.x + width * .25, y: origin.y - height * .5 }).length, 1);
});

test('the style catalogue can start a diverse fleet with any chosen model and survives terrain resets', () => {
  const ids = EvolutionLab.STYLES.map(style => style.id);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, 13);
  assert.ok(Object.isFrozen(EvolutionLab.STYLES));
  for (const [start, startingStyle] of ids.entries()) {
    const lab = new EvolutionLab({ seed: 42, startingStyle });
    assert.equal(lab.startingStyle, startingStyle);
    assert.deepEqual(lab.vehicles.map(v => v.design.style), Array.from({ length: 8 }, (_, i) => ids[(start + i) % ids.length]));
    assert.equal(new Set(lab.vehicles.map(v => v.design.style)).size, 8);
    const genomes = structuredClone(lab.genomes);
    lab.reset({ terrain: 'flat', surface: 'snow' });
    assert.equal(lab.startingStyle, startingStyle);
    assert.deepEqual(lab.genomes, genomes);
    lab.restartTrial();
    assert.equal(lab.vehicles[0].design.style, startingStyle);
  }
  const auto = new EvolutionLab({ seed: 42 });
  const selected = new EvolutionLab({ seed: 42, startingStyle: 'torres' });
  selected.reset({ startingStyle: null });
  assert.equal(selected.startingStyle, null);
  assert.deepEqual(selected.genomes, auto.genomes);
  selected.reset({ startingStyle: 'missing-model' });
  assert.equal(selected.startingStyle, null);
  assert.deepEqual(selected.genomes, auto.genomes);
  for (const initialExperiment of ['power', 'balance', 'drive']) {
    const baseline = new EvolutionLab({ seed: 42, initialExperiment });
    const comparison = new EvolutionLab({ seed: 42, initialExperiment, startingStyle: 'morning' });
    assert.equal(comparison.startingStyle, 'morning');
    assert.deepEqual(comparison.genomes, baseline.genomes);
    assert.ok(comparison.vehicles.every(v => v.design.style === 'ioniq5'));
    comparison.reset({ initialExperiment: 'evolution' });
    assert.equal(comparison.vehicles[0].design.style, 'morning');
  }
});

test('output comparison changes only the power multiplier and includes modest hardware mass', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', initialExperiment: 'power' });
  for (const vehicle of lab.vehicles) {
    assert.deepEqual(without(vehicle.genome, 'powerMultiplier'), without(lab.vehicles[0].genome, 'powerMultiplier'));
    const design = vehicle.design;
    near(design.totalMass, vehicle.body.mass + vehicle.wheels.reduce((sum, wheel) => sum + wheel.mass, 0));
    near(design.totalMass, design.shellMass + design.powertrainMass + design.wheelMass);
    near(design.massKg, design.totalMass / EvolutionLab.UNITS.massPerKg);
    near(design.powerToWeight, design.powerPs / design.massKg);
    near(design.torqueNm, design.factoryTorqueNm);
  }
  for (let i = 1; i < lab.vehicles.length; i++) {
    assert.ok(lab.vehicles[i].design.powerPs > lab.vehicles[i - 1].design.powerPs);
    assert.ok(lab.vehicles[i].body.mass > lab.vehicles[i - 1].body.mass);
  }
  finish(lab);
  assert.ok(lab.vehicles.every(vehicle => vehicle.finished));
  assert.ok(Math.max(...lab.vehicles.map(v => v.finishTime)) - Math.min(...lab.vehicles.map(v => v.finishTime)) > .3);
});

test('performance grades compare factory PS per kg and do not reward torque without accounting for mass', () => {
  const catalogue = new EvolutionLab({ population: 16 });
  catalogue.genomes = catalogue.genomes.map(genome => ({ ...genome, powerMultiplier: 1, torqueMultiplier: 1 }));
  catalogue.restartTrial();
  for (const { design } of catalogue.vehicles) {
    near(design.performanceRatio, 1);
    near(design.referencePowerToWeight, design.powerToWeight);
    near(design.referencePowerToWeight, design.factoryPowerPs / design.curbMassKg);
  }
  const lab = new EvolutionLab({ initialExperiment: 'power' });
  const base = lab.genomes[0];
  lab.genomes = [
    { ...base, powerMultiplier: 1, torqueMultiplier: 1 },
    { ...base, powerMultiplier: 1, torqueMultiplier: 1, powertrainPosition: .30, drivetrain: 0 },
    { ...base, powerMultiplier: 1.6, torqueMultiplier: 1 },
    { ...base, powerMultiplier: 1.6, torqueMultiplier: 1.6 }
  ];
  lab.restartTrial();
  const [factory, moved, tuned, maximum] = lab.vehicles;
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.referencePowerToWeight, factory.design.referencePowerToWeight);
    near(vehicle.design.performanceRatio, vehicle.design.powerToWeight / factory.design.powerToWeight);
  }
  near(moved.design.performanceRatio, 1);
  assert.ok(tuned.design.performanceRatio >= 1.2);
  near(maximum.design.powerPs, tuned.design.powerPs);
  assert.ok(maximum.design.torqueNm > tuned.design.torqueNm);
  assert.ok(maximum.design.performanceRatio < tuned.design.performanceRatio);
  near(maximum.design.massKg / maximum.design.curbMassKg, 1.03);
});

test('PS and Nm drive the physical motor curve in explicit length, mass and time units', () => {
  const lab = new EvolutionLab({ population: 16 });
  const u = EvolutionLab.UNITS, torqueUnit = u.massPerKg * u.lengthPerMetre ** 2 / 1e6;
  near(lab.engine.gravity.scale, 9.81 * 23 / 1e6);
  for (const vehicle of lab.vehicles) {
    const spec = EvolutionLab.SPECS[vehicle.design.style], g = vehicle.genome;
    const reduction = spec.gearRatio || u.reduction;
    near(2 * g.motorTorque / torqueUnit / reduction / u.efficiency, vehicle.design.torqueNm);
    const physicalPeakWatts = (g.motorTorque * g.motorSpeed / 2) / torqueUnit / u.baseSeconds;
    near(physicalPeakWatts, vehicle.design.powerPs * u.powerWattsPerPs * u.efficiency, 1e-6);
  }
  for (let i = 0; i < 240; i++) lab.step();
  for (const vehicle of lab.vehicles) near(vehicle.telemetry.speedKmH, vehicle.telemetry.speed / 23 * 3.6);
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
  assert.ok(last.body.position.x > first.body.position.x + 15);
  assert.ok(last.design.frontLoad > first.design.frontLoad + .2);
  const reference = lab.vehicles[3];
  const reducedMass = first.design.shellMass * first.design.powertrainMass / first.body.mass;
  const separationSquared = vehicle => {
    const shellCenter = vehicle.design.shellCenterOfMass, unit = vehicle.design.powerUnit;
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
  assert.ok(Math.max(...pitches) - Math.min(...pitches) > .005, 'load position must change physical pitch on the slope');
  finish(lab);
  assert.ok(lab.vehicles.every(vehicle => vehicle.finished));
  assert.ok(Math.max(...lab.vehicles.map(v => v.finishTime)) - Math.min(...lab.vehicles.map(v => v.finishTime)) > 1);
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
    assert.ok(comparison.vehicles.every(vehicle => vehicle.design.driveType === EvolutionLab.SPECS.ioniq5.factoryDrive));
  }
  const evolution = new EvolutionLab({ seed: 42, population: 16 });
  assert.ok(evolution.vehicles.every(vehicle => vehicle.design.driveType === EvolutionLab.SPECS[vehicle.design.style].factoryDrive));
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
        const units = EvolutionLab.UNITS, spec = EvolutionLab.SPECS[vehicle.design.style];
        const unitTorque = units.massPerKg * units.lengthPerMetre ** 2 / 1e6;
        const actualRatedWheelTorque = vehicle.design.torqueNm * (spec.gearRatio || units.reduction) * units.efficiency * unitTorque;
        assert.ok(Math.abs(wheel.torque) <= actualRatedWheelTorque * share + 1e-10);
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
  const lab = new EvolutionLab({ population: 4, seed: 42, terrain: 'rolling', surface: 'snow', initialExperiment: 'drive' });
  const base = lab.genomes[0];
  lab.genomes = [0, 1].flatMap(drivetrain => [-.32, .32].map(powertrainPosition => ({ ...base, drivetrain, powertrainPosition })));
  lab.restartTrial();
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.totalMass, lab.vehicles[0].design.totalMass);
    near(vehicle.design.peakPower, lab.vehicles[0].design.peakPower);
  }
  finish(lab);
  const [frontDriveRearHeavy, frontDriveFrontHeavy, rearDriveRearHeavy, rearDriveFrontHeavy] = lab.vehicles;
  assert.ok(EvolutionLab.compareVehicles(frontDriveFrontHeavy, frontDriveRearHeavy) < 0,
    'front drive should lose traction when its driven axle is lightly loaded');
  assert.ok(EvolutionLab.compareVehicles(rearDriveRearHeavy, rearDriveFrontHeavy) < 0,
    'rear drive should benefit from moving mass toward its driven axle');
  for (const [better, worse] of [[frontDriveFrontHeavy, frontDriveRearHeavy], [rearDriveRearHeavy, rearDriveFrontHeavy]]) {
    if (worse.finished) assert.ok(better.finishTime + .5 < worse.finishTime);
    else assert.ok(better.score > worse.score + 100);
  }
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
    const finishers = lab.vehicles.filter(v => v.finished);
    assert.ok(finishers.length >= lab.population - 1, seed + ' / ' + terrain);
    if (terrain === 'flat' || seed === 42) assert.equal(finishers.length, lab.population);
    const first = Math.min(...finishers.map(v => v.finishTime));
    near(lab.best.finishTime, first);
    near(lab.champion.finishTime, first);
    near(lab.history[0].bestTime, first);
    assert.equal(lab.history[0].finishers, finishers.length);
    assert.ok(finishers.every(v => v.finishTime > 0 && v.finishTime <= lab.duration));
    assert.ok(finishers.every(v => v.telemetry.speed === 0 && v.stopReason === 'finished'));
    assert.ok(lab.vehicles.every(v => v.telemetry.speed === 0 && !v.alive));
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
  const asphalt = finish(new EvolutionLab({ seed: 42, terrain: 'rolling', surface: 'asphalt', population: 3, initialExperiment: 'drive' }), 1);
  for (const surface of ['snow', 'sand']) {
    const lab = finish(new EvolutionLab({ seed: 42, terrain: 'rolling', surface, population: 3, initialExperiment: 'drive' }), 1);
    const [fwd, rwd, awd] = lab.vehicles;
    assert.ok(awd.finished);
    assert.ok(awd.finishTime > asphalt.vehicles[2].finishTime + 1);
    for (const singleAxle of [fwd, rwd]) {
      assert.ok(EvolutionLab.compareVehicles(awd, singleAxle) < 0);
      if (!singleAxle.finished) assert.ok(awd.score > singleAxle.score + 500);
    }
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

test('evolution preserves factory geometry and never selects output below the factory rating', () => {
  const lab = new EvolutionLab({ seed: 42, mutation: 1, population: 16 });
  for (let generation = 0; generation < 12; generation++) {
    for (const vehicle of lab.vehicles) {
      const { genome, design } = vehicle, spec = EvolutionLab.SPECS[design.style];
      near(genome.width, spec.lengthMm * .023);
      near(genome.wheelBase, spec.wheelbaseMm / spec.lengthMm);
      near(genome.rearRadius, spec.rearTireRadiusMm * .023);
      near(genome.frontRadius, spec.frontTireRadiusMm * .023);
      assert.ok(genome.powerMultiplier >= 1 && genome.powerMultiplier <= 1.6);
      assert.ok(genome.torqueMultiplier >= 1 && genome.torqueMultiplier <= 1.6);
      assert.ok(design.massKg >= spec.curbMassKg - 1e-8 && design.massKg <= spec.curbMassKg * 1.03 + 1e-8);
      assert.ok(Number.isInteger(genome.drivetrain));
    }
    lab._finish(); lab.nextGeneration();
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
