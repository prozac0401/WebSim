/* Matter.js 0.20.0 + a seeded genetic search over two-wheel vehicle designs.
 * World units are arbitrary. Finishers rank by elapsed time; unfinished cars
 * rank by maximum displacement of the chassis design origin. Relocating mass
 * therefore never moves the scoring reference.
 * Load vendor/matter.min.js before this file. See vendor/LICENSE for Matter.js.
 */
(function (root) {
  'use strict';
  const M = root.Matter || (typeof require === 'function' ? require('./vendor/matter.min.js') : null);
  const VEHICLE_SPECS = root.VehicleSpecs || (typeof require === 'function' ? require('./vehicle-specs.js') : null);
  if (!VEHICLE_SPECS) throw new Error('Vehicle specifications must be loaded before evolution-engine.js.');
  // Matter uses world units and milliseconds. One world unit is 1/23 metre;
  // one internal mass unit represents 50 kg. The 2D drivetrain uses a fixed
  // reduction and an idealized torque curve, not a manufacturer acceleration map.
  const UNITS = Object.freeze({ lengthPerMetre: 23, massPerKg: .02, gravity: 9.81,
    baseSeconds: 1 / 60, powerWattsPerPs: 735.49875, reduction: 8, efficiency: .88 });
  const TORQUE_UNIT = UNITS.massPerKg * UNITS.lengthPerMetre ** 2 / 1e6;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const copy = value => JSON.parse(JSON.stringify(value));
  const COLORS = ['#21654f', '#c58042', '#597bac', '#ad6675', '#7b7d43', '#765a97', '#399197', '#986c50'];
  const DRIVETRAINS = [
    { id: 'fwd', label: '전륜', shares: [0, 1] },
    { id: 'rwd', label: '후륜', shares: [1, 0] },
    { id: 'awd', label: '사륜', shares: [.5, .5] }
  ];
  // Clockwise silhouettes. Concave cabins/decks are triangulated, not replaced
  // with a convex hull, so the painted silhouette is also the collision shape.
  const STYLES = [
    { id: 'ray', label: '기아 레이', points: [[-.5,.25],[-.5,-.58],[-.478,-.72],[-.43,-.79],[.11,-.79],[.20,-.73],[.335,-.25],[.465,-.23],[.5,-.13],[.5,.20],[.38,.35],[-.38,.35]] },
    { id: 'avante', label: '현대 아반떼', points: [[-.5,.16],[-.5,-.19],[-.475,-.29],[-.355,-.31],[-.20,-.74],[-.11,-.80],[.075,-.79],[.125,-.72],[.265,-.29],[.46,-.24],[.50,-.10],[.5,.16],[.38,.35],[-.38,.35]] },
    { id: 'staria', label: '현대 스타리아', points: [[-.5,.16],[-.5,-.57],[-.481,-.72],[-.423,-.79],[.025,-.81],[.16,-.75],[.275,-.57],[.385,-.32],[.472,-.07],[.5,.09],[.5,.16],[.38,.35],[-.38,.35]] },
    { id: 'musso_ev', label: 'KGM 무쏘 EV', points: [[-.5,.16],[-.5,-.36],[-.191,-.36],[-.188,-.70],[-.143,-.79],[.11,-.79],[.25,-.27],[.463,-.245],[.5,-.125],[.5,.16],[.38,.35],[-.38,.35]] },
    { id: 'ioniq5', label: '현대 아이오닉 5', points: [[-.5,.16],[-.5,-.16],[-.442,-.28],[-.337,-.76],[-.284,-.81],[.105,-.79],[.285,-.28],[.463,-.24],[.5,-.105],[.5,.16],[.38,.35],[-.38,.35]] },
    { id: 'santafe', label: '현대 싼타페', points: [[-.5,.16],[-.5,-.67],[-.463,-.79],[.13,-.79],[.273,-.29],[.463,-.255],[.5,-.13],[.5,.16],[.38,.35],[-.38,.35]] },
    { id: 'morning', label: '기아 모닝', points: [[-.5,.18],[-.5,-.04],[-.472,-.285],[-.372,-.716],[-.29,-.79],[-.03,-.82],[.105,-.76],[.296,-.28],[.442,-.18],[.5,-.015],[.5,.18],[.37,.35],[-.37,.35]] },
    { id: 'k5', label: '기아 K5', points: [[-.5,.17],[-.5,-.165],[-.468,-.28],[-.398,-.275],[-.24,-.65],[-.12,-.80],[.006,-.80],[.105,-.682],[.251,-.292],[.434,-.23],[.5,-.065],[.5,.17],[.365,.35],[-.365,.35]] },
    { id: 'grandeur', label: '현대 그랜저', points: [[-.5,.16],[-.5,-.19],[-.451,-.282],[-.33,-.327],[-.204,-.701],[-.115,-.78],[.062,-.79],[.142,-.661],[.255,-.292],[.442,-.243],[.5,-.11],[.5,.16],[.37,.35],[-.37,.35]] },
    { id: 'carnival', label: '기아 카니발', points: [[-.5,.16],[-.5,-.51],[-.437,-.755],[-.372,-.805],[.03,-.803],[.134,-.692],[.289,-.298],[.445,-.26],[.5,-.12],[.5,.16],[.37,.35],[-.37,.35]] },
    { id: 'g80', label: '제네시스 G80', points: [[-.5,.16],[-.5,-.168],[-.474,-.267],[-.37,-.38],[-.244,-.63],[-.10,-.798],[.021,-.81],[.112,-.695],[.26,-.295],[.403,-.255],[.471,-.18],[.5,-.055],[.5,.16],[.37,.35],[-.37,.35]] },
    { id: 'torres', label: 'KGM 토레스', points: [[-.5,.17],[-.5,-.16],[-.475,-.35],[-.371,-.735],[-.321,-.785],[.086,-.785],[.157,-.675],[.286,-.32],[.447,-.283],[.5,-.125],[.5,.17],[.37,.35],[-.37,.35]] },
    { id: 'porter2', label: '현대 포터 II', axleOffset: .044, points: [[-.5,.17],[-.5,-.18],[.10,-.18],[.10,-.72],[.16,-.81],[.32,-.82],[.405,-.72],[.465,-.45],[.5,-.10],[.5,.17],[.39,.35],[-.38,.35]] },
    { id: 'rexton_tow', label: '렉스턴 렉카', points: [[-.5,.17],[-.5,-.28],[-.32,-.28],[-.32,-.68],[-.26,-.79],[.11,-.79],[.26,-.31],[.455,-.28],[.5,-.13],[.5,.17],[.38,.35],[-.38,.35]] },
    { id: 'starex_tow', label: '스타렉스 렉카', points: [[-.5,.17],[-.5,-.18],[-.12,-.18],[-.12,-.73],[-.06,-.81],[.16,-.79],[.295,-.56],[.43,-.19],[.485,-.13],[.5,.02],[.5,.17],[.38,.35],[-.38,.35]] }
  ];
  const GENES = {
    width: [80, 124], height: [18, 50], roofLeft: [-0.25, 0.15], roofRight: [-0.15, 0.25],
    rearRadius: [6, 15], frontRadius: [6, 15], wheelBase: [0.50, 0.75], axleY: [0.30, 0.42],
    powerMultiplier: [1, 1.6], torqueMultiplier: [1, 1.6],
    bodyStyle: [0, STYLES.length - 1e-6], powertrainPosition: [-0.38, 0.38], drivetrain: [0, 2.999999]
  };
  function estimatedFactoryBalance(style, spec) {
    // Axle weights are unavailable in the cited retail specifications. These
    // layout estimates are explicitly separate from the measured curb mass.
    if (style === 'porter2') return { front: .59, unit: .30 };
    if (style === 'musso_ev') return { front: .52, unit: 0 };
    if (style === 'ioniq5') return { front: .49, unit: 0 };
    return { front: spec.factoryDrive === 'fwd' ? .58 : .50, unit: .25 };
  }
  function powertrainMassFor(spec, powerMultiplier, torqueMultiplier) {
    // The reference curb mass includes the factory drivetrain. Hardware for
    // extra output adds up to 3% at the limits of this educational model.
    return spec.curbMassKg * (.24 + .03 * (powerMultiplier - 1) + .02 * (torqueMultiplier - 1));
  }
  function motorEnvelope(spec, powerMultiplier = 1, torqueMultiplier = 1, engineRpm = 0) {
    const maxTorque = spec.torqueNm * torqueMultiplier;
    const maxPower = spec.powerPs * powerMultiplier * UNITS.powerWattsPerPs;
    const redlineRpm = spec.redlineRpm || (spec.powertrainType === 'electric' ? 14000 : spec.powertrainType === 'diesel' ? 4500 : 6500);
    const rpm = Math.max(0, finite(engineRpm, 0));
    const omega = rpm * Math.PI / 30;
    const crossoverRpm = maxPower / maxTorque * 30 / Math.PI;
    const powerTorque = omega > 0 ? maxPower / omega : Infinity;
    const taper = clamp((redlineRpm - rpm) / (redlineRpm * .05), 0, 1);
    const torqueNm = Math.min(maxTorque, powerTorque) * taper;
    const limit = taper < 1 ? 'rpm' : powerTorque < maxTorque ? 'power' : 'torque';
    return { torqueNm, powerPs: torqueNm * omega / UNITS.powerWattsPerPs, limit, redlineRpm, crossoverRpm };
  }
  const SURFACES = {
    asphalt: { id: 'asphalt', label: '포장도로', grip: .95, rollingResistance: .012 },
    snow: { id: 'snow', label: '눈길', grip: .16, rollingResistance: .035 },
    gravel: { id: 'gravel', label: '자갈길', grip: .55, rollingResistance: .045 },
    sand: { id: 'sand', label: '모래길', grip: .42, rollingResistance: .095 }
  };
  const compareVehicles = (a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.finishTime - b.finishTime || a.id - b.id;
    return b.score - a.score || a.id - b.id;
  };
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
      this.duration = 45;
      this.startX = 140;
      this.finishX = 2600;
      this.reset(config);
    }
    reset(config = {}) {
      this.initialExperiment = ['power', 'balance', 'drive', 'character'].includes(config.initialExperiment) ? config.initialExperiment : 'evolution';
      this.finishX = this.initialExperiment === 'character' ? this.startX + 500 * UNITS.lengthPerMetre : 2600;
      this.duration = this.initialExperiment === 'character' ? 60 : 45;
      this.seed = Math.round(finite(config.seed, this.seed ?? 42)) >>> 0;
      this.terrain = ['flat', 'rolling', 'steps', 'valley', 'dunes', 'ripple', 'custom'].includes(config.terrain) ? config.terrain : (this.terrain || 'rolling');
      if (this.terrain === 'custom' && config.points) this._customPoints = this._normalizePoints(config.points);
      this.surface = [...Object.keys(SURFACES), 'mixed'].includes(config.surface) ? config.surface : (this.surface || 'asphalt');
      const surfaceLength = (this.finishX - this.startX) / 4;
      this.surfaceSegments = this.surface === 'mixed'
        ? ['asphalt', 'gravel', 'snow', 'sand'].map((surface, i) => ({ start: i === 0 ? -300 : this.startX + i * surfaceLength, end: i === 3 ? this.finishX + 360 : this.startX + (i + 1) * surfaceLength, ...SURFACES[surface] }))
        : [{ start: -300, end: this.finishX + 360, ...SURFACES[this.surface] }];
      if (Object.prototype.hasOwnProperty.call(config, 'startingStyle')) {
        this.startingStyle = STYLES.some(style => style.id === config.startingStyle) ? config.startingStyle : null;
      } else this.startingStyle ??= null;
      this._random = randomGenerator(this.seed);
      this.generation = 1;
      this.history = [];
      this.champion = null;
      this.best = null;
      this.bestScore = 0;
      this.terrainPoints = this._terrain();
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
      if (this.terrain === 'custom' && this._customPoints) return this._normalizePoints(this._customPoints);
      const points = [{ x: -300, y: 360 }];
      const offset = (this.seed % 61) * 0.035;
      for (let x = 0; x <= this.finishX + 360; x += 40) {
        let y = 360;
        const ramp = clamp((x - 260) / 160, 0, 1);
        if (this.terrain === 'rolling') y += ramp * (24 * Math.sin((x - 260) * 0.007 + offset) + 5 * Math.sin((x - 260) * 0.021));
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
    surfaceAt(x) {
      return this.surfaceSegments.find(segment => x < segment.end) || this.surfaceSegments[this.surfaceSegments.length - 1];
    }
    _constrainGenome(genome) {
      genome.bodyStyle = clamp(finite(genome.bodyStyle, 0), 0, STYLES.length - 1e-6);
      const style = STYLES[Math.floor(genome.bodyStyle)], spec = VEHICLE_SPECS[style.id];
      if (!spec) throw new Error('Missing vehicle specification: ' + style.id);
      const scale = UNITS.lengthPerMetre / 1000;
      genome.width = spec.lengthMm * scale;
      genome.rearRadius = spec.rearTireRadiusMm * scale;
      genome.frontRadius = spec.frontTireRadiusMm * scale;
      genome.wheelBase = spec.wheelbaseMm / spec.lengthMm;
      genome.axleY = .36;
      genome.roofLeft = 0;
      genome.roofRight = 0;
      const roof = Math.min(...style.points.map(point => point[1]));
      genome.height = (spec.heightMm * scale - genome.rearRadius) / (genome.axleY - roof);
      genome.powerMultiplier = clamp(finite(genome.powerMultiplier, 1), spec.baseTune?.power || 1, GENES.powerMultiplier[1]);
      genome.torqueMultiplier = clamp(finite(genome.torqueMultiplier, 1), spec.baseTune?.torque || 1, GENES.torqueMultiplier[1]);
      genome.powertrainPosition = clamp(finite(genome.powertrainPosition, 0), ...GENES.powertrainPosition);
      genome.drivetrain = Math.floor(clamp(finite(genome.drivetrain, 2), 0, DRIVETRAINS.length - 1e-6));
      const reduction = this.initialExperiment === 'character' ? 12 : spec.gearRatio || UNITS.reduction;
      genome.gearRatio = reduction;
      const torqueNm = spec.torqueNm * genome.torqueMultiplier;
      const envelope = motorEnvelope(spec, genome.powerMultiplier, genome.torqueMultiplier, 0);
      // These derived values expose the geared torque ceiling and RPM ceiling.
      // Power is evaluated independently by motorEnvelope at the current RPM.
      genome.motorTorque = .5 * torqueNm * reduction * UNITS.efficiency * TORQUE_UNIT;
      genome.motorSpeed = envelope.redlineRpm * Math.PI / 30 / reduction * UNITS.baseSeconds;
      return genome;
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
        const selectedStyle = STYLES.findIndex(style => style.id === this.startingStyle);
        const firstStyle = selectedStyle < 0 ? Math.floor(genomes[0].bodyStyle) : selectedStyle;
        genomes.forEach((genome, i) => {
          genome.bodyStyle = (firstStyle + i) % STYLES.length + genome.bodyStyle % 1;
          const spec = VEHICLE_SPECS[STYLES[Math.floor(genome.bodyStyle)].id];
          genome.drivetrain = Math.max(0, DRIVETRAINS.findIndex(drive => drive.id === spec.factoryDrive));
          const balance = estimatedFactoryBalance(STYLES[Math.floor(genome.bodyStyle)].id, spec);
          genome.powertrainPosition = balance.unit + (genome.powertrainPosition / .38) * .07;
          if (i === 0) { genome.powerMultiplier = 1; genome.torqueMultiplier = 1; genome.powertrainPosition = balance.unit; }
          this._constrainGenome(genome);
        });
        return genomes;
      }
      const factoryDrive = DRIVETRAINS.findIndex(drive => drive.id === VEHICLE_SPECS.ioniq5.factoryDrive);
      const base = this._constrainGenome({ ...genomes[0], bodyStyle: 4,
        powerMultiplier: 1, torqueMultiplier: 1, powertrainPosition: 0, drivetrain: factoryDrive });
      if (this.initialExperiment === 'character') return genomes.map((_, i) => {
        const genome = this._constrainGenome({ ...base,
          powerMultiplier: i % 3 === 1 ? 1.6 : 1, torqueMultiplier: i % 3 === 2 ? 1.6 : 1 });
        const spec = VEHICLE_SPECS.ioniq5;
        genome.comparisonBallastKg = Math.max(0, powertrainMassFor(spec, 1.6, 1)
          - powertrainMassFor(spec, genome.powerMultiplier, genome.torqueMultiplier));
        return genome;
      });
      if (this.initialExperiment === 'drive') return genomes.map((_, i) => this._constrainGenome({ ...base, drivetrain: i % DRIVETRAINS.length }));
      const gene = this.initialExperiment === 'power' ? 'powerMultiplier' : 'powertrainPosition';
      const [low, high] = GENES[gene];
      return genomes.map((_, i) => this._constrainGenome({ ...base, [gene]: low + (high - low) * i / (this.population - 1) }));
    }
    _makeVehicle(genome, index) {
      this._constrainGenome(genome);
      const w = genome.width, h = genome.height;
      const style = STYLES[Math.floor(clamp(finite(genome.bodyStyle, 0), 0, STYLES.length - 1e-6))];
      const drivetrain = DRIVETRAINS[Math.floor(clamp(finite(genome.drivetrain, 2), 0, 2.999999))];
      const outline = style.points.map(([x, y]) => ({ x: w * (x + (y < -.4 ? (x < 0 ? genome.roofLeft : genome.roofRight) * .35 : 0)), y: h * y }));
      const shellCenter = M.Vertices.centre(outline);
      const y = 360 - Math.max(genome.rearRadius, genome.frontRadius) - h * genome.axleY - 5;
      const filter = { group: -1, category: 2, mask: 1 };
      const bodyOptions = {
        density: 0.0015, friction: 0.45, frictionAir: 0.0007, restitution: 0,
        collisionFilter: filter, label: 'vehicle-' + index
      };
      // fromVertices re-centres every supplied convex set. Build triangles at
      // their own centroids first, then compound them without moving the parts.
      const parts = triangulate(outline).map(triangle => {
        const centroid = M.Vertices.centre(triangle);
        return M.Bodies.fromVertices(this.startX + centroid.x, y + centroid.y, [triangle], bodyOptions, false, .01, 0);
      });
      const body = M.Body.create({ ...bodyOptions, parts });
      const spec = VEHICLE_SPECS[style.id];
      const shellMass = spec.curbMassKg * .72 * UNITS.massPerKg;
      // Larger torque and speed ratings need heavier motors and batteries.
      // This cost lives in Matter mass/inertia, never in a fitness penalty.
      const hardwareMassKg = powertrainMassFor(spec, genome.powerMultiplier, genome.torqueMultiplier);
      // The character experiment equalizes hardware mass with visible ballast;
      // ordinary evolution keeps the actual output-dependent hardware mass.
      const comparisonBallastKg = clamp(finite(genome.comparisonBallastKg, 0), 0, spec.curbMassKg * .03);
      const powertrainMass = (hardwareMassKg + comparisonBallastKg) * UNITS.massPerKg;
      const conversionMassKg = Math.max(0, spec.conversionMassKg || 0);
      const conversionMass = conversionMassKg * UNITS.massPerKg;
      const conversionUnit = { x: w * (spec.conversionPosition ?? -.28), y: h * .24, width: w * .24, height: h * .20 };
      const axleOffset = w * (style.axleOffset || 0);
      const balance = estimatedFactoryBalance(style.id, spec);
      const referenceMass = spec.curbMassKg * UNITS.massPerKg;
      const referencePowertrainMass = powertrainMassFor(spec, 1, 1) * UNITS.massPerKg;
      const referenceComX = axleOffset + w * genome.wheelBase * (balance.front - .5);
      // Body panels are not a uniformly filled silhouette. Use a separate
      // structural mass centroid to reproduce the estimated factory axle loads.
      const massShellCenter = {
        x: (referenceMass * referenceComX - referencePowertrainMass * w * balance.unit - referenceMass * .04 * axleOffset) / shellMass,
        y: shellCenter.y
      };
      const unit = { x: w * clamp(finite(genome.powertrainPosition, 0), -.38, .38), y: h * .26, width: w * .20, height: h * .12 };
      const chassisMass = shellMass + powertrainMass + conversionMass;
      const center = { x: (shellMass * massShellCenter.x + powertrainMass * unit.x + conversionMass * conversionUnit.x) / chassisMass,
        y: (shellMass * massShellCenter.y + powertrainMass * unit.y + conversionMass * conversionUnit.y) / chassisMass };
      const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      const shellInertia = M.Vertices.inertia(outline.map(p => ({ x: p.x - shellCenter.x, y: p.y - shellCenter.y })), shellMass);
      // Matter uses an inertia scale of 4 for polygon bodies; apply it to both
      // the distributed shell and the localized powertrain consistently.
      const inertia = 4 * (shellInertia + shellMass * distance2(massShellCenter, center)
        + powertrainMass * ((unit.width ** 2 + unit.height ** 2) / 12 + distance2(unit, center))
        + conversionMass * ((conversionUnit.width ** 2 + conversionUnit.height ** 2) / 12 + distance2(conversionUnit, center)));
      M.Body.setMass(body, chassisMass);
      M.Body.setCentre(body, { x: this.startX + center.x, y: y + center.y });
      M.Body.setInertia(body, inertia);
      // A one-ton flatbed uses smaller rear tires. Raise its front axle by the
      // radius difference so the load deck remains level on flat ground.
      const frontAxleRise = style.id === 'porter2' ? genome.frontRadius - genome.rearRadius : 0;
      const offsets = [
        { x: axleOffset - w * genome.wheelBase / 2 - center.x, y: h * genome.axleY - center.y },
        { x: axleOffset + w * genome.wheelBase / 2 - center.x, y: h * genome.axleY - center.y - frontAxleRise }
      ];
      const radii = [genome.rearRadius, genome.frontRadius];
      const wheels = offsets.map((offset, i) => M.Bodies.circle(body.position.x + offset.x, body.position.y + offset.y, radii[i], {
        density: 0.0018, friction: 0.95, frictionStatic: 1.3, frictionAir: 0.0005, restitution: 0,
        collisionFilter: filter, label: 'wheel-' + index + '-' + i
      }, 24));
      for (const wheel of wheels) M.Body.setMass(wheel, spec.curbMassKg * .02 * UNITS.massPerKg);
      const joints = wheels.map((wheel, i) => M.Constraint.create({ bodyA: body, pointA: offsets[i], bodyB: wheel, length: 0, stiffness: 0.9, damping: 0.06 }));
      M.Composite.add(this.engine.world, [body, ...wheels, ...joints]);
      const wheelMass = wheels.reduce((sum, wheel) => sum + wheel.mass, 0), totalMass = chassisMass + wheelMass;
      const centerOfMass = { x: wheels.reduce((sum, wheel, i) => sum + wheel.mass * offsets[i].x, 0) / totalMass,
        y: wheels.reduce((sum, wheel, i) => sum + wheel.mass * offsets[i].y, 0) / totalMass };
      const frontLoad = (centerOfMass.x - offsets[0].x) / (offsets[1].x - offsets[0].x);
      const peakPower = spec.powerPs * genome.powerMultiplier * UNITS.powerWattsPerPs * UNITS.efficiency * TORQUE_UNIT * UNITS.baseSeconds;
      const massKg = totalMass / UNITS.massPerKg;
      const powerPs = spec.powerPs * genome.powerMultiplier, torqueNm = spec.torqueNm * genome.torqueMultiplier;
      const powerToWeight = powerPs / massKg;
      // Appearance grading compares against this exact model at factory output.
      // It adds no thrust, downforce or scoring bonus.
      const referenceMassKg = (shellMass + wheelMass) / UNITS.massPerKg + powertrainMassFor(spec, 1, 1) + conversionMassKg;
      const referencePowerToWeight = spec.powerPs / referenceMassKg;
      const performanceRatio = powerToWeight / referencePowerToWeight;
      const motor = motorEnvelope(spec, genome.powerMultiplier, genome.torqueMultiplier, 0);
      const design = { style: style.id, styleLabel: style.label,
        driveType: drivetrain.id, driveLabel: drivetrain.label, driveShares: [...drivetrain.shares],
        outline: outline.map(p => ({ x: p.x - center.x, y: p.y - center.y })),
        shellCenterOfMass: { x: massShellCenter.x - center.x, y: massShellCenter.y - center.y },
        estimatedFactoryFrontLoad: balance.front,
        frame: { x: -center.x, y: -center.y }, rearAxle: { ...offsets[0] }, frontAxle: { ...offsets[1] },
        powerUnit: { ...unit, x: unit.x - center.x, y: unit.y - center.y }, shellMass, powertrainMass, wheelMass,
        totalMass, peakPower, massKg, curbMassKg: spec.curbMassKg, stockMassKg: spec.curbMassKg, powerPs, torqueNm,
        conversionMassKg, comparisonBallastKg,
        conversionUnit: { ...conversionUnit, x: conversionUnit.x - center.x, y: conversionUnit.y - center.y },
        gearRatio: genome.gearRatio, rpmLimitRpm: motor.redlineRpm, torquePowerCrossoverRpm: motor.crossoverRpm,
        achievablePowerPs: motorEnvelope(spec, genome.powerMultiplier, genome.torqueMultiplier, motor.redlineRpm * .95).powerPs,
        factoryPowerPs: spec.powerPs, factoryTorqueNm: spec.torqueNm, factoryDrive: spec.factoryDrive,
        lengthMm: spec.lengthMm, heightMm: spec.heightMm, wheelbaseMm: spec.wheelbaseMm,
        powerToWeight, referencePowerToWeight, performanceRatio, rearLoad: 1 - frontLoad, frontLoad, centerOfMass };
      const telemetry = { speed: 0, speedKmH: 0, engineRpm: 0, wheelTorqueNm: 0, tractiveForceN: 0, deliveredPowerPs: 0, limitingFactor: 'torque', slip: [0, 0], contact: [false, false], load: [1 - frontLoad, frontLoad], surface: this.surfaceAt(this.startX).id, status: 'ready' };
      return { telemetry, finishTime: null, stopReason: null, _forwardSpeed: 0, _acceleration: 0, id: index + 1, genome: copy(genome), design, body, wheels, joints, score: 0, alive: true, finished: false, color: COLORS[index % COLORS.length], lastProgress: 0, _progressMark: 0 };
    }
    restartTrial() {
      if (this.engine) { M.Composite.clear(this.engine.world, false); M.Engine.clear(this.engine); }
      this.engine = M.Engine.create({ positionIterations: 8, velocityIterations: 8, constraintIterations: 4, enableSleeping: false });
      this.engine.gravity.y = 1;
      this.engine.gravity.scale = UNITS.gravity * UNITS.lengthPerMetre / 1e6;
      this.terrainBodies = [];
      for (let i = 1; i < this.terrainPoints.length; i++) {
        const a = this.terrainPoints[i - 1], b = this.terrainPoints[i];
        const points = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: 720 }, { x: a.x, y: 720 }];
        const center = M.Vertices.centre(points);
        this.terrainBodies.push(M.Bodies.fromVertices(center.x, center.y, [points], { isStatic: true, friction: 1, frictionStatic: 1.3, restitution: 0, collisionFilter: { group: 0, category: 1, mask: 2 } }));
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
    _stop(vehicle, reason = 'stopped') {
      vehicle.stopReason = reason;
      vehicle.telemetry.status = reason;
      vehicle.telemetry.speed = 0;
      vehicle.telemetry.speedKmH = 0;
      vehicle.telemetry.engineRpm = 0;
      vehicle.telemetry.wheelTorqueNm = 0;
      vehicle.telemetry.tractiveForceN = 0;
      vehicle.telemetry.deliveredPowerPs = 0;
      vehicle.telemetry.slip = [0, 0];
      vehicle.alive = false;
      for (const body of [vehicle.body, ...vehicle.wheels]) M.Body.setStatic(body, true);
    }
    _updateTyres(vehicle) {
      if (!vehicle.alive) return;
      const t = vehicle.telemetry, totalWeight = vehicle.design.totalMass * this.engine.gravity.scale;
      const contacts = this.engine.pairs.list.filter(pair => pair.isActive);
      const deltaSpeed = vehicle.body.velocity.x - vehicle._forwardSpeed;
      vehicle._acceleration = .85 * vehicle._acceleration + .15 * deltaSpeed / (1000 / 120 * 1000 / 60);
      vehicle._forwardSpeed = vehicle.body.velocity.x;
      // Approximate normal loads from the current support line, COM, grade
      // and longitudinal acceleration. These loads set the tire force limits;
      // Matter retains normal collisions, body inertia and axle constraints.
      const rear = vehicle.wheels[0], front = vehicle.wheels[1];
      const slope = Math.atan((this.groundAt(front.position.x) - this.groundAt(rear.position.x)) / (front.position.x - rear.position.x || 1));
      const cos = Math.cos(slope), sin = Math.sin(slope);
      const cg = vehicle.design.centerOfMass, angle = vehicle.body.angle;
      const cgWorld = { x: vehicle.body.position.x + cg.x * Math.cos(angle) - cg.y * Math.sin(angle), y: vehicle.body.position.y + cg.x * Math.sin(angle) + cg.y * Math.cos(angle) };
      const wheelbase = Math.max(1, (front.position.x - rear.position.x) * cos + (front.position.y - rear.position.y) * sin);
      const height = Math.max(0, (rear.position.y - cgWorld.y) * cos - (rear.position.x - cgWorld.x) * sin + vehicle.genome.rearRadius);
      const along = (cgWorld.x - rear.position.x) * cos + (cgWorld.y - rear.position.y) * sin;
      let frontFraction = clamp((along + height * Math.tan(slope) - height * vehicle._acceleration / this.engine.gravity.scale) / wheelbase, 0, 1);
      for (let i = 0; i < 2; i++) {
        const wheel = vehicle.wheels[i];
        t.contact[i] = contacts.some(pair => pair.bodyA === wheel && pair.bodyB.isStatic || pair.bodyB === wheel && pair.bodyA.isStatic);
      }
      if (t.contact[0] && !t.contact[1]) frontFraction = 0;
      if (t.contact[1] && !t.contact[0]) frontFraction = 1;
      t.load = t.contact.some(Boolean) ? [1 - frontFraction, frontFraction] : [0, 0];
      t.speed = vehicle.body.velocity.x * 60;
      t.speedKmH = t.speed / UNITS.lengthPerMetre * 3.6;
      t.surface = this.surfaceAt(vehicle.body.position.x).id;
      t.status = t.contact.some(Boolean) ? 'driving' : (this.time > .2 ? 'airborne' : 'ready');
      for (let i = 0; i < 2; i++) {
        const wheel = vehicle.wheels[i], radius = i === 0 ? vehicle.genome.rearRadius : vehicle.genome.frontRadius;
        const surface = this.surfaceAt(wheel.position.x);
        wheel.friction = 0; // Longitudinal tire force is solved jointly with the motor below.
        const groundSpeed = wheel.velocity.x * cos + wheel.velocity.y * sin;
        const treadSpeed = wheel.angularVelocity * radius;
        t.slip[i] = t.contact[i] ? clamp((treadSpeed - groundSpeed) / Math.max(.3, Math.abs(treadSpeed), Math.abs(groundSpeed)), -1, 1) : 0;
        // Rolling resistance is a material force moment, not a speed penalty.
        // The larger sand coefficient represents energy spent deforming ground.
        if (t.contact[i]) wheel.torque -= surface.rollingResistance * totalWeight * cos * t.load[i] * radius * Math.tanh(wheel.angularVelocity / .025);
      }
    }
    _applyDrive(vehicle) {
      if (!vehicle.alive) return;
      const spec = VEHICLE_SPECS[vehicle.design.style], genome = vehicle.genome;
      const reduction = genome.gearRatio;
      const step = (1000 / 120) * (1000 / 60), t = vehicle.telemetry;
      const forceUnit = UNITS.massPerKg * UNITS.lengthPerMetre / 1e6;
      let reaction = 0;
      t.engineRpm = 0; t.wheelTorqueNm = 0; t.tractiveForceN = 0; t.deliveredPowerPs = 0; t.limitingFactor = 'torque';
      for (let i = 0; i < vehicle.wheels.length; i++) {
        const wheel = vehicle.wheels[i], share = vehicle.design.driveShares[i];
        const radius = i === 0 ? genome.rearRadius : genome.frontRadius;
        const relativeSpeed = wheel.angularVelocity - vehicle.body.angularVelocity;
        const invI = wheel.inverseInertia, maximum = 2 * genome.motorTorque * share;
        const slope = Math.atan2(this.groundAt(wheel.position.x + 2) - this.groundAt(wheel.position.x - 2), 4);
        const tangent = { x: Math.cos(slope), y: Math.sin(slope) };
        const surface = this.surfaceAt(wheel.position.x);
        const capacity = t.contact[i] ? surface.grip * vehicle.design.totalMass * this.engine.gravity.scale * tangent.x * t.load[i] : 0;
        const groundSpeed = wheel.velocity.x * tangent.x + wheel.velocity.y * tangent.y;
        const slipSpeed = wheel.angularVelocity * radius - groundSpeed;
        const supportedMass = Math.max(wheel.mass, vehicle.design.totalMass * t.load[i]);
        const denominator = step * (radius * radius * invI + 1 / supportedMass);
        const rawForce = torque => t.contact[i]
          ? (slipSpeed + step * radius * (torque + wheel.torque) * invI) / denominator : 0;
        const roadForce = torque => clamp(rawForce(torque), -capacity, capacity);
        const nextRelativeSpeed = torque => relativeSpeed + step * (
          (torque + wheel.torque - roadForce(torque) * radius) * invI + torque * vehicle.body.inverseInertia);
        const rpmAt = torque => Math.max(0, nextRelativeSpeed(torque) / UNITS.baseSeconds * reduction * 30 / Math.PI);
        const requestedTorque = torque => motorEnvelope(spec, genome.powerMultiplier, genome.torqueMultiplier, rpmAt(torque)).torqueNm
          * reduction * UNITS.efficiency * TORQUE_UNIT * share;
        // Solve the monotone motor envelope and Coulomb tire force together.
        // This keeps a spinning airborne tire within the same RPM envelope and
        // prevents a high PS setting from adding torque in the launch plateau.
        let torque = 0;
        if (share) {
          if (requestedTorque(maximum) >= maximum - 1e-12) torque = maximum;
          else if (requestedTorque(0) > 0) {
            let low = 0, high = maximum;
            for (let iteration = 0; iteration < 20; iteration++) {
              const middle = (low + high) / 2;
              if (middle < requestedTorque(middle)) low = middle; else high = middle;
            }
            torque = (low + high) / 2;
          }
        }
        const force = roadForce(torque), rpm = rpmAt(torque), deliveredSpeed = nextRelativeSpeed(torque);
        const tractionLimited = Math.abs(rawForce(torque)) > capacity + 1e-9 && t.contact[i];
        if (t.contact[i]) M.Body.applyForce(wheel, { x: wheel.position.x - tangent.y * radius, y: wheel.position.y + tangent.x * radius },
          { x: tangent.x * force, y: tangent.y * force });
        wheel.torque += torque;
        reaction += torque;
        t.tractiveForceN += force / forceUnit;
        if (share) {
          const envelope = motorEnvelope(spec, genome.powerMultiplier, genome.torqueMultiplier, rpm);
          t.engineRpm += rpm * share;
          t.wheelTorqueNm += torque / TORQUE_UNIT;
          t.deliveredPowerPs += torque / TORQUE_UNIT * Math.max(0, deliveredSpeed) / UNITS.baseSeconds / UNITS.powerWattsPerPs;
          if (tractionLimited) t.limitingFactor = 'traction';
          else if (t.limitingFactor !== 'traction' && (envelope.limit === 'rpm' || t.limitingFactor !== 'rpm')) t.limitingFactor = envelope.limit;
        }
      }
      vehicle.body.torque -= reaction;
    }
    _tick() {
      const dt = 1 / 120;
      for (const vehicle of this.vehicles) { this._updateTyres(vehicle); this._applyDrive(vehicle); }
      M.Engine.update(this.engine, dt * 1000);
      this._ticks++;
      this.time = Math.min(this.duration, this._ticks * dt);
      for (const vehicle of this.vehicles) {
        if (!vehicle.alive) continue;
        const x = vehicle.body.position.x, y = vehicle.body.position.y;
        if (!Number.isFinite(x) || !Number.isFinite(y) || y > 650 || x < -200) { this._stop(vehicle, 'invalid'); continue; }
        const frame = vehicle.design.frame, angle = vehicle.body.angle;
        const frameX = x + frame.x * Math.cos(angle) - frame.y * Math.sin(angle);
        const distance = clamp(frameX - this.startX, 0, this.finishX - this.startX);
        if (distance > vehicle.score) {
          vehicle.score = distance;
          if (distance > vehicle._progressMark + .5) { vehicle.lastProgress = this.time; vehicle._progressMark = distance; }
        }
        if (frameX >= this.finishX) { vehicle.finished = true; vehicle.finishTime = this.time; this._stop(vehicle, 'finished'); }
        else if (Math.cos(angle) < -.35 && this.time - vehicle.lastProgress > 4) this._stop(vehicle, 'overturned');
        else if (this.time - vehicle.lastProgress > 12 && Math.abs(vehicle.telemetry.speed) < 6) this._stop(vehicle, 'stalled');
      }
      this.best = [...this.vehicles].sort(compareVehicles)[0];
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
      for (const vehicle of this.vehicles) if (vehicle.alive) this._stop(vehicle, 'timeout');
      const ranked = [...this.vehicles].sort(compareVehicles);
      const winner = ranked[0];
      this.best = winner;
      // A new car number does not improve an otherwise identical record.
      if (!this.champion || compareVehicles(winner, { ...this.champion, id: winner.id }) < 0) this.champion = { generation: this.generation, id: winner.id, genome: copy(winner.genome), score: winner.score, finished: winner.finished, finishTime: winner.finishTime };
      this.bestScore = this.champion.score;
      const record = { generation: this.generation, best: winner.score, average: this.vehicles.reduce((sum, vehicle) => sum + vehicle.score, 0) / this.population, champion: this.bestScore, finishers: this.vehicles.filter(vehicle => vehicle.finished).length, bestTime: winner.finishTime };
      const previous = this.history.findIndex(item => item.generation === this.generation);
      if (previous >= 0) this.history[previous] = record; else this.history.push(record);
    }
    _select(ranked) {
      let best = ranked[Math.floor(this._random() * ranked.length)];
      for (let i = 0; i < 2; i++) {
        const candidate = ranked[Math.floor(this._random() * ranked.length)];
        if (compareVehicles(candidate, best) < 0) best = candidate;
      }
      return best.genome;
    }
    nextGeneration() {
      if (!this.complete) return false;
      const ranked = [...this.vehicles].sort(compareVehicles);
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
        offspring.push(this._constrainGenome(child));
      }
      this.genomes = offspring;
      this.generation++;
      this.restartTrial();
      return true;
    }
  }
  EvolutionLab.motorEnvelope = motorEnvelope;
  EvolutionLab.UNITS = UNITS;
  EvolutionLab.SPECS = VEHICLE_SPECS;
  EvolutionLab.STYLES = Object.freeze(STYLES.map(({ id, label }) => Object.freeze({ id, label })));
  EvolutionLab.SURFACES = SURFACES;
  EvolutionLab.compareVehicles = compareVehicles;
  root.EvolutionLab = EvolutionLab;
  if (typeof module !== 'undefined' && module.exports) module.exports = EvolutionLab;
})(typeof window !== 'undefined' ? window : globalThis);
