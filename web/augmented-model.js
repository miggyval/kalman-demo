/* Per-axis [position, velocity, unknown force] KF using forward Euler.
   Force random-walk intensity has units N/sqrt(s). */
(function (root) {
  const defaults = { forceDrift: 10, forceInitialStd: 30 };
  const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const multiply = (A, B) =>
    A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  function step(
    x,
    P,
    measurement,
    dt,
    mass,
    knownAcceleration,
    processStd,
    sensorStd,
    forceDrift,
  ) {
    const A = [
      [1, dt, 0],
      [0, 1, dt / mass],
      [0, 0, 1],
    ];
    const priorX = [
      x[0] + dt * x[1],
      x[1] + dt * (knownAcceleration + x[2] / mass),
      x[2],
    ];
    const priorP = multiply(multiply(A, P), transpose(A));
    priorP[1][1] += dt * dt * processStd * processStd;
    priorP[2][2] += dt * forceDrift * forceDrift;
    const prior = { x: priorX, P: priorP };
    if (measurement === null)
      return {
        prior,
        x: priorX.slice(),
        P: priorP.map((r) => r.slice()),
        K: null,
        residual: null,
        S: null,
      };
    const residual = measurement - priorX[0],
      R = sensorStd * sensorStd,
      S = priorP[0][0] + R,
      K = priorP.map((r) => r[0] / S);
    const postX = priorX.map((v, i) => v + K[i] * residual);
    const M = K.map((v, i) => [
      Number(i === 0) - v,
      Number(i === 1),
      Number(i === 2),
    ]);
    const postP = multiply(multiply(M, priorP), transpose(M));
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) postP[i][j] += K[i] * R * K[j];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < i; j++)
        postP[i][j] = postP[j][i] = (postP[i][j] + postP[j][i]) / 2;
    return { prior, x: postX, P: postP, K, residual, S };
  }
  class ForceEstimator {
    constructor(estimates, covariances, p = {}) {
      this.axes = estimates.map((x, j) => ({
        x: [...x, 0],
        P: [
          [covariances[j][0], covariances[j][1], 0],
          [covariances[j][2], covariances[j][3], 0],
          [0, 0, (p.forceInitialStd ?? defaults.forceInitialStd) ** 2],
        ],
      }));
    }
    step(measurements, knownAcceleration, p) {
      this.axes = this.axes.map((a, j) =>
        step(
          a.x,
          a.P,
          measurements[j],
          p.dt,
          p.mass,
          knownAcceleration[j],
          p.matched === false ? p.assumedProcess : p.processStd,
          p.matched === false ? p.assumedSensor : p.sensorStd,
          p.forceDrift,
        ),
      );
      return {
        position: this.axes.map((a) => a.x[0]),
        state: [
          ...this.axes.map((a) => a.x[0]),
          ...this.axes.map((a) => a.x[1]),
          ...this.axes.map((a) => a.x[2]),
        ],
        force: this.axes.map((a) => a.x[2]),
        sigma: this.axes.map((a) => Math.sqrt(Math.max(0, a.P[2][2]))),
        axes: this.axes,
      };
    }
  }
  root.AugmentedKF = { defaults, step, ForceEstimator };
  if (typeof module !== "undefined") module.exports = root.AugmentedKF;
})(typeof window !== "undefined" ? window : globalThis);
