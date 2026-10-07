/* Matter.js 0.20.0 + a seeded genetic search over two-wheel vehicle designs.
 * World units are arbitrary. Fitness is maximum displacement of the chassis
 * design origin, so relocating mass does not move the scoring reference.
 * Load vendor/matter.min.js before this file. See vendor/LICENSE for Matter.js.
 */
(function (root) {
  'use strict';
  const M = root.Matter || (typeof require === 'function' ? require('./vendor/matter.min.js') : null);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const copy = value => JSON.parse(JSON.stringify(value));
  const COLORS = ['#21654f', '#c58042', '#597bac', '#ad6675', '#7b7d43', '#765a97', '#399197', '#986c50'];
  const GENES = {
    width: [52, 104], height: [20, 55], roofLeft: [-0.25, 0.15], roofRight: [-0.15, 0.25],
    rearRadius: [12, 31], frontRadius: [12, 31], wheelBase: [0.52, 0.94], axleY: [0.12, 0.48],
    motorSpeed: [0.06, 0.18], motorTorque: [0.054, 0.30],
    bodyStyle: [0, 5.999999], powertrainPosition: [-0.38, 0.38], drivetrain: [0, 2.999999]
  };
  const DRIVETRAINS = [
    { id: 'fwd', label: '전륜', shares: [0, 1] },
    { id: 'rwd', label: '후륜', shares: [1, 0] },
    { id: 'awd', label: '사륜', shares: [.5, .5] }
  ];
  // Clockwise silhouettes. Concave cabins/decks are triangulated, not replaced
  // with a convex hull, so the painted silhouette is also the collision shape.
  const STYLES = [
    { id: 'buggy', label: '버기', points: [[-.5,.35],[-.5,-.53],[-.43,-.72],[.10,-.72],[.24,-.20],[.47,-.16],[.5,.35]] },
    { id: 'coupe', label: '쿠페', points: [[-.5,.35],[-.5,-.03],[-.43,-.22],[-.32,-.53],[-.16,-.72],[.06,-.73],[.24,-.41],[.36,-.19],[.48,-.09],[.5,.35]] },
    { id: 'van', label: '밴', points: [[-.5,.35],[-.5,-.49],[-.43,-.73],[-.28,-.83],[.30,-.83],[.44,-.63],[.5,-.25],[.5,.35]] },
    { id: 'pickup', label: '픽업', points: [[-.5,.35],[-.5,-.05],[-.12,-.50],[.02,-.82],[.39,-.12],[.5,-.06],[.5,.35]] },
    { id: 'racer', label: '레이서', points: [[-.5,.35],[-.5,-.17],[-.31,-.30],[-.23,-.59],[.02,-.64],[.31,-.02],[.5,.17],[.5,.35]] },
    { id: 'rover', label: '로버', points: [[-.5,.35],[-.5,-.57],[-.42,-.78],[.14,-.78],[.28,-.22],[.48,-.14],[.5,.35]] }
  ];
  // Start with recognizable proportions; later crossover and mutation remain
  // free to explore the full gene ranges. Ratios are stylized, not car specs.
  const STARTING_PROPORTIONS = [
    { width: [82,104], heightRatio: [.30,.38], wheelRatio: [.17,.22], wheelBase: [.64,.76] },
    { width: [90,104], heightRatio: [.22,.28], wheelRatio: [.13,.17], wheelBase: [.64,.74] },
    { width: [86,104], heightRatio: [.38,.46], wheelRatio: [.15,.19], wheelBase: [.64,.76] },
    { width: [94,104], heightRatio: [.27,.33], wheelRatio: [.15,.19], wheelBase: [.68,.78] },
    { width: [94,104], heightRatio: [.20,.26], wheelRatio: [.13,.17], wheelBase: [.65,.76] },
    { width: [86,104], heightRatio: [.34,.42], wheelRatio: [.17,.22], wheelBase: [.65,.77] }
  ];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function triangulate(points) {
    const remaining = points.map(point => ({ ...point })), triangles = [];
    while (remaining.length > 3) {
      let clipped = false;
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[(i + remaining.length - 1) % remaining.length], b = remaining[i], c = remaining[(i + 1) % remaining.length];
        if (cross(a, b, c) <= 1e-8) continue;
        if (remaining.some(p => p !== a && p !== b && p !== c && cross(a, b, p) >= -1e-8 && cross(b, c, p) >= -1e-8 && cross(c, a, p) >= -1e-8)) continue;
        triangles.push([a, b, c]); remaining.splice(i, 1); clipped = true; break;
      }
      if (!clipped) throw new Error('Vehicle silhouette must be a simple polygon.');
    }
    triangles.push(remaining);
    return triangles;
  }
  function randomGenerator(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  class EvolutionLab {
    constructor(config = {}) {
      if (!M) throw new Error('Matter.js must be loaded before evolution-engine.js.');
      this.population = Math.round(clamp(finite(config.population, 8), 2, 16));
      this.mutation = clamp(finite(config.mutation, 0.2), 0, 1);
      this.duration = 12;
      this.startX = 140;
      this.finishX = 2600;
      this.reset(config);
    }
    reset(config = {}) {
      this.seed = Math.round(finite(config.seed, this.seed ?? 42)) >>> 0;
      this.terrain = ['flat', 'rolling', 'steps', 'valley', 'dunes', 'ripple', 'custom'].includes(config.terrain) ? config.terrain : (this.terrain || 'rolling');
      if (this.terrain === 'custom' && config.points) this._customPoints = this._normalizePoints(config.points);
      this._random = randomGenerator(this.seed);
      this.generation = 1;
      this.history = [];
      this.champion = null;
      this.best = null;
      this.bestScore = 0;
      this.terrainPoints = this._terrain();
      this.initialExperiment = ['power', 'balance', 'drive'].includes(config.initialExperiment) ? config.initialExperiment : 'evolution';
      this.genomes = this._initialGenomes();
      this.restartTrial();
      return this;
    }
    _normalizePoints(points) {
      const clean = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
        .map(point => ({ x: clamp(point.x, 260, this.finishX), y: clamp(point.y, 230, 440) }))
        .sort((a, b) => a.x - b.x);
      const result = [{ x: -300, y: 360 }, { x: 0, y: 360 }, { x: 260, y: 360 }];
      for (const point of clean) if (point.x > result[result.length - 1].x + 5) result.push(point);
      if (result[result.length - 1].x < this.finishX) result.push({ x: this.finishX, y: result[result.length - 1].y });
      result.push({ x: this.finishX + 350, y: result[result.length - 1].y });
      return result;
    }
    _terrain() {
      if (this.terrain === 'custom' && this._customPoints) return copy(this._customPoints);
      const points = [{ x: -300, y: 360 }];
      const offset = (this.seed % 61) * 0.035;
      for (let x = 0; x <= this.finishX + 360; x += 40) {
        let y = 360;
        const ramp = clamp((x - 260) / 160, 0, 1);
        if (this.terrain === 'rolling') y += ramp * (36 * Math.sin((x - 260) * 0.007 + offset) + 13 * Math.sin((x - 260) * 0.021));
        if (this.terrain === 'steps' && x > 300) y -= Math.floor(((x - 300) % 640) / 160) * 17;
        if (this.terrain === 'valley') y += ramp * (70 * Math.exp(-Math.pow((x - 1100) / 470, 2)) - 90 * Math.exp(-Math.pow((x - 2050) / 400, 2)));
        if (this.terrain === 'dunes') y -= ramp * 85 * Math.pow(Math.sin(Math.max(0, x - 260) * Math.PI / 780), 2);
        if (this.terrain === 'ripple') y += ramp * (13 * Math.sin((x - 260) * Math.PI / 95) - 28 * Math.sin((x - 260) * Math.PI / 1200));
        points.push({ x, y });
      }
      return points;
    }
    groundAt(x) {
      const points = this.terrainPoints;
      for (let i = 1; i < points.length; i++) {
        if (x <= points[i].x) {
          const a = points[i - 1], b = points[i];
          return a.y + (b.y - a.y) * clamp((x - a.x) / (b.x - a.x), 0, 1);
        }
      }
      return points[points.length - 1].y;
    }
    _newGenome() {
      const genome = {};
      for (const [name, range] of Object.entries(GENES)) genome[name] = range[0] + this._random() * (range[1] - range[0]);
      genome.drivetrain = Math.floor(genome.drivetrain);
      return genome;
    }
    _initialGenomes() {
      const genomes = Array.from({ length: this.population }, () => this._newGenome());
      if (this.initialExperiment === 'evolution') {
        const firstStyle = Math.floor(genomes[0].bodyStyle), firstDrive = genomes[0].drivetrain;
        genomes.forEach((genome, i) => {
          genome.bodyStyle = (firstStyle + i) % STYLES.length + genome.bodyStyle % 1;
          genome.drivetrain = (firstDrive + i) % DRIVETRAINS.length;
          const shape = STARTING_PROPORTIONS[Math.floor(genome.bodyStyle)];
          const original = { ...genome };
          const sample = (name, [low, high]) => low + (high - low)
            * (original[name] - GENES[name][0]) / (GENES[name][1] - GENES[name][0]);
          genome.width = sample('width', shape.width);
          genome.height = clamp(genome.width * sample('height', shape.heightRatio), ...GENES.height);
          genome.rearRadius = clamp(genome.width * sample('rearRadius', shape.wheelRatio), ...GENES.rearRadius);
          genome.frontRadius = clamp(genome.rearRadius * sample('frontRadius', [.95,1.05]), ...GENES.frontRadius);
          genome.wheelBase = sample('wheelBase', shape.wheelBase);
          genome.axleY = sample('axleY', [.30,.42]);
          genome.roofLeft = sample('roofLeft', [-.05,.05]);
          genome.roofRight = sample('roofRight', [-.05,.05]);
        });
        return genomes;
      }
      const base = { ...genomes[0], width: 84, height: 32, rearRadius: 22, frontRadius: 22,
        wheelBase: .8, axleY: .34, roofLeft: 0, roofRight: 0, bodyStyle: 0,
        motorSpeed: .14, motorTorque: .186, powertrainPosition: 0, drivetrain: 2 };
      if (this.initialExperiment === 'drive') return genomes.map((_, i) => ({ ...base, drivetrain: i % DRIVETRAINS.length }));
      const gene = this.initialExperiment === 'power' ? 'motorTorque' : 'powertrainPosition';
      const [low, high] = GENES[gene];
      return genomes.map((_, i) => ({ ...base, [gene]: low + (high - low) * i / (this.population - 1) }));
    }
    _makeVehicle(genome, index) {
      const w = genome.width, h = genome.height;
      const style = STYLES[Math.floor(clamp(finite(genome.bodyStyle, 0), 0, 5.999999))];
      const drivetrain = DRIVETRAINS[Math.floor(clamp(finite(genome.drivetrain, 2), 0, 2.999999))];
      const outline = style.points.map(([x, y]) => ({ x: w * (x + (y < -.4 ? (x < 0 ? genome.roofLeft : genome.roofRight) * .35 : 0)), y: h * y }));
      const shellCenter = M.Vertices.centre(outline);
      const y = 360 - Math.max(genome.rearRadius, genome.frontRadius) - h * genome.axleY - 5;
      const filter = { group: -1, category: 2, mask: 1 };
      const bodyOptions = {
        density: 0.0015, friction: 0.45, frictionAir: 0.003, restitution: 0,
        collisionFilter: filter, label: 'vehicle-' + index
      };
      // fromVertices re-centres every supplied convex set. Build triangles at
      // their own centroids first, then compound them without moving the parts.
      const parts = triangulate(outline).map(triangle => {
        const centroid = M.Vertices.centre(triangle);
        return M.Bodies.fromVertices(this.startX + centroid.x, y + centroid.y, [triangle], bodyOptions, false, .01, 0);
      });
      const body = M.Body.create({ ...bodyOptions, parts });
      const shellMass = body.mass;
      // Larger torque and speed ratings need heavier motors and batteries.
      // This cost lives in Matter mass/inertia, never in a fitness penalty.
      const torqueRating = genome.motorTorque / GENES.motorTorque[1], speedRating = genome.motorSpeed / GENES.motorSpeed[1];
      const powertrainMass = .8 + 20 * torqueRating ** 2 + 8 * speedRating ** 2 + 6 * torqueRating * speedRating;
      const unit = { x: w * clamp(finite(genome.powertrainPosition, 0), -.38, .38), y: h * .26, width: w * .20, height: h * .12 };
      const chassisMass = shellMass + powertrainMass;
      const center = { x: (shellMass * shellCenter.x + powertrainMass * unit.x) / chassisMass,
        y: (shellMass * shellCenter.y + powertrainMass * unit.y) / chassisMass };
      const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      const shellInertia = M.Vertices.inertia(outline.map(p => ({ x: p.x - shellCenter.x, y: p.y - shellCenter.y })), shellMass);
      // Matter uses an inertia scale of 4 for polygon bodies; apply it to both
      // the distributed shell and the localized powertrain consistently.
      const inertia = 4 * (shellInertia + shellMass * distance2(shellCenter, center)
        + powertrainMass * ((unit.width ** 2 + unit.height ** 2) / 12 + distance2(unit, center)));
      M.Body.setMass(body, chassisMass);
      M.Body.setCentre(body, { x: this.startX + center.x, y: y + center.y });
      M.Body.setInertia(body, inertia);
      const offsets = [
        { x: -w * genome.wheelBase / 2 - center.x, y: h * genome.axleY - center.y },
        { x: w * genome.wheelBase / 2 - center.x, y: h * genome.axleY - center.y }
      ];
      const radii = [genome.rearRadius, genome.frontRadius];
      const wheels = offsets.map((offset, i) => M.Bodies.circle(body.position.x + offset.x, body.position.y + offset.y, radii[i], {
        density: 0.0018, friction: 0.95, frictionStatic: 2, frictionAir: 0.002, restitution: 0,
        collisionFilter: filter, label: 'wheel-' + index + '-' + i
      }, 24));
      const joints = wheels.map((wheel, i) => M.Constraint.create({ bodyA: body, pointA: offsets[i], bodyB: wheel, length: 0, stiffness: 0.9, damping: 0.06 }));
      M.Composite.add(this.engine.world, [body, ...wheels, ...joints]);
      const wheelMass = wheels.reduce((sum, wheel) => sum + wheel.mass, 0), totalMass = chassisMass + wheelMass;
      const centerOfMass = { x: wheels.reduce((sum, wheel, i) => sum + wheel.mass * offsets[i].x, 0) / totalMass,
        y: wheels.reduce((sum, wheel, i) => sum + wheel.mass * offsets[i].y, 0) / totalMass };
      const frontLoad = (centerOfMass.x - offsets[0].x) / (offsets[1].x - offsets[0].x);
      const peakPower = 2 * genome.motorTorque * genome.motorSpeed / 4;
      const design = { style: style.id, styleLabel: style.label,
        driveType: drivetrain.id, driveLabel: drivetrain.label, driveShares: [...drivetrain.shares],
        outline: outline.map(p => ({ x: p.x - center.x, y: p.y - center.y })),
        frame: { x: -center.x, y: -center.y }, rearAxle: { ...offsets[0] }, frontAxle: { ...offsets[1] },
        powerUnit: { ...unit, x: unit.x - center.x, y: unit.y - center.y }, shellMass, powertrainMass, wheelMass,
        totalMass, peakPower, powerToWeight: peakPower / totalMass, rearLoad: 1 - frontLoad, frontLoad, centerOfMass };
      return { id: index + 1, genome: copy(genome), design, body, wheels, joints, score: 0, alive: true, finished: false, color: COLORS[index % COLORS.length], lastProgress: 0 };
    }
    restartTrial() {
      if (this.engine) { M.Composite.clear(this.engine.world, false); M.Engine.clear(this.engine); }
      this.engine = M.Engine.create({ positionIterations: 8, velocityIterations: 8, constraintIterations: 4, enableSleeping: false });
      this.engine.gravity.y = 1;
      this.engine.gravity.scale = 0.001;
      this.terrainBodies = [];
      for (let i = 1; i < this.terrainPoints.length; i++) {
        const a = this.terrainPoints[i - 1], b = this.terrainPoints[i];
        const points = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: 720 }, { x: a.x, y: 720 }];
        const center = M.Vertices.centre(points);
        this.terrainBodies.push(M.Bodies.fromVertices(center.x, center.y, [points], { isStatic: true, friction: 0.9, frictionStatic: 2, restitution: 0, collisionFilter: { group: 0, category: 1, mask: 2 } }));
      }
      M.Composite.add(this.engine.world, this.terrainBodies);
      this.vehicles = this.genomes.map((genome, index) => this._makeVehicle(genome, index));
      this.time = 0;
      this.complete = false;
      this._ticks = 0;
      this._accumulator = 0;
      this.best = this.vehicles[0];
      return this;
    }
    setMutation(value) { this.mutation = clamp(finite(value, this.mutation), 0, 1); return this; }
    _stop(vehicle) {
      vehicle.alive = false;
      for (const body of [vehicle.body, ...vehicle.wheels]) M.Body.setStatic(body, true);
    }
    _applyDrive(vehicle) {
      if (!vehicle.alive) return;
      let reaction = 0;
      for (let i = 0; i < vehicle.wheels.length; i++) {
        const share = vehicle.design.driveShares[i];
        if (share === 0) continue; // Passive axles receive neither motor torque nor motor braking.
        const wheel = vehicle.wheels[i], relativeSpeed = wheel.angularVelocity - vehicle.body.angularVelocity;
        // Every layout has the same total stall torque and rated power budget.
        // AWD splits it equally; FWD/RWD allocate it all to the driven axle.
        const torque = 2 * vehicle.genome.motorTorque * share * clamp(1 - relativeSpeed / vehicle.genome.motorSpeed, -1, 1);
        wheel.torque += torque;
        reaction += torque;
      }
      vehicle.body.torque -= reaction;
    }
    _tick() {
      const dt = 1 / 120;
      for (const vehicle of this.vehicles) this._applyDrive(vehicle);
      M.Engine.update(this.engine, dt * 1000);
      this._ticks++;
      this.time = Math.min(this.duration, this._ticks * dt);
      for (const vehicle of this.vehicles) {
        if (!vehicle.alive) continue;
        const x = vehicle.body.position.x, y = vehicle.body.position.y;
        if (!Number.isFinite(x) || !Number.isFinite(y) || y > 650 || x < -200) { this._stop(vehicle); continue; }
        const frame = vehicle.design.frame, angle = vehicle.body.angle;
        const frameX = x + frame.x * Math.cos(angle) - frame.y * Math.sin(angle);
        const distance = clamp(frameX - this.startX, 0, this.finishX - this.startX);
        if (distance > vehicle.score) { vehicle.score = distance; vehicle.lastProgress = this.time; }
        if (frameX >= this.finishX) { vehicle.finished = true; this._stop(vehicle); }
      }
      this.best = this.vehicles.reduce((a, b) => b.score > a.score ? b : a);
      if (this.time >= this.duration || this.vehicles.every(vehicle => !vehicle.alive)) this._finish();
    }
    step(seconds = 1 / 120) {
      if (this.complete) return this;
      this._accumulator += clamp(finite(seconds, 0), 0, 1);
      while (this._accumulator + 1e-10 >= 1 / 120 && !this.complete) {
        this._accumulator -= 1 / 120;
        this._tick();
      }
      return this;
    }
    _finish() {
      if (this.complete) return;
      this.complete = true;
      const ranked = [...this.vehicles].sort((a, b) => b.score - a.score);
      const winner = ranked[0];
      if (!this.champion || winner.score > this.champion.score) this.champion = { generation: this.generation, id: winner.id, genome: copy(winner.genome), score: winner.score };
      this.bestScore = this.champion.score;
      const record = { generation: this.generation, best: winner.score, average: this.vehicles.reduce((sum, vehicle) => sum + vehicle.score, 0) / this.population, champion: this.bestScore };
      const previous = this.history.findIndex(item => item.generation === this.generation);
      if (previous >= 0) this.history[previous] = record; else this.history.push(record);
    }
    _select(ranked) {
      let best = ranked[Math.floor(this._random() * ranked.length)];
      for (let i = 0; i < 2; i++) {
        const candidate = ranked[Math.floor(this._random() * ranked.length)];
        if (candidate.score > best.score) best = candidate;
      }
      return best.genome;
    }
    nextGeneration() {
      if (!this.complete) return false;
      const ranked = [...this.vehicles].sort((a, b) => b.score - a.score);
      const offspring = [copy(ranked[0].genome)]; // Exact elite, without mutation.
      while (offspring.length < this.population) {
        const mother = this._select(ranked), father = this._select(ranked), child = {};
        for (const [name, range] of Object.entries(GENES)) {
          let value = this._random() < 0.5 ? mother[name] : father[name];
          if (this._random() < this.mutation) {
            if (name === 'drivetrain') value = (Math.floor(finite(value, 2)) + 1 + Math.floor(this._random() * 2)) % DRIVETRAINS.length;
            else value += (this._random() + this._random() - 1) * (range[1] - range[0]) * 0.45;
          }
          child[name] = clamp(value, range[0], range[1]);
        }
        offspring.push(child);
      }
      this.genomes = offspring;
      this.generation++;
      this.restartTrial();
      return true;
    }
  }
  root.EvolutionLab = EvolutionLab;
  if (typeof module !== 'undefined' && module.exports) module.exports = EvolutionLab;
})(typeof window !== 'undefined' ? window : globalThis);
