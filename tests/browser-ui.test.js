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
    addEventListener(event, callback) {
      this[event] = callback;
    },
    append(...children) {
      this.children = (this.children || []).concat(children);
    },
    checkValidity: () => true,
  };
}
const html = fs.readFileSync("web/index.html", "utf8");
for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
  const e = element(match[1]);
  elements[e.id] = e;
  e.value = match[0].match(/\bvalue="([^"]+)"/)?.[1] || "";
  e.checked = /\bchecked\b/.test(match[0]);
  e.hidden = /\bhidden\b/.test(match[0]);
}
elements.scenario.value = "normal";
elements.speed.value = "1";
const context = vm.createContext({
  KalmanLab: Lab,
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
vm.runInContext(fs.readFileSync("web/live-model.js", "utf8"), context);
context.LiveSimulation = context.window.LiveSimulation;
elements["demo-mode"].value = "live";
vm.runInContext(fs.readFileSync("web/live.js", "utf8"), context);
assert.equal(run("demoMode"), "live");
for (let i = 0; i < 51; i++) run("liveAnimate(" + i * 20 + ")");
assert.ok(Math.abs(run("live.time") - 1.02) < 1e-9, "1x wall-clock playback");
elements.play.onclick();
const pausedTime = run("live.time");
run("liveAnimate(2000)");
assert.equal(run("live.time"), pausedTime);
elements["force-type"].value = "known";
elements["state-plot"].pointerdown({ clientX: 500, clientY: 150 });
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
elements["pole-map"].keydown({key:"ArrowLeft",preventDefault(){},stopPropagation(){stoppedPoleKey=true;}});
assert.ok(stoppedPoleKey,"pole keyboard control must not trigger playback stepping");
