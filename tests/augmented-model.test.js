const assert = require("node:assert/strict");
global.KalmanLab = require("../web/model");
global.FilterComparison = require("../web/filters");
global.AugmentedKF = require("../web/augmented-model");
global.WindModel = require("../web/wind.js");
const Live = require("../web/live-model");
const p = {
  processStd: 0,
  sensorStd: 0.01,
  height: 0,
  gravity: 0,
  amplitude: 0,
  mass: 2,
  estimateForce: true,
  forceDrift: 0,
};
for (const known of [false, true]) {
  const sim = new Live(p);
  sim.applyForce([1, 0], 12, 20, known);
  for (let i = 0; i < 500; i++) sim.step();
  const f = sim.history.at(-1).augmented.force;
  assert.ok(
    Math.abs(f[0] - (known ? 0 : 12)) < 0.01,
    "identify constant force without counting known inputs",
  );
  assert.ok(Math.abs(f[1]) < 0.01);
}
const on = new Live({ ...p, processStd: 2, sensorStd: 3, forceDrift: 10 }),
  off = new Live({ ...p, processStd: 2, sensorStd: 3, estimateForce: false });
for (const sim of [on, off]) sim.applyForce([1, 1], 30, 3, false);
for (let i = 0; i < 1000; i++) {
  const a = on.step(),
    b = off.step();
  assert.deepEqual(a.truth, b.truth);
  assert.deepEqual(a.y, b.y);
  assert.deepEqual(a.posterior, b.posterior);
  for (const axis of a.augmented.axes) {
    const P = axis.P;
    assert.ok(axis.x.every(Number.isFinite));
    for (let j = 0; j < 3; j++) {
      assert.ok(P[j][j] >= 0);
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(P[j][k] - P[k][j]) < 1e-9);
        assert.ok(P[j][j] * P[k][k] - P[j][k] ** 2 >= -1e-8);
      }
    }
    const det =
      P[0][0] * (P[1][1] * P[2][2] - P[1][2] ** 2) -
      P[0][1] * (P[0][1] * P[2][2] - P[1][2] * P[0][2]) +
      P[0][2] * (P[0][1] * P[1][2] - P[1][1] * P[0][2]);
    assert.ok(det >= -1e-8);
  }
}
const saved = JSON.stringify(on.history.at(-1).augmented);
on.step();
assert.equal(JSON.stringify(on.history.at(-2).augmented), saved);
const gap = AugmentedKF.step(
  [1, 2, 6],
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 4],
  ],
  null,
  0.1,
  2,
  1,
  0,
  1,
  3,
);
assert.deepEqual(gap.x, [1.2, 2.4, 6]);
assert.equal(gap.K, null);
assert.equal(gap.P[2][2], 4.9);
assert.deepEqual(gap.P, gap.prior.P);
console.log(
  "Augmented KF: force identification, known inputs, unchanged simulation, missing measurements and covariance stability passed",
);
