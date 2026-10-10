const assert = require("node:assert/strict");
const { Camera, quintic } = require("../web/camera");
const c = new Camera();
for (const t of [0, 0.5, 1, 2])
  assert.deepEqual(
    c.update([5, 0], 10, 10, t, 0.75),
    [0, 0],
    "centre stays put inside dead zone",
  );
c.update([8, 0], 10, 10, 3, 0.75);
assert.deepEqual(c.update([8, 0], 10, 10, 3.5, 0.75), [0, 0]);
c.update([8, 0], 10, 10, 3.75, 0.75, 2);
assert.deepEqual(c.center, [0, 0]);
assert.deepEqual(c.update([8, 0], 10, 10, 4.75, 0.75, 2), [4, 0]);
assert.deepEqual(c.update([8, 0], 10, 10, 5.75, 0.75, 2), [8, 0]);
assert.equal(c.move, null);
assert.equal(quintic(0), 0);
assert.equal(quintic(1), 1);
const h = 1e-5;
for (const u of [0, 1]) {
  assert.ok(Math.abs((quintic(u + h) - quintic(u - h)) / (2 * h)) < 1e-7);
  assert.ok(
    Math.abs((quintic(u + h) - 2 * quintic(u) + quintic(u - h)) / h ** 2) <
      0.002,
  );
}
const dense = new Camera(),
  sparse = new Camera();
for (const x of [dense, sparse]) {
  x.update([8, 0], 10, 10, 0, 0, 2);
}
for (let t = 0.1; t < 1; t += 0.1) dense.update([8, 0], 10, 10, t, 0, 2);
assert.deepEqual(
  dense.update([8, 0], 10, 10, 1, 0, 2),
  sparse.update([8, 0], 10, 10, 1, 0, 2),
  "interpolation independent of render frequency",
);
const paused = dense.center.slice();
assert.deepEqual(dense.update([8, 0], 10, 10, 1, 0, 2), paused);
dense.update([8, 0], 10, 10, 0.5, 0, 2);
assert.equal(dense.move, null, "rewinding cancels a future move");
console.log(
  "Camera: fixed scale, edge dead zone, delayed quintic interpolation, C2 endpoints, pause and frame independence passed",
);
