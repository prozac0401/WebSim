/*
 * Two independent, linear 2-D wave fields on a square lattice.
 * This is a scalar wave approximation, not a calibrated room-acoustics model.
 * Coordinates and wavelength are grid cells; time is one solver tick.
 */
(function (root) {
  'use strict';
  const NX = 120, NY = 80, C = 0.5, DRIVE = 0.15;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  class WaveField {
    constructor() {
      this.nx = NX;
      this.ny = NY;
      this.size = NX * NY;
      this._aPrev = new Float32Array(this.size);
      this._aNext = new Float32Array(this.size);
      this.a = new Float32Array(this.size);
      this._bPrev = new Float32Array(this.size);
      this._bNext = new Float32Array(this.size);
      this.b = new Float32Array(this.size);
      this._loss = new Float32Array(this.size);
      // Damping grows smoothly toward all outer edges. Internal walls reflect.
      for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX; x++) {
          const edge = Math.min(x, y, NX - 1 - x, NY - 1 - y);
          this._loss[y * NX + x] = 0.0015 + 0.12 * Math.pow(Math.max(0, 1 - edge / 20), 2);
        }
      }
      this.reset({});
    }
    _point(value, fallback) {
      return {
        x: Math.round(clamp(finite(value?.x, fallback.x), 0, NX - 1)),
        y: Math.round(clamp(finite(value?.y, fallback.y), 0, NY - 1))
      };
    }
    reset(config = {}) {
      const defaults = [{ x: 25, y: 25 }, { x: 25, y: 55 }];
      this.sources = defaults.map((point, i) => this._point(config.sources?.[i], point));
      this.target = this._point(config.target, { x: 91, y: 40 });
      this.phase = finite(config.phase, 0) * Math.PI / 180;
      this.wavelength = clamp(finite(config.wavelength, 18), 6, 80);
      this.enabledB = config.enabledB !== false;
      this.omega = 2 * Math.PI * C / this.wavelength;
      this.walls = new Uint8Array(this.size);
      if (config.walls?.length === this.size) this.walls.set(config.walls);
      for (const array of [this.a, this._aPrev, this._aNext, this.b, this._bPrev, this._bNext]) array.fill(0);
      this.ticks = 0;
      this._targetIndex = this.target.y * NX + this.target.x;
      this._sourceIndices = this.sources.map(point => point.y * NX + point.x);
      this._window = Math.ceil(4 * this.wavelength); // Two complete drive periods.
      this._sumHistory = new Float64Array(this._window);
      this._aHistory = new Float64Array(this._window);
      this._historyCount = 0;
      this._historyPosition = 0;
      this._sumSquares = 0;
      this._aSquares = 0;
      const distances = this._sourceIndices.map(index => this._pathDistance(index, this._targetIndex));
      // Manhattan shortest paths are a conservative travel-time estimate.
      const travel = this.enabledB && Number.isFinite(distances[1]) ? Math.max(...distances) : distances[0];
      this._settleTick = Number.isFinite(travel) ? Math.ceil(travel / C) + this._window : Infinity;
      return this;
    }
    _pathDistance(start, target) {
      if (this.walls[start] || this.walls[target]) return Infinity;
      const distances = new Int32Array(this.size);
      distances.fill(-1);
      const queue = new Int32Array(this.size);
      let head = 0, tail = 1;
      queue[0] = start;
      distances[start] = 0;
      while (head < tail) {
        const index = queue[head++];
        if (index === target) return distances[index];
        const x = index % NX;
        const neighbors = [index - NX, index + NX, x ? index - 1 : -1, x < NX - 1 ? index + 1 : -1];
        for (const next of neighbors) {
          if (next < 0 || next >= this.size || this.walls[next] || distances[next] !== -1) continue;
          distances[next] = distances[index] + 1;
          queue[tail++] = next;
        }
      }
      return Infinity;
    }
    _advance(previous, current, next, sourceIndex, phase) {
      const walls = this.walls;
      for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX; x++) {
          const index = y * NX + x;
          if (walls[index]) { next[index] = 0; continue; }
          const value = current[index];
          const left = x > 0 && !walls[index - 1] ? current[index - 1] : value;
          const right = x < NX - 1 && !walls[index + 1] ? current[index + 1] : value;
          const up = y > 0 && !walls[index - NX] ? current[index - NX] : value;
          const down = y < NY - 1 && !walls[index + NX] ? current[index + NX] : value;
          const loss = this._loss[index];
          next[index] = (2 * value - (1 - loss) * previous[index] + C * C * (left + right + up + down - 4 * value)) / (1 + loss);
        }
      }
      if (!walls[sourceIndex]) next[sourceIndex] += DRIVE * Math.cos(this.omega * this.ticks + phase);
    }
    step(count = 1) {
      const iterations = clamp(Math.floor(finite(count, 1)), 0, 10000);
      for (let i = 0; i < iterations; i++) {
        this._advance(this._aPrev, this.a, this._aNext, this._sourceIndices[0], 0);
        const oldA = this._aPrev;
        this._aPrev = this.a;
        this.a = this._aNext;
        this._aNext = oldA;
        if (this.enabledB) {
          this._advance(this._bPrev, this.b, this._bNext, this._sourceIndices[1], this.phase);
          const oldB = this._bPrev;
          this._bPrev = this.b;
          this.b = this._bNext;
          this._bNext = oldB;
        }
        this.ticks++;
        const a = this.a[this._targetIndex];
        const sum = a + this.b[this._targetIndex];
        const position = this._historyPosition;
        this._sumSquares += sum * sum - this._sumHistory[position];
        this._aSquares += a * a - this._aHistory[position];
        this._sumHistory[position] = sum * sum;
        this._aHistory[position] = a * a;
        this._historyPosition = (position + 1) % this._window;
        this._historyCount = Math.min(this._window, this._historyCount + 1);
      }
      return this;
    }
    sample() {
      const count = Math.max(1, this._historyCount);
      const amplitude = Math.sqrt(Math.max(0, this._sumSquares) / count);
      const baseline = Math.sqrt(Math.max(0, this._aSquares) / count);
      const hasBaseline = baseline > 0.00001;
      return {
        amplitude,
        baseline,
        ratio: hasBaseline ? amplitude / baseline : 1,
        settled: this.ticks >= this._settleTick && this._historyCount === this._window && hasBaseline
      };
    }
  }
  root.WaveField = WaveField;
  if (typeof module !== 'undefined' && module.exports) module.exports = WaveField;
})(typeof window !== 'undefined' ? window : globalThis);
