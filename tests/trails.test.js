const assert = require("node:assert/strict");
const Trails = require("../web/trails");
const rows = Array.from({ length: 5 }, (_, time) => ({
  time,
  point: [time, 2 * time],
}));
const settings = {
  ...Trails.defaults,
  limitTrail: true,
  trailLength: 1.5,
  fadeTrail: true,
  trailHalfLife: 1,
  trailStyle: "dashdot",
  trailWidth: 3,
};
assert.deepEqual(Trails.clip(rows, 4, settings), [
  { time: 2.5, point: [2.5, 5] },
  rows[3],
  rows[4],
]);
assert.deepEqual(
  Trails.clip(rows, 2, { ...settings, limitTrail: false }),
  rows.slice(0, 3),
  "backwards playback excludes future",
);
const original = JSON.stringify(rows),
  strokes = [];
let saved;
const ctx = {
  globalAlpha: 1,
  lineWidth: 1,
  lineDashOffset: 0,
  save() {
    saved = {
      globalAlpha: this.globalAlpha,
      lineWidth: this.lineWidth,
      lineDashOffset: this.lineDashOffset,
    };
  },
  restore() {
    Object.assign(this, saved);
  },
  setLineDash(d) {
    this.dash = d;
  },
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {
    strokes.push({
      alpha: this.globalAlpha,
      offset: this.lineDashOffset,
      width: this.lineWidth,
      dash: this.dash,
    });
  },
};
Trails.draw(ctx, rows, (p) => p, 4, settings, "#abcdef");
assert.equal(strokes.length, 2);
assert.ok(strokes[0].alpha < strokes[1].alpha, "older segments fade more");
assert.ok(Math.abs(strokes[1].alpha - 2 ** -0.5) < 1e-10);
assert.deepEqual(strokes[0].dash, [4, 4, 1, 4]);
assert.equal(strokes[0].width, 3);
assert.ok(
  strokes[1].offset < 0,
  "dash phase continues between fading segments",
);
assert.equal(ctx.globalAlpha, 1, "later markers and ellipses retain opacity");
assert.equal(ctx.lineWidth, 1);
assert.equal(
  JSON.stringify(rows),
  original,
  "appearance does not mutate history",
);
console.log(
  "Trails: time clipping, boundary interpolation, playback, exponential fade and isolated styles passed",
);
