/* Matter.js 0.20.0 + a seeded genetic search over two-wheel vehicle designs.
 * World units are arbitrary. Fitness is the maximum chassis x displacement.
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
    motorSpeed: [0.06, 0.18], motorTorque: [0.018, 0.10]
  };
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
      this.genomes = Array.from({ length: this.population }, () => this._newGenome());
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
      return genome;
    }
    _makeVehicle(genome, index) {
      const w = genome.width, h = genome.height;
      const outline = [
        { x: -w / 2, y: h * 0.35 }, { x: -w * 0.28 + w * genome.roofLeft, y: -h * 0.65 },
        { x: w * 0.28 + w * genome.roofRight, y: -h * 0.65 }, { x: w / 2, y: h * 0.35 }
      ];
      const center = M.Vertices.centre(outline);
      const vertices = outline.map(point => ({ x: point.x - center.x, y: point.y - center.y }));
      const y = 360 - Math.max(genome.rearRadius, genome.frontRadius) - h * genome.axleY - 5;
      const filter = { group: -1, category: 2, mask: 1 };
      const body = M.Bodies.fromVertices(this.startX, y, [vertices], {
        density: 0.0015, friction: 0.45, frictionAir: 0.003, restitution: 0,
        collisionFilter: filter, label: 'vehicle-' + index
      });
      const offsets = [
        { x: -w * genome.wheelBase / 2, y: h * genome.axleY },
        { x: w * genome.wheelBase / 2, y: h * genome.axleY }
      ];
      const radii = [genome.rearRadius, genome.frontRadius];
      const wheels = offsets.map((offset, i) => M.Bodies.circle(body.position.x + offset.x, body.position.y + offset.y, radii[i], {
        density: 0.0018, friction: 0.95, frictionStatic: 2, frictionAir: 0.002, restitution: 0,
        collisionFilter: filter, label: 'wheel-' + index + '-' + i
      }, 24));
      const joints = wheels.map((wheel, i) => M.Constraint.create({ bodyA: body, pointA: offsets[i], bodyB: wheel, length: 0, stiffness: 0.9, damping: 0.06 }));
      M.Composite.add(this.engine.world, [body, ...wheels, ...joints]);
      return { id: index + 1, genome: copy(genome), body, wheels, joints, score: 0, alive: true, finished: false, color: COLORS[index % COLORS.length], lastProgress: 0 };
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
    _tick() {
      const dt = 1 / 120;
      for (const vehicle of this.vehicles) {
        if (!vehicle.alive) continue;
        let reaction = 0;
        for (const wheel of vehicle.wheels) {
          const torque = clamp((vehicle.genome.motorSpeed - wheel.angularVelocity) * wheel.inertia * 0.00025, -vehicle.genome.motorTorque, vehicle.genome.motorTorque);
          wheel.torque += torque;
          reaction += torque;
        }
        vehicle.body.torque -= reaction;
      }
      M.Engine.update(this.engine, dt * 1000);
      this._ticks++;
      this.time = Math.min(this.duration, this._ticks * dt);
      for (const vehicle of this.vehicles) {
        if (!vehicle.alive) continue;
        const x = vehicle.body.position.x, y = vehicle.body.position.y;
        if (!Number.isFinite(x) || !Number.isFinite(y) || y > 650 || x < -200) { this._stop(vehicle); continue; }
        const distance = clamp(x - this.startX, 0, this.finishX - this.startX);
        if (distance > vehicle.score) { vehicle.score = distance; vehicle.lastProgress = this.time; }
        if (x >= this.finishX) { vehicle.finished = true; this._stop(vehicle); }
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
          if (this._random() < this.mutation) value += (this._random() + this._random() - 1) * (range[1] - range[0]) * 0.45;
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
