const assert = require("node:assert/strict");
const Lab = require("../web/model.js");
const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const sim = Lab.generate(),
  same = Lab.generate();
assert.deepEqual(sim, same);
const d = sim.parameters.dt;
for (const row of sim.rows) {
  close(row.truth[0], row.previous.truth[0] + d * row.previous.truth[1]);
  close(
    row.truth[1],
    row.previous.truth[1] - d * sim.parameters.gravity + d * row.w,
  );
  const { prior, posterior } = row;
  close(prior.x[0], row.previous.x[0] + d * row.previous.x[1]);
  close(prior.x[1], row.previous.x[1] - d * sim.parameters.gravity);
  close(prior.P[3], row.previous.P[3] + d * d * sim.parameters.processStd ** 2);
  close(posterior.residual, row.y - prior.x[0]);
  close(posterior.S, prior.P[0] + sim.parameters.sensorStd ** 2);
  close(posterior.K[0], prior.P[0] / posterior.S);
  close(posterior.K[1], prior.P[2] / posterior.S);
  for (const P of [prior.P, posterior.P]) {
    close(P[1], P[2]);
    assert.ok(P[0] >= 0 && P[3] >= 0 && P[0] * P[3] - P[1] * P[2] >= -1e-9);
    const { eigenvalues: e, eigenvectors: v } = Lab.ellipse(P);
    close(v[0][0] ** 2 * e[0] + v[1][0] ** 2 * e[1], P[0]);
    close(v[0][0] * v[0][1] * e[0] + v[1][0] * v[1][1] * e[1], P[1]);
    close(v[0][1] ** 2 * e[0] + v[1][1] ** 2 * e[1], P[3]);
    // Eigenvector endpoints have squared Mahalanobis distance one.
    if (P[0] * P[3] - P[1] * P[2] > 1e-12) {
      const a = Math.sqrt(e[0]) * v[0][0],
        b = Math.sqrt(e[0]) * v[0][1];
      close(
        (P[3] * a * a - 2 * P[1] * a * b + P[0] * b * b) /
          (P[0] * P[3] - P[1] * P[2]),
        1,
      );
    }
  }
  // Joseph result agrees with the exact analytic scalar-measurement update.
  close(posterior.P[0], prior.P[0] - prior.P[0] ** 2 / posterior.S);
  close(posterior.P[3], prior.P[3] - prior.P[2] ** 2 / posterior.S);
}
for (let phase = 0; phase < 50; phase++) {
  const row = sim.rows[Math.floor(phase / 2)],
    f = Lab.frame(sim, phase, 1);
  assert.deepEqual(f.x, phase % 2 ? row.posterior.x : row.prior.x);
  assert.deepEqual(f.P, phase % 2 ? row.posterior.P : row.prior.P);
  const snapshot = Lab.frame(sim, phase, 0.5);
  if (phase < 49) Lab.frame(sim, phase + 1, 1);
  assert.deepEqual(Lab.frame(sim, phase, 0.5), snapshot);
}
const dropout = Lab.generate({ scenario: "dropout" });
for (const row of dropout.rows.slice(10, 15)) {
  assert.equal(row.y, null);
  assert.deepEqual(row.prior.x, row.posterior.x);
  assert.deepEqual(row.prior.P, row.posterior.P);
}
assert.ok(dropout.rows[14].posterior.P[0] > dropout.rows[9].posterior.P[0]);
const outlier = Lab.generate({ outlierAt: 12 });
close(outlier.rows[11].y - sim.rows[11].y, 18);
assert.deepEqual(outlier.rows[12].truth, sim.rows[12].truth);
const deterministic = Lab.generate({
  processStd: 0,
  sensorStd: 0.01,
  pHeight: 0,
  pVelocity: 0,
});
for (const row of deterministic.rows)
  assert.deepEqual(row.posterior.P, [0, 0, 0, 0]);
const mismatch = Lab.generate({
  matched: false,
  assumedProcess: 1,
  assumedSensor: 10,
});
assert.deepEqual(mismatch.rows[0].truth, sim.rows[0].truth);
assert.notDeepEqual(mismatch.rows[0].posterior.P, sim.rows[0].posterior.P);
assert.throws(() => Lab.generate({ sensorStd: 0 }));
console.log(
  "Browser model: Euler dynamics, Q/R, Joseph covariance, eigen-ellipses, stored playback, gaps, outliers and mismatch passed",
);
