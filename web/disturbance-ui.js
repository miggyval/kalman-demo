"use strict";
function disturbanceSettings() {
  return {
    estimateForce: $("estimateForce").checked,
    forceDrift: +$("forceDrift").value,
    forceInitialStd: +$("forceInitialStd").value,
  };
}
function disturbanceMode() {
  const enabled = demoMode === "live";
  $("estimateForce").disabled = !enabled;
  for (const id of ["forceDrift", "forceInitialStd"]) $(id).disabled = !enabled;
  if (!enabled) $("disturbance-panel").hidden = true;
}
function configureDisturbance(event) {
  if (demoMode !== "live") return;
  Object.assign(live.p, disturbanceSettings());
  if (event?.target?.id !== "forceDrift") {
    if (live.p.estimateForce) live.enableForceEstimator();
    else live.forceEstimator = null;
  }
  draw();
}
$("estimateForce").addEventListener("change", configureDisturbance);
for (const id of ["forceDrift", "forceInitialStd"])
  $(id).addEventListener("input", configureDisturbance);
const augmentedLegend = document.createElement("span");
augmentedLegend.className = "augmented";
augmentedLegend.textContent = "Augmented KF";
document.querySelector(".legend").append(augmentedLegend);
function drawDisturbance(history, row) {
  $("disturbance-panel").hidden = !live.p.estimateForce;
  if (!live.p.estimateForce) return;
  math(
    "disturbance-model",
    String.raw`\begin{gathered}z=[p,v,F_d]^T,\quad A_d=\begin{bmatrix}1&\Delta t&0\\0&1&\Delta t/m\\0&0&1\end{bmatrix},\ C_d=[1\;0\;0]\\F_{d,k+1}=F_{d,k}+w_{F,k},\quad \operatorname{var}(w_F)=\sigma_F^2\Delta t\end{gathered}`,
  );
  if (!row.augmented) {
    delete $("disturbance-values").dataset.tex;
    $("disturbance-values").textContent =
      "No force estimate at this stored sample.";
    $("force-history").hidden = true;
    return;
  }
  $("force-history").hidden = false;
  math(
    "disturbance-values",
    String.raw`\begin{aligned}\hat F_d&=${vector(row.augmented.force)}\ \mathrm{N},\quad 2\sigma=${vector(row.augmented.sigma.map((s) => 2 * s))}\ \mathrm{N}\\F_{d,\mathrm{actual}}&=${vector(row.disturbanceForce)}\ \mathrm{N}\end{aligned}`,
  );
  const rows = history.filter((r) => r.augmented);
  const { ctx, w, h } = canvasSetup($("force-history"));
  const max = Math.max(
    10,
    ...rows
      .flatMap((r) => [
        ...r.disturbanceForce,
        ...r.augmented.force.map(
          (v, j) => Math.abs(v) + 2 * r.augmented.sigma[j],
        ),
      ])
      .map(Math.abs),
  );
  const pos = (r, value) => [
    42 +
      ((w - 60) * (r.time - rows[0].time)) /
        Math.max(row.dt, rows.at(-1).time - rows[0].time),
    20 + (h - 40) * (0.5 - value / (2 * max)),
  ];
  ctx.font = "11px system-ui";
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.grid;
  ctx.beginPath();
  ctx.moveTo(42, h / 2);
  ctx.lineTo(w - 18, h / 2);
  ctx.stroke();
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "right";
  ctx.fillText(max.toFixed(0), 36, 22);
  ctx.fillText("0", 36, h / 2 + 4);
  ctx.fillText((-max).toFixed(0), 36, h - 20);
  for (const j of [0, 1]) {
    const color = j === 0 ? palette.augmented : palette.observer;
    ctx.fillStyle = color + "18";
    ctx.beginPath();
    rows.forEach((r, i) => {
      const p = pos(r, r.augmented.force[j] + 2 * r.augmented.sigma[j]);
      if (!i) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    [...rows]
      .reverse()
      .forEach((r) =>
        ctx.lineTo(...pos(r, r.augmented.force[j] - 2 * r.augmented.sigma[j])),
      );
    ctx.closePath();
    ctx.fill();
    for (const actual of [false, true]) {
      ctx.strokeStyle = color;
      ctx.setLineDash(actual ? [4, 4] : []);
      ctx.beginPath();
      rows.forEach((r, i) => {
        const p = pos(r, actual ? r.disturbanceForce[j] : r.augmented.force[j]);
        if (!i) ctx.moveTo(...p);
        else ctx.lineTo(...p);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(j === 0 ? "Fx" : "Fy", 50 + j * 70, 12);
  }
  ctx.fillStyle = palette.muted;
  ctx.fillText("Time [s] · last 8 seconds", 42, h - 2);
}
disturbanceMode();
