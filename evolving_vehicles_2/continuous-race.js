/* Continuous viewing across generations, with independent, comparable GA
 * evaluations. Display cars may take a rolling start; fitness always comes
 * from a separate race that starts every entrant from rest. */
(function (root) {
  'use strict';
  const TrackRace = root.TrackRace || (typeof require === 'function' ? require('./race-engine.js') : null);
  const Evolution = root.TuningEvolution || (typeof require === 'function' ? require('./tuning-evolution.js') : null);
  if (!TrackRace || !Evolution) throw new Error('Load race-engine.js and tuning-evolution.js before continuous-race.js.');
  const DT = TrackRace.FIXED_DT;
  const EPSILON = 1e-12;

  class ContinuousRace {
    constructor({ circuit, entrants, seed = 1234, generation = 1, stockRun = 1, laps, surface } = {}) {
      if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer.');
      if (!Number.isInteger(generation) || generation < 1 || !Number.isInteger(stockRun) || stockRun < 1)
        throw new RangeError('generation and stockRun must be positive integers.');
      if (!Array.isArray(entrants) || !entrants.length) throw new TypeError('entrants must be a nonempty array.');
      this.population = entrants;
      this.seed = seed;
      this.generation = generation;
      this.stockRun = stockRun;
      this.options = { circuit, laps, surface };
      this.race = this._newRace(0);
      this.evaluationRace = this._newRace(0);
      this.evaluationResults = null;
      this.automaticBlocked = false;
    }

    _newRace(initialSpeed) {
      return new TrackRace({ ...this.options, entrants: this.population, initialSpeed });
    }

    _advanceEvaluation(seconds) {
      let remaining = seconds;
      while (remaining > EPSILON && !this.evaluationRace.finished) {
        const chunk = Math.min(remaining, 60);
        this.evaluationRace.step(chunk);
        remaining -= chunk;
      }
      if (this.evaluationRace.finished && !this.evaluationResults)
        this.evaluationResults = this.evaluationRace.standings();
    }

    completeEvaluation() {
      while (!this.evaluationRace.finished) this._advanceEvaluation(60);
      if (!this.evaluationResults) this.evaluationResults = this.evaluationRace.standings();
      return this.evaluationResults;
    }

    _watched(watchId) {
      return this.race.cars.find(car => car.id === watchId) || this.race.cars[0];
    }

    _transition(watched) {
      const previousRace = this.race, previousPopulation = this.population;
      const completedGeneration = this.generation, completedStockRun = this.stockRun;
      const results = this.completeEvaluation();
      if (!results.some(car => car.finished)) {
        this.automaticBlocked = true;
        return null;
      }
      const stock = this.population[0].budget === 0;
      if (stock) this.stockRun++;
      else {
        this.population = Evolution.breed(this.population, results, {
          seed: (this.seed + Math.imul(this.generation + 1, 104729)) >>> 0,
          generation: this.generation + 1
        });
        this.generation++;
      }
      const carrySpeed = Number.isFinite(watched.finishSpeed) ? watched.finishSpeed : watched.speed;
      this.race = this._newRace(carrySpeed);
      this.evaluationRace = this._newRace(0);
      this.evaluationResults = null;
      return { previousRace, previousPopulation, race: this.race, population: this.population,
        generation: this.generation, stockRun: this.stockRun, completedGeneration, completedStockRun,
        results, watchedId: watched.id, carrySpeed };
    }

    step(seconds, { watchId, auto = false } = {}) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('step duration must be finite and nonnegative.');
      const transitions = [];
      // Pausing must not complete an evaluation or trigger a pending transition.
      if (seconds === 0) return transitions;
      // Own the fractional input while stepping one physics tick at a time.
      // A watched finish can otherwise be hidden inside a large playback step.
      let remaining = seconds + this.race._accumulator;
      this.race._accumulator = 0;
      while (true) {
        const watched = this._watched(watchId);
        if (auto && !this.automaticBlocked && watched.finished && !watched.dnf) {
          const remainder = Math.max(0, Math.min(DT, watched.finishRemainderSeconds || 0));
          const transition = this._transition(watched);
          // The old tick only moved the watched car as far as the finish line.
          // Its unused fraction belongs to the next lap, not to lost time.
          if (transition) { transitions.push(transition); remaining += remainder; }
        }
        if (this.race.finished) break;
        if (remaining + EPSILON < DT) {
          this.race._accumulator = Math.max(0, remaining);
          break;
        }
        this.race.step(DT);
        remaining = Math.max(0, remaining - DT);
        this._advanceEvaluation(DT * 16);
      }
      return transitions;
    }
  }

  root.ContinuousRace = ContinuousRace;
  if (typeof module !== 'undefined' && module.exports) module.exports = ContinuousRace;
})(typeof window !== 'undefined' ? window : globalThis);
