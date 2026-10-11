const assert = require("node:assert/strict");
const W = require("../web/wind");
const p = {
  ...W.defaults,
  windEnabled: true,
  windTurbulence: false,
  windMeanX: 0,
  windMeanY: 0,
};
for (const [id] of W.profiles) {
  assert.equal(W.response(id, -0.01, p), 0);
  assert.ok(Math.abs(W.response(id, 200, p) - 1) < 1e-12);
}
assert.equal(W.response("hard", 0, p), 1);
assert.equal(W.response("quintic", 0, p), 0);
assert.equal(W.response("quintic", p.windDuration, p), 1);
assert.equal(W.response("normalized", 0, p), 0);
assert.ok(W.response("tanh", 0, p) > 0, "original tanh onset jump retained");
for (const t of [0.01, 0.5, 2]) {
  const z = Math.tanh(p.windA * p.windC);
  assert.equal(
    W.response("normalized", t, p),
    (Math.tanh(p.windA * (t - p.windC)) + z) / (1 + z),
  );
}
assert.ok(
  Math.abs(W.response("first", p.windDuration, p) - 0.9502129316) < 1e-9,
);
assert.ok(
  Math.abs(W.response("second", p.windDuration, p) - 0.9502527526) < 1e-8,
);
const h = 1e-5;
for (const u of [0, 1]) {
  assert.ok(Math.abs((W.smooth(u + h) - W.smooth(u - h)) / (2 * h)) < 1e-7);
  assert.ok(
    Math.abs((W.smooth(u + h) - 2 * W.smooth(u) + W.smooth(u - h)) / h ** 2) <
      0.002,
  );
}
const pulse = { ...p, windMode: "pulse" };
assert.equal(W.shape(p.windStart - 1, pulse), 0);
assert.equal(W.shape(p.windStart + p.windDuration, pulse), 1);
assert.equal(W.shape(p.windStart + 2 * p.windDuration + p.windHold, pulse), 0);
for (const [id] of W.profiles)
  assert.ok(Math.abs(W.shape(200, { ...pulse, windProfile: id })) < 1e-12);
const negative = new W.Generator({ ...p, windAngle: -90, windAmplitude: 10 });
assert.ok(Math.abs(negative.sample(10).force[0]) < 1e-10);
assert.equal(negative.sample(10).force[1], -10);
assert.deepEqual(
  new W.Generator({ ...p, windAmplitude: 0 }).sample(10).force,
  [0, 0],
);
assert.deepEqual(
  new W.Generator({ ...p, windEnabled: false, windMeanX: 5 }).sample(10).force,
  [0, 0],
);
const noise = new W.Generator({ ...p, windTurbulence: true, windAmplitude: 0 });
const times = [-0.1, 0, 0.23, 1.7, 8.11];
const a = times.map((t) => noise.sample(t));
assert.deepEqual(
  times.map((t) => new W.Generator(noise.p).sample(t)),
  a,
);
assert.notEqual(a[2].turbulence[0], a[2].turbulence[1]);
assert.deepEqual(
  new W.Generator({ ...noise.p, windNoiseAmplitude: 0 }).sample(0.23)
    .turbulence,
  [0, 0],
);
assert.deepEqual(
  new W.Generator({ ...noise.p, windTurbulence: false }).sample(0.23)
    .turbulence,
  [0, 0],
);
for (const seed of [12, 325])
  for (const x of [0, 1, 2])
    assert.ok(
      Math.abs(W.noise(x - h, seed) - W.noise(x + h, seed)) < 1e-3,
      "continuous gradients at integer boundaries",
    );
global.WindModel = W;
global.KalmanLab = require("../web/model");
global.FilterComparison = require("../web/filters");
global.AugmentedKF = require("../web/augmented-model");
const Live = require("../web/live-model");
const physical = {
  ...p,
  windProfile: "hard",
  windStart: 0,
  windAmplitude: 12,
  windAngle: 0,
  mass: 2,
  dt: 0.02,
  gravity: 0,
  amplitude: 0,
  damping: 0,
  height: 0,
  processStd: 0,
  sensorStd: 0.01,
};
const sim = new Live(physical);
const first = sim.step();
assert.equal(first.truth[2], 0.12);
assert.equal(first.prior[2], 0, "wind is not a known KF input");
assert.deepEqual(first.wind.force, sim.wind.sample(first.windTime).force);
assert.deepEqual(first.disturbanceForce, [12, 0]);
const normal = new Live(physical),
  aug = new Live({ ...physical, estimateForce: true, forceDrift: 0 }),
  repeat = new Live({ ...physical, estimateForce: true, forceDrift: 0 });
for (let i = 0; i < 500; i++) {
  const a = normal.step(),
    b = aug.step(),
    c = repeat.step();
  assert.deepEqual(a.truth, b.truth);
  assert.deepEqual(a.y, b.y);
  assert.deepEqual(a.posterior, b.posterior);
  assert.deepEqual(b, c);
  assert.deepEqual(b.wind.force, aug.wind.sample(b.windTime).force);
}
assert.ok(Math.abs(aug.history.at(-1).augmented.force[0] - 12) < 0.01);
const damping = new Live({
  ...physical,
  windEnabled: false,
  damping: 2,
  velocity: 3,
});
assert.ok(
  Math.abs(damping.step().truth[3] - 2.88) < 1e-10,
  "damping occurs once",
);
console.log(
  "Wind: six profiles, pulse, quintic smoothness, normalised tanh, negative directions, deterministic Perlin, dynamics, damping and augmented comparison passed",
);

const repeated = { ...pulse, windRepeat: true, windInterval: 10 };
for (const t of [2, 3, 4, 6, 7, 8, 9]) {
  assert.ok(Math.abs(W.shape(t, repeated) - W.shape(t + 10, repeated)) < 1e-12);
}
assert.equal(W.shape(1000002, repeated), 0);
assert.equal(W.shape(1000004, repeated), 1);
const close = { ...repeated, windInterval: 1 };
assert.equal(W.shape(9, close), 0.5); // minimum period = 2T + H = 6 s
const triggered = new W.Generator(repeated);
const before = triggered.sample(5);
triggered.trigger(12);
assert.deepEqual(triggered.sample(5), before);
assert.equal(triggered.sample(12).shape, 0);
assert.equal(triggered.sample(14).shape, 1);
assert.equal(triggered.sample(24).shape, 1);
console.log(
  "Periodic gusts, minimum interval, long-run sampling and trigger history passed",
);
