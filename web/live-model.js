/* Four-state 2D live motion. Independent [position, velocity] axis filters.
   Forward Euler A, B = G = [0, dt]^T; acceleration disturbances enter velocity. */
(function (root) {
  class LiveSimulation {
    constructor(parameters = {}) {
      this.p = {
        ...KalmanLab.defaults,
        dt: 0.02,
        amplitude: 20,
        period: 6,
        damping: 2,
        mass: 1,
        ...parameters,
      };
      this.random = KalmanLab.generator(7);
      this.time = 0;
      this.k = 0;
      this.origin = [0, this.p.height];
      this.truth = [0, this.p.height, 0, this.p.velocity];
      this.estimates = [
        [0, 0],
        [this.p.height, this.p.velocity],
      ];
      this.covariances = Array.from({ length: 2 }, () => [
        this.p.pHeight,
        0,
        0,
        this.p.pVelocity,
      ]);
      this.comparison = new FilterComparison.ComparisonFilters(
        this.estimates,
        this.p,
      );
      this.forces = [];
      this.history = [];
      this.iir = this.truth.slice(0, 2);
      this.samples = [];
    }
    normal() {
      return (
        Math.sqrt(-2 * Math.log(this.random())) *
        Math.cos(2 * Math.PI * this.random())
      );
    }
    applyForce(direction, strength, duration, known) {
      const norm = Math.hypot(...direction);
      if (norm < 1e-9) return;
      this.forces.push({
        vector: direction.map((v) => (strength * v) / norm),
        until: this.time + duration,
        known,
      });
    }
    step() {
      const p = this.p,
        d = p.dt,
        omega = (2 * Math.PI) / p.period;
      const target = [
        this.origin[0] + p.amplitude * Math.sin(omega * this.time),
        this.origin[1] + p.amplitude * 0.7 * Math.sin(omega * this.time * 1.3),
      ];
      const control = [
        omega ** 2 * (target[0] - this.truth[0]) - p.damping * this.truth[2],
        omega ** 2 * (target[1] - this.truth[1]) -
          p.damping * this.truth[3] -
          p.gravity,
      ];
      const applied = [0, 0],
        known = [0, 0];
      this.forces = this.forces.filter((f) => f.until > this.time + 1e-10);
      for (const force of this.forces)
        for (let j = 0; j < 2; j++) {
          applied[j] += force.vector[j] / p.mass;
          if (force.known) known[j] += force.vector[j] / p.mass;
        }
      const prior = [],
        posterior = [],
        observations = [];
      const missing =
        p.scenario === "dropout" && this.time % 8 >= 4 && this.time % 8 < 6;
      for (let j = 0; j < 2; j++) {
        const previous = [this.truth[j], this.truth[j + 2]],
          a = control[j] + applied[j] + p.processStd * this.normal();
        this.truth[j] = previous[0] + d * previous[1];
        this.truth[j + 2] = previous[1] + d * a;
        const raw = this.truth[j] + p.sensorStd * this.normal();
        const spike =
          this.outlier ||
          (p.scenario === "outlier" && this.time > 0 && this.time % 8 < d);
        const y = missing
          ? null
          : raw + (spike ? Math.max(10, 6 * p.sensorStd) : 0);
        const filter = {
          ...p,
          gravity: -(control[j] + known[j]),
          processStd: p.matched === false ? p.assumedProcess : p.processStd,
          sensorStd: p.matched === false ? p.assumedSensor : p.sensorStd,
        };
        const prediction = KalmanLab.predict(
          this.estimates[j],
          this.covariances[j],
          filter,
        );
        const update =
          y === null
            ? {
                x: prediction.x.slice(),
                P: prediction.P.slice(),
                residual: null,
                S: null,
                K: null,
              }
            : KalmanLab.update(prediction, y, filter);
        prior.push(prediction);
        posterior.push(update);
        observations.push(y);
        this.estimates[j] = update.x;
        this.covariances[j] = update.P;
      }
      if (!missing) {
        this.outlier = false;
        this.iir = this.iir.map((v, j) => 0.8 * v + 0.2 * observations[j]);
        this.samples.push(observations);
        if (this.samples.length > 20) this.samples.shift();
      }
      const sma = [0, 1].map((j) =>
        this.samples.length
          ? this.samples.reduce((s, z) => s + z[j], 0) / this.samples.length
          : this.truth[j],
      );
      const comparisons = this.comparison.step(
        observations,
        d,
        control.map((v, j) => v + known[j]),
      );
      this.time += d;
      this.k++;
      const state = (axes) => [
        axes[0].x[0],
        axes[1].x[0],
        axes[0].x[1],
        axes[1].x[1],
      ];
      const covariance = (axes) => {
        const a = axes[0].P,
          b = axes[1].P;
        return [
          a[0],
          0,
          a[1],
          0,
          0,
          b[0],
          0,
          b[1],
          a[2],
          0,
          a[3],
          0,
          0,
          b[2],
          0,
          b[3],
        ];
      };
      const row = {
        k: this.k,
        time: this.time,
        truth: this.truth.slice(),
        prior: state(prior),
        posterior: state(posterior),
        Pprior: covariance(prior),
        Ppost: covariance(posterior),
        y: observations,
        axisPrior: prior,
        axisPost: posterior,
        applied,
        known,
        control,
        mass: p.mass,
        dt: d,
        Q: (p.matched === false ? p.assumedProcess : p.processStd) ** 2,
        R: (p.matched === false ? p.assumedSensor : p.sensorStd) ** 2,
        missing,
        comparisons,
        iir: this.iir.slice(),
        sma,
      };
      this.history.push(row);
      while (this.history.length > 1 && this.history[0].time < this.time - 8)
        this.history.shift();
      return row;
    }
  }
  root.LiveSimulation = LiveSimulation;
  if (typeof module !== "undefined") module.exports = LiveSimulation;
})(typeof window !== "undefined" ? window : globalThis);
