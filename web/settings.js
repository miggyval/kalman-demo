"use strict";
function restoreSettings() {
  const defaults = {
    ...KalmanLab.defaults,
    ...FilterComparison.defaults,
    ...AugmentedKF.defaults,
    ...TrailRenderer.defaults,
    ...PlotCamera.defaults,
    mass: 1,
    amplitude: 20,
    period: 6,
    damping: 2,
    speed: 1,
    "force-strength": 30,
    "force-duration": 1,
    "force-type": "disturbance",
    scenario: "normal",
    "demo-mode": "live",
    "color-mode": "dark",
    "color-theme": "uq",
  };
  for (const [id, value] of Object.entries(defaults)) {
    const control = $(id);
    if (control) control.value = String(value);
  }
  for (const key of Object.keys(visible)) {
    visible[key] = true;
    $("show-" + key).checked = true;
  }
  $("limitTrail").checked = false;
  $("fadeTrail").checked = false;
  $("trail-settings").open = false;
  trailLabels();
  cameraLabels();
  $("estimateForce").checked = false;
  $("disturbance-settings").open = false;
  $("disturbance-panel").hidden = true;
  $("matched").checked = true;
  for (const id of ["assumedProcess", "assumedSensor"]) $(id).disabled = true;
  $("compare").checked = false;
  $("comparison").hidden = true;
  $("show-pole-map").checked = false;
  poleCanvas.hidden = true;
  poleDrag = null;
  $("filter-settings").open = false;
  $("experiments").open = false;
  outlierAt = 0;
  filterLabels();
  $("demo-mode").onchange();
  // Apply and persist the default appearance through its usual handlers.
  $("color-mode").dispatchEvent(new Event("change"));
  $("color-theme").dispatchEvent(new Event("change"));
  draw();
}
const settingsDialog = $("reset-settings-dialog");
settingsDialog.addEventListener("keydown", (event) => event.stopPropagation());
$("reset-settings").onclick = () => {
  settingsDialog.showModal();
  $("cancel-settings-reset").focus();
};
$("cancel-settings-reset").onclick = () => settingsDialog.close();
$("confirm-settings-reset").onclick = () => {
  restoreSettings();
  settingsDialog.close();
};
