"use strict";
const windIds = Object.keys(WindModel.defaults),
  windUnits = {
    windStart: "s",
    windDuration: "s",
    windHold: "s",
    windAmplitude: "N",
    windAngle: "°",
    windA: "s⁻¹",
    windC: "s",
    windMeanX: "N",
    windMeanY: "N",
    windNoiseAmplitude: "N",
    windRate: "s⁻¹",
    windSeed: "",
  };
function windSettings() {
  return Object.fromEntries(
    windIds.map((id) => {
      const el = $(id);
      return [
        id,
        el.type === "checkbox"
          ? el.checked
          : el.type === "range"
            ? +el.value
            : el.value,
      ];
    }),
  );
}
function windLabels() {
  const p = windSettings(),
    isLive = demoMode === "live",
    tanh = ["normalized", "tanh"].includes(p.windProfile);
  $("wind-plots").hidden = !isLive;
  for (const id of windIds) $(id).disabled = !isLive;
  for (const [id, unit] of Object.entries(windUnits))
    $(id + "-value").textContent =
      (id === "windSeed" ? p[id].toFixed(0) : p[id].toFixed(2)) +
      (unit ? " " + unit : "");
  $("windHold").disabled = !isLive || p.windMode !== "pulse";
  for (const id of ["windA", "windC"]) $(id).disabled = !isLive || !tanh;
  $("windDuration").disabled =
    !isLive ||
    (tanh && p.windMode === "step") ||
    (p.windProfile === "hard" && p.windMode === "step");
  for (const id of ["windNoiseAmplitude", "windRate", "windSeed"])
    $(id).disabled = !isLive || !p.windTurbulence;
  $("wind-reseed").disabled = !isLive || !p.windTurbulence;
  $("wind-reset").disabled = !isLive;
  $("windHold").title =
    "Pulse return begins onset + transition duration + hold.";
  $("windDuration").title =
    "Exact rise for quintic; approximate 95% rise for first/second order; pulse timing for tanh and instantaneous step.";
  $("wind-profile-note").textContent =
    p.windProfile === "quintic"
      ? "Exact finite transition; zero slope and curvature at both ends."
      : tanh
        ? "Tanh uses a and c; transition duration sets pulse return timing. Original tanh has a small onset jump."
        : p.windProfile === "hard"
          ? "Instantaneous onset; transition duration sets pulse return timing."
          : "Transition duration is approximately the 95% rise time; the plateau is asymptotic.";
}
function configureWind() {
  windLabels();
  if (demoMode === "live") liveReset();
  else draw();
}
for (const id of windIds)
  $(id).addEventListener(
    $(id).type === "range" ? "input" : "change",
    configureWind,
  );
$("wind-reseed").onclick = () => {
  $("windSeed").value = String((+$("windSeed").value % 999) + 1);
  configureWind();
};
$("wind-reset").onclick = () => {
  for (const [id, v] of Object.entries(WindModel.defaults)) {
    if ($(id).type === "checkbox") $(id).checked = v;
    else $(id).value = String(v);
  }
  configureWind();
};
for (const id of ["windCompareProfiles", "windShowTurbulence"])
  $(id).addEventListener("change", () => draw());
$("wind-settings").addEventListener("toggle", () => {
  if ($("wind-settings").open) draw();
});
const windLegend = document.createElement("span");
windLegend.className = "wind";
windLegend.textContent = "Wind actual";
document.querySelector(".legend").append(windLegend);
const windProfileSpans = WindModel.profiles.map(([id, label]) => {
  const span = document.createElement("span");
  span.textContent = label;
  $("wind-profile-legend").append(span);
  return span;
});
const windColours = () => [
  palette.truth,
  palette.iir,
  palette.posterior,
  palette.observer,
  palette.prior,
  palette.wind,
];
function windAxes(canvas, xmin, xmax, ymin, ymax, unit, cursor) {
  const { ctx, w, h } = canvasSetup(canvas),
    l = 42,
    r = 12,
    t = 20,
    b = 27;
  const x = (v) => l + ((v - xmin) / (xmax - xmin)) * (w - l - r),
    y = (v) => t + ((ymax - v) / (ymax - ymin)) * (h - t - b);
  ctx.font = "10px system-ui";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const vx = xmin + ((xmax - xmin) * i) / 4,
      vy = ymin + ((ymax - ymin) * i) / 4;
    ctx.strokeStyle = palette.grid;
    ctx.beginPath();
    ctx.moveTo(x(vx), t);
    ctx.lineTo(x(vx), h - b);
    ctx.moveTo(l, y(vy));
    ctx.lineTo(w - r, y(vy));
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "center";
    ctx.fillText(vx.toFixed(1), x(vx), h - 12);
    ctx.textAlign = "right";
    ctx.fillText(vy.toFixed(1), l - 6, y(vy) + 3);
  }
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "left";
  ctx.fillText(unit, l, 11);
  ctx.textAlign = "right";
  ctx.fillText("Time [s]", w - r, h - 1);
  if (cursor >= xmin && cursor <= xmax) {
    ctx.strokeStyle = palette.muted;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x(cursor), t);
    ctx.lineTo(x(cursor), h - b);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return { ctx, x, y };
}
function windLine(ax, samples, color, width = 2, dash = [], alpha = 1) {
  const { ctx, x, y } = ax;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.setLineDash(dash);
  ctx.beginPath();
  samples.forEach(([time, v], i) => {
    if (i) ctx.lineTo(x(time), y(v));
    else ctx.moveTo(x(time), y(v));
  });
  ctx.stroke();
  ctx.restore();
}
function drawWind(history, row) {
  if (!$("wind-settings").open) return;
  const p = live.p,
    cursor = row.windTime;
  const horizon = Math.max(
    14,
    p.windStart +
      (p.windMode === "pulse"
        ? 2 * p.windDuration + p.windHold
        : p.windDuration) +
      2,
    cursor + 1,
  );
  const times = Array.from({ length: 241 }, (_, i) => (horizon * i) / 240),
    colours = windColours();
  const response = windAxes(
    $("wind-response"),
    0,
    horizon,
    -0.05,
    1.1,
    "Normalised force",
    cursor,
  );

  WindModel.profiles.forEach(([id, label], i) => {
    const selected = id === p.windProfile;
    const span = windProfileSpans[i];
    span.hidden = !selected && !$("windCompareProfiles").checked;
    span.style.color = colours[i];
    span.style.fontWeight = selected ? "700" : "400";
    if (span.hidden) return;
    windLine(
      response,
      times.map((t) => [t, WindModel.shape(t, p, id)]),
      colours[i],
      selected ? 3 : 1,
      [],
      selected ? 1 : 0.5,
    );
  });

  const rows = history.filter((r) => r.wind),
    xmin = rows[0].windTime,
    xmax = Math.max(xmin + row.dt, cursor);
  const showNoise = $("windShowTurbulence").checked;
  const max =
    Math.max(
      1,
      ...rows
        .flatMap((r) => [
          ...r.wind.force,
          ...(showNoise ? r.wind.turbulence : []),
        ])
        .map(Math.abs),
    ) * 1.15;
  const force = windAxes(
    $("wind-history"),
    xmin,
    xmax,
    -max,
    max,
    "Force [N]",
    cursor,
  );
  for (let j = 0; j < 2; j++) {
    const color = j === 0 ? palette.wind : palette.observer;
    windLine(
      force,
      rows.map((r) => [r.windTime, r.wind.force[j]]),
      color,
    );
    if (showNoise)
      windLine(
        force,
        rows.map((r) => [r.windTime, r.wind.turbulence[j]]),
        color,
        1,
        [4, 4],
        0.65,
      );
  }
  const f = row.wind.force,
    mag = Math.hypot(...f),
    angle =
      mag > 1e-10
        ? ((Math.atan2(f[1], f[0]) * 180) / Math.PI).toFixed(1) + "°"
        : "—";
  $("wind-vector").textContent =
    `Fx ${f[0].toFixed(2)} N · Fy ${f[1].toFixed(2)} N · |F| ${mag.toFixed(2)} N · direction ${angle} · t ${cursor.toFixed(2)} s`;
}
windLabels();
