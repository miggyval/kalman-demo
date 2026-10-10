"use strict";
const filterKeys = Object.keys(FilterComparison.defaults);
function filterSettings() {
  return Object.fromEntries(
    filterKeys.map((key) => [
      key,
      key.endsWith("Type") ? $(key).value : +$(key).value,
    ]),
  );
}
function filterLabels() {
  for (const key of filterKeys) {
    const out = $(key + "-value");
    if (out)
      out.textContent = key.endsWith("Order")
        ? $(key).value
        : (+$(key).value).toFixed(2);
  }
  $("real-pole-controls").hidden = $("poleType").value === "complex";
  $("complex-pole-controls").hidden = $("poleType").value !== "complex";
  $("firCutoff").disabled = $("firType").value !== "sinc";
}
function prepareStagedFilters() {
  const bank = new FilterComparison.ComparisonFilters(
    [simulation.initial.x],
    filterSettings(),
  );
  for (const row of simulation.rows)
    row.comparisons = bank.step([row.y], simulation.parameters.dt, [
      -simulation.parameters.gravity,
    ]);
}
function configureFilters(event) {
  filterLabels();
  if (demoMode === "live") {
    Object.assign(live.p, filterSettings());
    // Reset the edited filter's memory; the other estimates keep advancing.
    const replacement = new FilterComparison.ComparisonFilters(
      live.estimates,
      filterSettings(),
    );
    const id = event?.target?.id || "";
    const group = id.startsWith("pole")
      ? "observer"
      : id.startsWith("fir")
        ? "fir"
        : id.startsWith("iir")
          ? "iir"
          : "all";
    const bank = live.comparison;
    bank.p = replacement.p;
    if (group === "fir" || group === "all") bank.weights = replacement.weights;
    bank.axes.forEach((axis, j) => {
      const fresh = replacement.axes[j];
      if (group === "observer" || group === "all")
        axis.observer = fresh.observer;
      if (group === "fir" || group === "all") {
        axis.samples = fresh.samples;
        axis.lastFir = fresh.lastFir;
      }
      if (group === "iir" || group === "all") {
        axis.stages = fresh.stages;
        axis.lastIir = fresh.lastIir;
      }
    });
  } else prepareStagedFilters();
  if (demoMode !== "live") calculateBounds();
  draw();
}
for (const key of filterKeys)
  $(key).addEventListener(
    key.endsWith("Type") ? "change" : "input",
    configureFilters,
  );
const legend = document.querySelector(".legend");
for (const [key, label] of [
  ["observer", "Luenberger"],
  ["fir", "FIR"],
  ["iir", "IIR"],
]) {
  const item = document.createElement("span");
  item.className = key;
  item.textContent = label;
  legend.append(item);
}
filterLabels();
Object.assign(live.p, filterSettings());
prepareStagedFilters();
draw();
