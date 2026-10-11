// Offline integration: actual app code, KaTeX, stored playback and controls.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const Lab = require("../web/model.js"),
  katex = require("../web/vendor/katex/katex.min.js");
const canvas = new Proxy(
  {},
  {
    get: (_, key) => (key === "measureText" ? () => ({ width: 20 }) : () => {}),
  },
);
const elements = {};
function element(id = "") {
  return {
    id,
    min: "",
    max: "",
    dataset: {},
    style: {},
    hidden: false,
    value: "",
    checked: false,
    disabled: false,
    textContent: "",
    options: [{}, {}, {}],
    classList: { toggle() {}, remove() {} },
    getBoundingClientRect: () => ({ width: 700, height: 450, left: 0, top: 0 }),
    getContext: () => canvas,
    setPointerCapture() {},
    dispatchEvent(event) {
      if (this[event.type]) this[event.type](event);
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    focus() {},
    addEventListener(event, callback) {
      this[event] = callback;
    },
    append(...children) {
      this.children = (this.children || []).concat(children);
      for (const child of children) if (child?.id) elements[child.id] = child;
    },
    checkValidity: () => true,
  };
}
const html = fs.readFileSync("web/index.html", "utf8");
for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
  const e = element(match[1]);
  elements[e.id] = e;
  e.value = match[0].match(/\bvalue="([^"]+)"/)?.[1] || "";
  e.min = match[0].match(/\bmin="([^"]+)"/)?.[1] || "";
  e.max = match[0].match(/\bmax="([^"]+)"/)?.[1] || "";
  e.type = match[0].match(/\btype="([^"]+)"/)?.[1] || "";
  e.checked = /\bchecked\b/.test(match[0]);
  e.hidden = /\bhidden\b/.test(match[0]);
}
elements.windProfile.value = "quintic";
elements.windMode.value = "step";
elements.scenario.value = "normal";
elements.speed.value = "1";
const context = vm.createContext({
  KalmanLab: Lab,
  TrailRenderer: require("../web/trails.js"),
  PlotCamera: require("../web/camera.js"),
  WindModel: require("../web/wind.js"),
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  katex: {
    render: (tex, e, o) => {
      e.innerHTML = katex.renderToString(tex, o);
    },
  },
  console,
  devicePixelRatio: 1,
  requestAnimationFrame: () => {},
  window: { addEventListener() {} },
  document: {
    body: element(),
    getElementById: (id) => elements[id],
    querySelector: () => element(),
    createElement: () => element(),
    createTextNode: (s) => s,
    addEventListener() {},
  },
});
vm.runInContext(fs.readFileSync("web/app.js", "utf8"), context);
const run = (s) => vm.runInContext(s, context);
for (let phase = 0; phase < 50; phase++)
  for (const progress of [0, 0.5, 1])
    run(`phase=${phase};progress=${progress};draw()`);
run("phase=15;progress=1;draw()");
const before = elements["value-p"].dataset.tex;
elements.next.onclick();
elements.previous.onclick();
assert.equal(elements["value-p"].dataset.tex, before);
for (const child of elements.visibility.children) {
  child.children[0].checked = false;
  child.children[0].change();
}
run("draw()");
elements.iteration.value = "25";
elements.iteration.oninput();
assert.equal(elements["iteration-value"].textContent, "25 / 25");
elements.dt.value = ".2";
elements.parameters.input();
assert.equal(run("simulation.parameters.dt"), 0.2);
assert.equal(run("phase"), 0);
elements.scenario.value = "dropout";
elements.scenario.onchange();
elements.iteration.value = "12";
elements.iteration.oninput();
assert.match(elements.status.textContent, /no measurement/);
assert.match(elements["value-y"].dataset.tex, /varnothing/);
elements.scenario.value = "normal";
elements.scenario.onchange();
elements.outlier.onclick();
assert.equal(run("simulation.parameters.outlierAt"), 1);
elements.matched.checked = false;
elements.matched.onchange();
elements.assumedSensor.value = "10";
elements.assumedSensor.input();
assert.equal(run("simulation.filterParameters.sensorStd"), 10);
elements.compare.checked = true;
elements.compare.onchange();
run("draw()");
console.log(
  "Browser integration: all 50 stages, interpolation, LaTeX, visibility, backwards stepping, parameter regeneration, gaps, outliers and comparison passed",
);

vm.runInContext(fs.readFileSync("web/filters.js", "utf8"), context);
context.FilterComparison = context.window.FilterComparison;
vm.runInContext(fs.readFileSync("web/augmented-model.js", "utf8"), context);
context.AugmentedKF = context.window.AugmentedKF;
vm.runInContext(fs.readFileSync("web/live-model.js", "utf8"), context);
context.LiveSimulation = context.window.LiveSimulation;
elements["demo-mode"].value = "live";
vm.runInContext(fs.readFileSync("web/live.js", "utf8"), context);
vm.runInContext(fs.readFileSync("web/camera-ui.js", "utf8"), context);
assert.equal(run("demoMode"), "live");
for (let i = 0; i < 51; i++) run("liveAnimate(" + i * 20 + ")");
assert.ok(Math.abs(run("live.time") - 1.02) < 1e-9, "1x wall-clock playback");
elements.play.onclick();
const pausedTime = run("live.time");
run("liveAnimate(2000)");
assert.equal(run("live.time"), pausedTime);
elements["force-type"].value = "known";
elements["state-plot"].pointerdown({
  pointerId: 4,
  clientX: 500,
  clientY: 150,
});
elements["state-plot"].pointerup({ pointerId: 4, clientX: 500, clientY: 150 });
assert.equal(run("live.forces.length"), 1);
assert.equal(run("live.forces[0].known"), true);
elements.next.onclick();
assert.ok(run("live.time") > pausedTime);
const liveValues = elements["value-p"].dataset.tex;
elements.previous.onclick();
elements.next.onclick();
assert.equal(elements["value-p"].dataset.tex, liveValues);
elements["demo-mode"].value = "staged";
elements["demo-mode"].onchange();
assert.equal(run("demoMode"), "staged");
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
assert.equal(run("demoMode"), "live");
console.log(
  "Live UI: real-time scheduler, pause, force click, known input, history and mode switching passed",
);

elements.poleType.value = "real";
elements.firType.value = "mean";
elements.iirType.value = "butterworth";
vm.runInContext(fs.readFileSync("web/filter-ui.js", "utf8"), context);
elements.pole1.value = "0.7";
const unchangedIir = run(
  "JSON.stringify(live.comparison.axes.map(a=>a.stages))",
);
elements.pole1.input({ target: elements.pole1 });
assert.equal(
  run("JSON.stringify(live.comparison.axes.map(a=>a.stages))"),
  unchangedIir,
);
assert.equal(run("live.comparison.p.pole1"), 0.7);
elements.next.onclick();
assert.ok(
  run(
    "live.history.at(-1).comparisons.observer.every(a => a.every(Number.isFinite))",
  ),
);
for (const key of ["observer", "fir", "iir"]) run(`visible.${key}=true`);
run("draw()");
elements["demo-mode"].value = "staged";
elements["demo-mode"].onchange();
assert.equal(run("simulation.rows[0].comparisons.observer.length"), 1);
elements.firOrder.value = "20";
elements.firOrder.input();
assert.equal(run("filterSettings().firOrder"), 20);
run("phase=0;progress=0;draw()");
run("phase=49;progress=1;draw()");
console.log(
  "Comparison UI: settings, independent visibility, live and staged history passed",
);

vm.runInContext(fs.readFileSync("web/pole-ui.js", "utf8"), context);
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
elements.poleType.value = "complex";
elements.poleType.change({ target: elements.poleType });
assert.equal(elements["real-pole-controls"].hidden, true);
assert.equal(elements["complex-pole-controls"].hidden, false);
elements["show-pole-map"].checked = true;
elements["show-pole-map"].change();
elements["pole-map"].pointerdown({ clientX: 700, clientY: 0, pointerId: 1 });
elements["pole-map"].pointermove({ clientX: 650, clientY: 0, pointerId: 1 });
elements["pole-map"].pointerup();
assert.equal(+elements.poleRadius.value, 0.99);
assert.ok(
  run(
    "FilterComparison.observerPoles(filterSettings()).points.every(p=>Math.hypot(...p)<=.99000001)",
  ),
);
assert.match(elements["pole-readout"].textContent, /j/);
assert.ok(run("live.comparison.p.poleType === 'complex'"));
console.log(
  "Pole UI: conjugate mode, drag placement, radius cap and observer settings passed",
);
elements.poleType.value = "real";
elements.pole1.value = "0.2";
elements.pole2.value = "0.8";
run("setPolePoint(0.2,0.4,0,true)");
assert.equal(
  elements.poleType.value,
  "real",
  "separate real poles cannot drag off-axis",
);
assert.equal(+elements.pole1.value, 0.2);
elements.pole1.value = "0.5";
elements.pole2.value = "0.52";
run("setPolePoint(0.51,0.4,0,true)");
assert.equal(
  elements.poleType.value,
  "complex",
  "nearby real poles can form conjugate pair",
);
run("setPolePoint(0.6,0.01,0,true)");
assert.equal(
  elements.poleType.value,
  "real",
  "return to real axis merges conjugate pair",
);
assert.equal(elements.pole1.value, elements.pole2.value);
console.log(
  "Pole drag: separated real constraint, close-pair transition and merging passed",
);

let stoppedPoleKey = false;
elements["pole-map"].keydown({
  key: "ArrowLeft",
  preventDefault() {},
  stopPropagation() {
    stoppedPoleKey = true;
  },
});
assert.ok(
  stoppedPoleKey,
  "pole keyboard control must not trigger playback stepping",
);

vm.runInContext(fs.readFileSync("web/disturbance-ui.js", "utf8"), context);
const timeBeforeAugmentation = run("live.time");
elements.estimateForce.checked = true;
elements.estimateForce.change({ target: elements.estimateForce });
assert.equal(run("live.time"), timeBeforeAugmentation);
assert.ok(run("live.forceEstimator !== null"));
elements.next.onclick();
assert.equal(elements["disturbance-panel"].hidden, false);
assert.match(elements["disturbance-model"].dataset.tex, /F_d/);
assert.ok(run("live.history.at(-1).augmented.force.every(Number.isFinite)"));
const oldForceBank = run("live.forceEstimator");
elements.forceDrift.value = "20";
elements.forceDrift.input({ target: elements.forceDrift });
assert.equal(run("live.forceEstimator"), oldForceBank);
assert.equal(run("live.p.forceDrift"), 20);
elements.forceInitialStd.value = "50";
elements.forceInitialStd.input({ target: elements.forceInitialStd });
assert.notEqual(run("live.forceEstimator"), oldForceBank);
assert.equal(run("live.forceEstimator.axes[0].P[2][2]"), 2500);
elements["demo-mode"].value = "staged";
elements["demo-mode"].onchange();
assert.equal(elements.estimateForce.disabled, true);
assert.equal(elements["disturbance-panel"].hidden, true);
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
assert.equal(elements.estimateForce.disabled, false);
assert.ok(run("live.history.at(-1).augmented !== null"));
console.log(
  "Disturbance UI: enable, tuning, history and mode switching passed",
);

vm.runInContext(fs.readFileSync("web/trail-ui.js", "utf8"), context);
const trailTime = run("live.time");
elements.limitTrail.checked = true;
elements.limitTrail.change();
elements.trailLength.value = "1.5";
elements.trailLength.input();
elements.fadeTrail.checked = true;
elements.fadeTrail.change();
elements.trailStyle.value = "dotted";
elements.trailStyle.change();
elements.trailWidth.value = "3";
elements.trailWidth.input();
assert.equal(elements.trailLength.disabled, false);
assert.equal(elements.trailHalfLife.disabled, false);
assert.equal(elements.trailDash.disabled, true);
assert.equal(run("trailSettings().trailLength"), 1.5);
assert.equal(run("trailSettings().trailWidth"), 3);
assert.equal(
  run("live.time"),
  trailTime,
  "trail controls preserve motion and filter state",
);
elements["demo-mode"].value = "staged";
elements["demo-mode"].onchange();
run("phase=49;progress=1;draw()");
console.log(
  "Trail UI: length, fade, style, thickness, live and staged drawing passed",
);

vm.runInContext(fs.readFileSync("web/wind-ui.js", "utf8"), context);
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
const cameraTime = run("live.time"),
  rangeBefore = +elements.viewRange.value;
elements["zoom-in"].onclick();
assert.ok(+elements.viewRange.value < rangeBefore);
assert.equal(run("live.time"), cameraTime);
let wheelPrevented = false;
elements["state-plot"].wheel({
  deltaY: 100,
  deltaMode: 0,
  preventDefault() {
    wheelPrevented = true;
  },
});
assert.ok(wheelPrevented);
const forcesBeforePinch = run("live.forces.length");
elements["state-plot"].pointerdown({
  pointerType: "touch",
  pointerId: 1,
  clientX: 200,
  clientY: 150,
});
elements["state-plot"].pointerdown({
  pointerType: "touch",
  pointerId: 2,
  clientX: 400,
  clientY: 150,
});
const beforePinch = +elements.viewRange.value;
elements["state-plot"].pointermove({
  pointerId: 2,
  clientX: 500,
  clientY: 150,
});
assert.ok(+elements.viewRange.value < beforePinch);
elements["state-plot"].pointerup({ pointerId: 1 });
elements["state-plot"].pointerup({ pointerId: 2 });
assert.equal(
  run("live.forces.length"),
  forcesBeforePinch,
  "pinching never applies a force",
);
elements["reset-view"].onclick();
assert.equal(elements.viewRange.value, "25");
console.log("Camera UI: zoom, wheel, pinch isolation and reset passed");
elements["wind-settings"].open = true;
elements.windEnabled.checked = true;
elements.windEnabled.change();
assert.equal(
  run("live.k"),
  1,
  "wind configuration restarts a coherent experiment",
);
elements.windProfile.value = "normalized";
elements.windProfile.change();
assert.equal(elements.windA.disabled, false);
assert.equal(elements.windDuration.disabled, true);
elements.windMode.value = "pulse";
elements.windMode.change();
assert.equal(elements.windHold.disabled, false);
assert.equal(elements.windDuration.disabled, false);
elements.windAngle.value = "-90";
elements.windAngle.input();
assert.equal(run("live.wind.p.windAngle"), -90);
assert.equal(run("live.p.windEnabled"), true);
const previousSeed = +elements.windSeed.value;
elements["wind-reseed"].onclick();
assert.equal(+elements.windSeed.value, previousSeed + 1);
elements.windShowTurbulence.checked = true;
elements.windShowTurbulence.change();
run("draw()");
assert.match(elements["wind-vector"].textContent, /Fx.*N.*Fy/);
elements["demo-mode"].value = "staged";
elements["demo-mode"].onchange();
assert.equal(elements.windEnabled.disabled, true);
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
console.log(
  "Wind UI: profile relevance, pulse settings, parameter restart, seed, plots and mode handling passed",
);
vm.runInContext(fs.readFileSync("web/settings.js", "utf8"), context);
elements.mass.value = "3";
elements["reset-settings"].onclick();
assert.equal(elements["reset-settings-dialog"].open, true);
elements["cancel-settings-reset"].onclick();
assert.equal(elements.mass.value, "3", "cancel preserves settings");
elements["reset-settings"].onclick();
elements["confirm-settings-reset"].onclick();
assert.equal(elements["reset-settings-dialog"].open, false);
assert.equal(elements.mass.value, "1");
assert.equal(elements.poleType.value, "real");
assert.equal(elements["demo-mode"].value, "live");
assert.equal(elements["color-theme"].value, "uq");
assert.equal(run("livePlaying"), true);
assert.equal(run("live.k"), 1);
assert.equal(run("live.forces.length"), 0);
assert.equal(run("live.comparison.p.pole1"), 0.85);
assert.equal(run("visible.fir"), true);
assert.equal(elements["show-pole-map"].checked, false);
assert.equal(elements["comparison"].hidden, true);
console.log(
  "Settings reset: confirmation, cancellation, defaults and clean live restart passed",
);

assert.equal(elements.estimateForce.checked, false);
assert.equal(run("live.p.estimateForce"), false);
assert.equal(elements.forceDrift.value, "10");

assert.equal(elements.limitTrail.checked, false);
assert.equal(elements.fadeTrail.checked, false);
assert.equal(elements.trailStyle.value, "auto");
assert.equal(elements.trailWidth.value, "1");

assert.equal(elements.windEnabled.checked, false);
assert.equal(run("live.p.windEnabled"), false);
assert.equal(elements.recenterDuration.value, "1.5");

// Manual pan moves only the camera and never applies force.
elements["demo-mode"].value = "live";
elements["demo-mode"].onchange();
elements["center-view"].onclick();
const panTime = run("live.time"),
  panForceCount = run("live.forces.length"),
  panX = run("liveCamera.center[0]");
elements["state-plot"].pointerdown({
  pointerId: 9,
  clientX: 300,
  clientY: 200,
});
elements["state-plot"].pointermove({
  pointerId: 9,
  clientX: 400,
  clientY: 230,
});
elements["state-plot"].pointerup({ pointerId: 9, clientX: 400, clientY: 230 });
assert.ok(run("liveCamera.center[0]") < panX);
assert.equal(elements["follow-object"].checked, false);
assert.equal(run("live.forces.length"), panForceCount);
assert.equal(run("live.time"), panTime);
elements["center-view"].onclick();
assert.equal(elements["follow-object"].checked, true);
// Trigger at current time without clearing history, including while paused.
elements.play.onclick();
const triggerTime = run("live.time"),
  triggerHistory = run("live.history.length");
elements["wind-trigger"].onclick();
assert.equal(run("live.time"), triggerTime);
assert.equal(run("live.history.length"), triggerHistory);
assert.equal(run("livePlaying"), false);
assert.equal(run("live.wind.parametersAt(live.time).windStart"), triggerTime);
assert.equal(run("live.wind.p.windEnabled"), true);
run("liveAnimate(50000);liveAnimate(51000)");
assert.equal(run("live.time"), triggerTime);
console.log(
  "Pan, force-click isolation, gust trigger and paused playback passed",
);
