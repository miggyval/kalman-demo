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
    classList: { toggle() {} },
    getBoundingClientRect: () => ({ width: 700, height: 450 }),
    getContext: () => canvas,
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
    getElementById: (id) => elements[id],
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
