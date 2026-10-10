const assert = require("node:assert/strict");
globalThis.KalmanLab = require("../web/model.js");
globalThis.FilterComparison = require("../web/filters.js");
const Live = require("../web/live-model.js");
const p = {
  dt: 0.02,
  processStd: 0,
  sensorStd: 0.01,
  pHeight: 0,
  pVelocity: 0,
  gravity: 0,
  height: 0,
  amplitude: 0,
  damping: 0.1,
};
const known = new Live(p),
  disturbance = new Live(p);
known.applyForce([1, 0], 20, 1, true);
disturbance.applyForce([1, 0], 20, 1, false);
for (let i = 0; i < 50; i++) {
  const a = known.step(),
    b = disturbance.step();
  assert.deepEqual(a.truth, b.truth);
  assert.ok(Math.abs(a.truth[0] - a.posterior[0]) < 1e-9);
}
assert.ok(
  Math.abs(
    disturbance.history.at(-1).truth[0] -
      disturbance.history.at(-1).posterior[0],
  ) > 5,
);
assert.equal(known.step().applied[0], 0, "force expires in simulation time");
const periodic = new Live(),
  replica = new Live();
for (let i = 0; i < 3000; i++) {
  const a = periodic.step(),
    b = replica.step();
  assert.deepEqual(a, b);
  assert.ok(a.truth.every(Number.isFinite));
  assert.ok(Math.abs(a.truth[0]) < 100);
  for (const axis of a.axisPost) {
    const P = axis.P;
    assert.ok(P[0] >= 0 && P[3] >= 0 && P[0] * P[3] - P[1] * P[2] > -1e-9);
  }
}
assert.ok(periodic.history.length <= 402, "history bounded to eight seconds");
// The slider limits keep the Euler controller stable at the largest timestep.
for (const damping of [0.5, 8]) {
  const extreme = new Live({
    dt: 0.1,
    period: 4,
    damping,
    amplitude: 40,
    gravity: 30,
  });
  for (let i = 0; i < 3000; i++) {
    const row = extreme.step();
    assert.ok(row.truth.every(Number.isFinite));
    assert.ok(Math.abs(row.truth[0]) < 1000);
    assert.ok(Math.abs(row.truth[1] - extreme.origin[1]) < 1000);
  }
}
console.log(
  "Live model: force direction, known/disturbance distinction, force expiry, periodic stability, covariance and repeatability passed",
);
