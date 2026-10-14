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

test('all fifteen silhouettes have matching collision outlines and preserve space above the pickup deck', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'flat', population: 16 });
  assert.equal(new Set(lab.vehicles.map(vehicle => vehicle.design.style)).size, 15);
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
    const power = spec.baseTune?.power || 1, torque = spec.baseTune?.torque || 1;
    const conversion = spec.conversionMassKg || 0;
    const tunedMass = spec.curbMassKg * (.03 * (power - 1) + .02 * (torque - 1));
    near(design.massKg, spec.curbMassKg + conversion + tunedMass);
    near(design.powerPs, spec.powerPs * power);
    near(design.torqueNm, spec.torqueNm * torque);
    near(genome.powerMultiplier, power); near(genome.torqueMultiplier, torque);
    near(design.referencePowerToWeight, spec.powerPs / (spec.curbMassKg + conversion));
    near(design.performanceRatio, design.powerToWeight / design.referencePowerToWeight);
    if (!conversion) near(design.frontLoad, design.estimatedFactoryFrontLoad);
    else assert.ok(design.frontLoad < design.estimatedFactoryFrontLoad);
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
  assert.equal(ids.length, 15);
  assert.equal(new Set(ids).size, 15);
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
  for (const initialExperiment of ['power', 'balance', 'drive', 'character']) {
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
    near(design.totalMass, design.shellMass + design.powertrainMass + design.wheelMass + design.conversionMassKg * EvolutionLab.UNITS.massPerKg);
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
    if (!design.conversionMassKg) near(design.performanceRatio, 1);
    near(design.referencePowerToWeight, design.factoryPowerPs / (design.curbMassKg + design.conversionMassKg));
  }
  const lab = new EvolutionLab({ initialExperiment: 'power' });
  const base = lab.genomes[0];
  lab.genomes = [
    { ...base, powerMultiplier: 1, torqueMultiplier: 1 },
    { ...base, powerMultiplier: 1, torqueMultiplier: 1, powertrainPosition: .30 },
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
    const spec = EvolutionLab.specForGenome(vehicle.genome), g = vehicle.genome;
    const reduction = g.gearRatio;
    near(2 * g.motorTorque / torqueUnit / reduction / u.efficiency, vehicle.design.torqueNm);
    near(g.motorSpeed / u.baseSeconds * reduction * 30 / Math.PI, vehicle.design.rpmLimitRpm);
    const curve = rpm => EvolutionLab.motorEnvelope(spec, g.powerMultiplier, g.torqueMultiplier, rpm);
    near(curve(0).torqueNm, vehicle.design.torqueNm);
    near(curve(vehicle.design.rpmLimitRpm).torqueNm, 0);
    for (let rpm = 0; rpm <= vehicle.design.rpmLimitRpm * 1.1; rpm += 100) {
      const point = curve(rpm);
      assert.ok(point.torqueNm >= 0 && point.torqueNm <= vehicle.design.torqueNm + 1e-8);
      assert.ok(point.powerPs >= 0 && point.powerPs <= vehicle.design.powerPs + 1e-8);
      near(point.powerPs * u.powerWattsPerPs, point.torqueNm * rpm * Math.PI / 30, 1e-6);
    }
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

test('drive comparison uses actual IONIQ 5 RWD and AWD factory variants', () => {
  const lab = new EvolutionLab({ seed: 42, terrain: 'rolling', surface: 'snow', initialExperiment: 'drive' });
  assert.deepEqual(lab.vehicles.map(vehicle => vehicle.design.driveType), ['rwd', 'awd', 'rwd', 'awd', 'rwd', 'awd', 'rwd', 'awd']);
  const [rwd, awd] = lab.vehicles;
  near(rwd.design.massKg, 2025); near(rwd.design.powerPs, 229); near(rwd.design.torqueNm, 350);
  near(awd.design.massKg, 2130); near(awd.design.powerPs, 325); near(awd.design.torqueNm, 605);
  assert.ok(awd.body.mass > rwd.body.mass && awd.body.inertia > rwd.body.inertia);
  assert.ok(awd.genome.motorTorque > rwd.genome.motorTorque);
  for (const vehicle of lab.vehicles) {
    const spec = EvolutionLab.specForGenome(vehicle.genome);
    near(vehicle.genome.powerMultiplier, 1); near(vehicle.genome.torqueMultiplier, 1);
    near(vehicle.design.referencePowerToWeight, spec.powerPs / spec.curbMassKg);
    near(vehicle.design.performanceRatio, 1);
    assert.equal(vehicle.design.factoryVariant, spec.variant);
    assert.equal(vehicle.design.referenceDrive, vehicle.design.driveType);
    near(vehicle.design.driveShares.reduce((sum, share) => sum + share, 0), 1);
  }
  for (const initialExperiment of ['power', 'balance', 'character']) {
    const comparison = new EvolutionLab({ seed: 42, initialExperiment });
    assert.ok(comparison.vehicles.every(vehicle => vehicle.design.driveType === 'rwd'));
  }
  const evolution = new EvolutionLab({ seed: 42, population: 16 });
  assert.ok(evolution.vehicles.every(vehicle => vehicle.design.driveType === EvolutionLab.SPECS[vehicle.design.style].factoryDrive));
  finish(lab);
  for (let i = 2; i < lab.vehicles.length; i++) near(lab.vehicles[i].score, lab.vehicles[i % 2].score);
  assert.ok(EvolutionLab.compareVehicles(awd, rwd) < 0, 'the factory AWD variant should retain traction on snow');
});

test('implicit motors preserve the rated budget, passive axles and equal opposite chassis reaction', () => {
  const lab = new EvolutionLab({ population: 3, initialExperiment: 'drive' });
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.driveShares.reduce((a, b) => a + b, 0), 1);
    const units = EvolutionLab.UNITS;
    const torqueUnit = units.massPerKg * units.lengthPerMetre ** 2 / 1e6;
    near(vehicle.design.peakPower, vehicle.design.powerPs * units.powerWattsPerPs * units.efficiency * torqueUnit * units.baseSeconds);
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
        const units = EvolutionLab.UNITS;
        const unitTorque = units.massPerKg * units.lengthPerMetre ** 2 / 1e6;
        const actualRatedWheelTorque = vehicle.design.torqueNm * vehicle.genome.gearRatio * units.efficiency * unitTorque;
        assert.ok(Math.abs(wheel.torque) <= actualRatedWheelTorque * share + 1e-10);
        if (relativeRatio < 1 && share) assert.ok(wheel.torque > 0);
        if (relativeRatio > 1) near(wheel.torque, 0);
        if (relativeRatio === 1) near(wheel.torque, 0);
        motorTotal += wheel.torque;
      });
      near(vehicle.body.torque, -motorTotal);
    }
  }
});

test('weight distribution interacts with legal front- and rear-driven models through traction on a hill', () => {
  const lab = new EvolutionLab({ population: 4, seed: 42, terrain: 'rolling', surface: 'snow' });
  const base = lab.genomes[0];
  lab.genomes = ['santafe', 'ioniq5'].flatMap(id => [-.32, .32].map(powertrainPosition => ({ ...base,
    bodyStyle: EvolutionLab.STYLES.findIndex(style => style.id === id),
    drivetrain: id === 'santafe' ? 0 : 1, powerMultiplier: 1, torqueMultiplier: 1, powertrainPosition })));
  lab.restartTrial();
  const [frontDriveRearHeavy, frontDriveFrontHeavy, rearDriveRearHeavy, rearDriveFrontHeavy] = lab.vehicles;
  for (const [first, second] of [[frontDriveRearHeavy, frontDriveFrontHeavy], [rearDriveRearHeavy, rearDriveFrontHeavy]]) {
    near(first.design.totalMass, second.design.totalMass);
    near(first.design.peakPower, second.design.peakPower);
  }
  assert.equal(frontDriveRearHeavy.design.driveType, 'fwd');
  assert.equal(rearDriveRearHeavy.design.driveType, 'rwd');
  finish(lab);
  for (const [better, worse] of [[frontDriveFrontHeavy, frontDriveRearHeavy], [rearDriveRearHeavy, rearDriveFrontHeavy]]) {
    assert.ok(EvolutionLab.compareVehicles(better, worse) < 0, 'loading the driven axle must improve traction');
    if (worse.finished) assert.ok(better.finishTime + .5 < worse.finishTime);
    else assert.ok(better.score > worse.score + 100);
  }
});

test('drivetrain mutation chooses the other legal factory variant while preserving the exact elite', () => {
  const lab = new EvolutionLab({ population: 16, seed: 42, mutation: 1, initialExperiment: 'drive' });
  lab.genomes = lab.genomes.map(genome => ({ ...genome, drivetrain: 1 }));
  lab.restartTrial(); lab._finish();
  const elite = structuredClone(lab.vehicles[0].genome);
  // A centred random draw leaves all continuous genes, including body style,
  // unchanged while still exercising drivetrain crossover and mutation.
  lab._random = () => .5;
  assert.ok(lab.nextGeneration());
  assert.deepEqual(lab.genomes[0], elite);
  assert.ok(lab.vehicles.slice(1).every(vehicle => vehicle.design.style === 'ioniq5' && vehicle.design.driveType === 'awd'));
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
    const [rwd, awd] = lab.vehicles;
    assert.ok(awd.finished);
    assert.ok(awd.finishTime > asphalt.vehicles[1].finishTime + 1);
    for (const singleAxle of [rwd]) {
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
      const { genome, design } = vehicle, spec = EvolutionLab.specForGenome(genome);
      near(genome.width, spec.lengthMm * .023);
      near(genome.wheelBase, spec.wheelbaseMm / spec.lengthMm);
      near(genome.rearRadius, spec.rearTireRadiusMm * .023);
      near(genome.frontRadius, spec.frontTireRadiusMm * .023);
      assert.ok(genome.powerMultiplier >= (spec.baseTune?.power || 1) && genome.powerMultiplier <= 1.6);
      assert.ok(genome.torqueMultiplier >= (spec.baseTune?.torque || 1) && genome.torqueMultiplier <= 1.6);
      assert.ok(design.massKg >= spec.curbMassKg + design.conversionMassKg - 1e-8 && design.massKg <= spec.curbMassKg * 1.03 + design.conversionMassKg + 1e-8);
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


test('torque plateaus at low RPM while horsepower sustains more torque at high RPM without changing the RPM ceiling', () => {
  const spec = EvolutionLab.SPECS.ioniq5;
  const curve = (power, torque, rpm) => EvolutionLab.motorEnvelope(spec, power, torque, rpm);
  const lowPower = curve(1.6, 1, 1000), lowTorque = curve(1, 1.6, 1000);
  near(lowPower.torqueNm, spec.torqueNm);
  near(lowTorque.torqueNm, spec.torqueNm * 1.6);
  assert.equal(lowPower.limit, 'torque');
  const highPower = curve(1.6, 1, 9000), highTorque = curve(1, 1.6, 9000);
  near(highPower.powerPs, spec.powerPs * 1.6);
  near(highTorque.powerPs, spec.powerPs);
  assert.ok(highPower.torqueNm > highTorque.torqueNm * 1.5);
  near(highPower.redlineRpm, highTorque.redlineRpm);
  for (const [power, torque] of [[1, 1], [1.6, 1], [1, 1.6]]) {
    const redlineRpm = curve(power, torque, 0).redlineRpm;
    const boundary = curve(power, torque, redlineRpm);
    assert.equal(boundary.limit, 'rpm'); near(boundary.torqueNm, 0); near(boundary.powerPs, 0);
    near(curve(power, torque, redlineRpm * 2).powerPs, 0);
  }
});

test('equal-mass character cars show torque-led launch and horsepower-led passing on a 500 metre course', () => {
  const lab = new EvolutionLab({ seed: 42, population: 3, terrain: 'flat', initialExperiment: 'character' });
  near((lab.finishX - lab.startX) / EvolutionLab.UNITS.lengthPerMetre, 500);
  near(lab.duration, 60);
  const [factory, power, torque] = lab.vehicles;
  for (const vehicle of lab.vehicles) {
    near(vehicle.design.massKg, factory.design.massKg);
    near(vehicle.body.inertia, factory.body.inertia);
    near(vehicle.design.frontLoad, factory.design.frontLoad);
    near(vehicle.genome.gearRatio, 12);
    assert.equal(vehicle.design.driveType, factory.design.driveType);
  }
  for (let i = 0; i < 5; i++) lab.step(1);
  assert.ok(torque.score > power.score + 200);
  assert.ok(torque.telemetry.speedKmH > power.telemetry.speedKmH + 5);
  for (let i = 0; i < 5; i++) lab.step(1);
  assert.ok(power.telemetry.speedKmH > torque.telemetry.speedKmH + 5);
  for (let i = 0; i < 5; i++) lab.step(1);
  assert.ok(power.score > torque.score + 30);
  finish(lab, 1);
  assert.ok(lab.vehicles.every(vehicle => vehicle.finished));
  assert.ok(power.finishTime + .5 < torque.finishTime);
  const elite = structuredClone(lab.best.genome), time = lab.best.finishTime;
  lab.nextGeneration(); assert.deepEqual(lab.genomes[0], elite); finish(lab, 1);
  near(lab.vehicles[0].finishTime, time);
  lab.reset({ initialExperiment: 'evolution' });
  near(lab.finishX, 2600); near(lab.duration, 45);
  assert.ok(lab.vehicles.every(vehicle => vehicle.genome.gearRatio === 8));
});

test('tow equipment and base tunes are explicit masses and outputs with a rearward axle load', () => {
  for (const startingStyle of ['rexton_tow', 'starex_tow']) {
    const lab = new EvolutionLab({ seed: 42, startingStyle, terrain: 'flat' });
    const v = lab.vehicles[0], d = v.design, spec = EvolutionLab.SPECS[startingStyle];
    near(d.stockMassKg, spec.curbMassKg);
    near(d.conversionMassKg, 350);
    near(v.genome.powerMultiplier, 1.25); near(v.genome.torqueMultiplier, 1.2);
    near(d.powerPs, spec.powerPs * 1.25); near(d.torqueNm, spec.torqueNm * 1.2);
    near(d.conversionUnit.x - d.frame.x, v.genome.width * spec.conversionPosition);
    const addedHardware = d.massKg - d.stockMassKg - d.conversionMassKg;
    const wheelbase = d.frontAxle.x - d.rearAxle.x;
    const expectedFront = (d.stockMassKg * d.estimatedFactoryFrontLoad
      + addedHardware * (d.powerUnit.x - d.rearAxle.x) / wheelbase
      + d.conversionMassKg * (d.conversionUnit.x - d.rearAxle.x) / wheelbase) / d.massKg;
    near(d.frontLoad, expectedFront);
    assert.ok(d.frontLoad < d.estimatedFactoryFrontLoad - .03);
    const equipmentMass = d.conversionMassKg * EvolutionLab.UNITS.massPerKg;
    const c = d.conversionUnit;
    assert.ok(v.body.inertia > 4 * equipmentMass * ((c.width ** 2 + c.height ** 2) / 12 + c.x ** 2 + c.y ** 2));
    finish(lab, 1);
    assert.ok(v.finished, startingStyle + ' should finish in its base towing configuration');
  }
});


test('saved custom terrain stretches to the 500 metre finish and restores without changing its saved points', () => {
  const lab = new EvolutionLab({ terrain: 'custom', points: [{ x: 1000, y: 330 }, { x: 2600, y: 340 }] });
  const saved = structuredClone(lab._customPoints), originalTerrain = structuredClone(lab.terrainPoints);
  lab.reset({ initialExperiment: 'character', terrain: 'flat' });
  lab.reset({ initialExperiment: 'character', terrain: 'custom' });
  assert.deepEqual(lab._customPoints, saved);
  assert.ok(lab.terrainPoints.at(-1).x > lab.finishX);
  assert.ok(lab.terrainPoints.some(point => point.x === 1000 && point.y === 330));
  assert.ok(lab.terrainBodies.some(body => body.bounds.min.x <= lab.finishX && body.bounds.max.x >= lab.finishX));
  lab.reset({ initialExperiment: 'evolution', terrain: 'custom' });
  assert.deepEqual(lab._customPoints, saved);
  assert.deepEqual(lab.terrainPoints, originalTerrain);
});


test('every model rejects impossible drivetrains at creation and replay while retaining each legal variant', () => {
  const driveIds = ['fwd', 'rwd', 'awd'];
  for (const { id } of EvolutionLab.STYLES) {
    const lab = new EvolutionLab({ startingStyle: id, population: 2, terrain: 'flat' });
    const base = { ...lab.genomes[0], powerMultiplier: 1, torqueMultiplier: 1 };
    const spec = EvolutionLab.SPECS[id], allowed = EvolutionLab.allowedDrivesFor(id);
    assert.ok(allowed.includes(spec.factoryDrive));
    assert.deepEqual(allowed, driveIds.filter(drive => Object.hasOwn(spec.driveVariants, drive)));
    for (const drivetrain of [0, 1, 2, -1, 3, 999, undefined, NaN, Infinity]) {
      const requested = driveIds[drivetrain];
      const expected = allowed.includes(requested) ? requested : spec.factoryDrive;
      lab.genomes = [{ ...base, drivetrain }, { ...base, drivetrain }];
      lab.restartTrial();
      const vehicle = lab.vehicles[0];
      assert.equal(vehicle.design.driveType, expected, id + ' must reject ' + requested);
      assert.equal(driveIds[vehicle.genome.drivetrain], expected);
      assert.equal(vehicle.design.factoryDrive, expected);
      assert.equal(vehicle.design.referenceDrive, expected);
      assert.deepEqual(vehicle.design.allowedDrives, allowed);
      const result = { genome: structuredClone(vehicle.genome), mass: vehicle.design.massKg, power: vehicle.design.powerPs };
      lab.restartTrial();
      assert.deepEqual(lab.vehicles[0].genome, result.genome);
      near(lab.vehicles[0].design.massKg, result.mass); near(lab.vehicles[0].design.powerPs, result.power);
    }
  }
  assert.deepEqual(EvolutionLab.allowedDrivesFor('santafe'), ['fwd', 'awd']);
  assert.deepEqual(EvolutionLab.allowedDrivesFor('ioniq5'), ['rwd', 'awd']);
  assert.deepEqual(EvolutionLab.allowedDrivesFor('staria'), ['fwd']);
  assert.deepEqual(EvolutionLab.allowedDrivesFor('porter2'), ['rwd']);
});

test('factory variants supply their own mass, power, torque, inertia and motor envelope', () => {
  for (const { id } of EvolutionLab.STYLES) {
    const lab = new EvolutionLab({ startingStyle: id, population: 2 });
    const base = lab.genomes[0];
    for (const drive of EvolutionLab.allowedDrivesFor(id)) {
      const reference = { ...EvolutionLab.SPECS[id], ...EvolutionLab.SPECS[id].driveVariants[drive] };
      lab.genomes = [{ ...base, drivetrain: ['fwd', 'rwd', 'awd'].indexOf(drive), powerMultiplier: 1, torqueMultiplier: 1 }];
      lab.restartTrial();
      const vehicle = lab.vehicles[0], d = vehicle.design, g = vehicle.genome;
      const extraMass = reference.curbMassKg * (.03 * (g.powerMultiplier - 1) + .02 * (g.torqueMultiplier - 1));
      near(d.massKg, reference.curbMassKg + (reference.conversionMassKg || 0) + extraMass);
      near(d.factoryPowerPs, reference.powerPs); near(d.factoryTorqueNm, reference.torqueNm);
      near(d.powerPs, reference.powerPs * g.powerMultiplier); near(d.torqueNm, reference.torqueNm * g.torqueMultiplier);
      near(d.referencePowerToWeight, reference.powerPs / (reference.curbMassKg + (reference.conversionMassKg || 0)));
      assert.equal(d.factoryVariant, reference.variant);
      assert.ok(vehicle.body.inertia > 0 && Number.isFinite(vehicle.body.inertia));
      const resolved = EvolutionLab.specForGenome(g);
      near(EvolutionLab.motorEnvelope(resolved, g.powerMultiplier, g.torqueMultiplier, 0).torqueNm, d.torqueNm);
      vehicle.body.angularVelocity = 0; vehicle.body.torque = 0;
      vehicle.wheels.forEach(wheel => { wheel.angularVelocity = 0; wheel.torque = 0; });
      lab._applyDrive(vehicle);
      const unit = EvolutionLab.UNITS;
      const torqueUnit = unit.massPerKg * unit.lengthPerMetre ** 2 / 1e6;
      const actualTorque = vehicle.wheels.reduce((sum, wheel) => sum + wheel.torque, 0) / torqueUnit;
      assert.ok(actualTorque > 0 && actualTorque <= d.torqueNm * g.gearRatio * unit.efficiency + 1e-7);
      for (const [i, wheel] of vehicle.wheels.entries()) {
        const share = d.driveShares[i], step = (1000 / 120) * (1000 / 60);
        const nextSpeed = step * wheel.torque * (wheel.inverseInertia + vehicle.body.inverseInertia);
        const rpm = nextSpeed / unit.baseSeconds * g.gearRatio * 30 / Math.PI;
        const requested = EvolutionLab.motorEnvelope(resolved, g.powerMultiplier, g.torqueMultiplier, rpm).torqueNm
          * g.gearRatio * unit.efficiency * torqueUnit * share;
        near(wheel.torque, requested, 2 * g.motorTorque / 2 ** 19 + 1e-10);
      }
    }
  }
});

test('crossover and many generations of maximum mutation cannot invent a factory drivetrain', () => {
  const observedStyles = new Set(), observedDrives = new Set();
  for (const seed of [1, 42, 999]) {
    const lab = new EvolutionLab({ seed, population: 16, mutation: 1 });
    for (let generation = 0; generation < 20; generation++) {
      for (const vehicle of lab.vehicles) {
        const { design, genome } = vehicle;
        const allowed = EvolutionLab.allowedDrivesFor(design.style);
        assert.ok(allowed.includes(design.driveType), design.style + '/' + design.driveType);
        observedStyles.add(design.style); observedDrives.add(design.driveType);
        const spec = EvolutionLab.specForGenome(genome);
        near(design.factoryPowerPs, spec.powerPs); near(design.factoryTorqueNm, spec.torqueNm);
        near(design.curbMassKg, spec.curbMassKg);
        near(genome.width, spec.lengthMm * .023);
      }
      lab._finish();
      const elite = structuredClone(lab.best.genome);
      assert.ok(lab.nextGeneration());
      assert.deepEqual(lab.genomes[0], elite);
    }
  }
  assert.equal(observedStyles.size, 15);
  assert.deepEqual([...observedDrives].sort(), ['awd', 'fwd', 'rwd']);
});
