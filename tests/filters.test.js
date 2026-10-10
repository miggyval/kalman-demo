const assert = require("node:assert/strict");
const {
  defaults,
  ComparisonFilters,
  firWeights,
  sections,
} = require("../web/filters.js");
const near = (a, b, t = 1e-10) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
// Predict/correct observer's characteristic polynomial equals (z-p1)(z-p2).
for (const dt of [0.01, 0.1, 1])
  for (const a of [0, 0.5, 0.99])
    for (const b of [0, 0.7, 0.99]) {
      const l0 = 1 - a * b,
        l1 = (1 + a * b - a - b) / dt;
      near(2 - l0 - dt * l1, a + b);
      near(1 - l0, a * b);
      const bank = new ComparisonFilters([[10, 3]], { pole1: a, pole2: b });
      let truth = [0, 0];
      for (let i = 0; i < 1000; i++) {
        truth = [truth[0] + dt * truth[1], truth[1] + dt * 0.2];
        bank.step([truth[0]], dt, [0.2]);
      }
      if (a < 0.99 && b < 0.99) {
        near(bank.axes[0].observer[0], truth[0], 1e-6);
        near(bank.axes[0].observer[1], truth[1], 1e-6);
      }
    }
for (const firType of ["mean", "triangular", "hann", "sinc"])
  for (const firOrder of [1, 2, 10, 60]) {
    const w = firWeights({ ...defaults, firType, firOrder });
    near(
      w.reduce((a, b) => a + b, 0),
      1,
    );
    assert.equal(w.length, firOrder + 1);
    w.forEach((v, i) => near(v, w.at(-i - 1)));
    const bank = new ComparisonFilters([[5, 0]], { firType, firOrder });
    for (let i = 0; i < 100; i++) near(bank.step([5], 0.02, [0]).fir[0][0], 5);
  }
const mean = new ComparisonFilters([[0, 0]], { firOrder: 2 });
near(mean.step([3], 0.1, [0]).fir[0][0], 3);
near(mean.step([6], 0.1, [0]).fir[0][0], 4);
near(mean.step([9], 0.1, [0]).fir[0][0], 6);
// Every Butterworth order has unity DC gain and -3 dB at the chosen cutoff.
function gain(stages, omega) {
  return stages.reduce((h, s) => {
    const magnitude = (v) =>
      Math.hypot(
        v[0] + v[1] * Math.cos(omega) + v[2] * Math.cos(2 * omega),
        -v[1] * Math.sin(omega) - v[2] * Math.sin(2 * omega),
      );
    return (h * magnitude(s.b)) / magnitude(s.a);
  }, 1);
}
for (const iirOrder of [1, 2, 3, 4, 5, 6, 7, 8])
  for (const iirCutoff of [0.01, 0.15, 0.95]) {
    const s = sections({ ...defaults, iirOrder, iirCutoff });
    near(gain(s, 0), 1, 1e-8);
    near(gain(s, Math.PI * iirCutoff), Math.SQRT1_2, 1e-8);
    for (const iirType of ["butterworth", "exponential"]) {
      near(
        gain(
          sections({ ...defaults, iirOrder, iirCutoff, iirType }),
          Math.PI * iirCutoff,
        ),
        Math.SQRT1_2,
        1e-8,
      );
      const bank = new ComparisonFilters([[0, 0]], {
        iirOrder,
        iirCutoff,
        iirType,
      });
      for (let i = 0; i < 3000; i++)
        assert.ok(
          bank.step([i === 0 ? 1 : 0], 0.02, [0]).iir[0].every(Number.isFinite),
        );
      near(bank.axes[0].lastIir, 0, 1e-7);
    }
  }
const gap = new ComparisonFilters([[4, 2]]);
const before = gap.step([5], 0.1, [1]);
const after = gap.step([null], 0.1, [1]);
near(after.fir[0][0], before.fir[0][0]);
near(after.iir[0][0], before.iir[0][0]);
near(after.observer[0][0], before.observer[0][0] + 0.1 * before.observer[0][1]);
console.log(
  "Comparison filters: assigned poles, convergence, FIR taps/DC/causality, Butterworth cutoff gain, IIR stability and gaps passed",
);
// Complex-conjugate pole pairs give real gains and the requested characteristic polynomial.
const { observerPoles } = require("../web/filters.js");
for (const poleRadius of [0, 0.5, 0.99, 2])
  for (const poleAngle of [0, 30, 90, 150, 180]) {
    const p = { ...defaults, poleType: "complex", poleRadius, poleAngle };
    const { points, sum, product } = observerPoles(p),
      dt = 0.02;
    assert.ok(points.every((z) => Math.hypot(...z) <= 0.9900000001));
    near(points[0][0], points[1][0]);
    near(points[0][1], -points[1][1]);
    const l0 = 1 - product,
      l1 = (1 + product - sum) / dt;
    near(2 - l0 - dt * l1, sum);
    near(1 - l0, product);
    const bank = new ComparisonFilters([[5, 1]], p);
    for (let i = 0; i < 3000; i++)
      assert.ok(bank.step([0], dt, [0]).observer[0].every(Number.isFinite));
    near(bank.axes[0].observer[0], 0, 1e-6);
  }
assert.equal(
  observerPoles({ ...defaults, pole1: -2, pole2: 2 }).points[0][0],
  -0.99,
);
console.log(
  "Complex poles: conjugate symmetry, radius cap, real gains and stable convergence passed",
);
