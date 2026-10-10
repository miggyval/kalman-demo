"use strict";
let live,
  livePlaying = true,
  liveCursor = 0,
  liveDebt = 0,
  liveLast,
  liveLastDraw = 0,
  liveBounds;
const stagedHandlers = Object.fromEntries(
  ["play", "previous", "next", "reset", "iteration", "outlier"].map((id) => [
    id,
    $(id)[id === "iteration" ? "oninput" : "onclick"],
  ]),
);
const parameterIds = [
  "dt",
  "processStd",
  "sensorStd",
  "gravity",
  "height",
  "velocity",
  "pHeight",
  "pVelocity",
  "assumedProcess",
  "assumedSensor",
];
const rangeIds = [
  ...parameterIds,
  "speed",
  "force-strength",
  "force-duration",
  "mass",
  "amplitude",
  "period",
  "damping",
];
function sliderValues() {
  for (const id of rangeIds) {
    const out = $(id + "-value");
    if (out)
      out.textContent = number(+$(id).value) + (id === "speed" ? "×" : "");
  }
}
for (const id of rangeIds) $(id).addEventListener("input", sliderValues);
function liveParameters(resetInitial = false) {
  if (!live) return;
  for (const id of parameterIds) live.p[id] = +$(id).value;
  for (const id of ["mass", "amplitude", "period", "damping"])
    live.p[id] = +$(id).value;
  live.p.matched = $("matched").checked;
  live.p.scenario = $("scenario").value;
  if (resetInitial) liveReset();
  else liveDraw();
  sliderValues();
}
function liveReset() {
  const p = typeof filterSettings === "function" ? filterSettings() : {};
  for (const id of parameterIds) p[id] = +$(id).value;
  for (const id of ["mass", "amplitude", "period", "damping"])
    p[id] = +$(id).value;
  p.matched = $("matched").checked;
  p.scenario = $("scenario").value;
  live = new LiveSimulation(p);
  live.step();
  liveCursor = 0;
  liveDebt = 0;
  liveLast = undefined;
  liveEquations();
  liveDraw();
}
function liveEquations(row = live.history[liveCursor] || live.history.at(-1)) {
  math(
    "model-matrices",
    String.raw`\begin{gathered}x=[p_x,p_y,v_x,v_y]^T\\ A=\begin{bmatrix}I_2&\Delta t I_2\\0&I_2\end{bmatrix},\quad B=G=\begin{bmatrix}0\\\Delta t I_2\end{bmatrix},\quad C=[I_2\;0]\end{gathered}`,
  );
  math(
    "noise-equations",
    String.raw`\Delta t=${number(row.dt)},\quad Q=${number(row.Q)}I_2,\quad R=${number(row.R)}I_2`,
  );
}
const fullMatrix = (values, n) =>
  String.raw`\begin{bmatrix}${Array.from(
    { length: values.length / n },
    (_, i) =>
      values
        .slice(i * n, i * n + n)
        .map(number)
        .join("&"),
  ).join(String.raw`\\`)}\end{bmatrix}`;
function liveDraw() {
  if (!live || demoMode !== "live") return;
  liveCursor = Math.max(0, Math.min(liveCursor, live.history.length - 1));
  const row = live.history[liveCursor];
  const { ctx, w, h } = canvasSetup($("state-plot")),
    left = 58,
    top = 20,
    right = 15,
    bottom = 40;
  const half = Math.max(
    20,
    live.p.amplitude * 1.1,
    ...row.truth.slice(0, 2).map((v, j) => Math.abs(v - live.origin[j]) + 10),
    ...["observer", "fir", "iir"]
      .filter((key) => visible[key] && row.comparisons)
      .flatMap((key) =>
        row.comparisons[key].map((a, j) => Math.abs(a[0] - live.origin[j]) + 5),
      ),
  );
  const aspect = (w - left - right) / (h - top - bottom),
    hx = half * Math.max(1, aspect),
    hy = half * Math.max(1, 1 / aspect);
  liveBounds = {
    xmin: live.origin[0] - hx,
    xmax: live.origin[0] + hx,
    ymin: live.origin[1] - hy,
    ymax: live.origin[1] + hy,
    left,
    top,
    pw: w - left - right,
    ph: h - top - bottom,
  };
  const b = liveBounds,
    pos = (x) => [
      left + ((x[0] - b.xmin) / (b.xmax - b.xmin)) * b.pw,
      top + ((b.ymax - x[1]) / (b.ymax - b.ymin)) * b.ph,
    ];
  ctx.font = "11px system-ui";
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = palette.muted;
  for (let i = 0; i <= 4; i++) {
    const x = left + (b.pw * i) / 4,
      y = top + (b.ph * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + b.ph);
    ctx.moveTo(left, y);
    ctx.lineTo(left + b.pw, y);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText((b.xmin + ((b.xmax - b.xmin) * i) / 4).toFixed(1), x, h - 20);
    ctx.textAlign = "right";
    ctx.fillText(
      (b.ymax - ((b.ymax - b.ymin) * i) / 4).toFixed(1),
      left - 8,
      y + 4,
    );
  }
  ctx.textAlign = "center";
  ctx.fillText("x position [m]", left + b.pw / 2, h - 3);
  ctx.save();
  ctx.translate(13, top + b.ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("y position [m]", 0, 0);
  ctx.restore();
  function path(points, color, dashed = false) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.beginPath();
    points.forEach((p, i) => {
      const z = pos(p);
      if (!i) ctx.moveTo(...z);
      else ctx.lineTo(...z);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function marker(x, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = palette.truth;
    ctx.beginPath();
    ctx.arc(...pos(x), 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  function covariance(x, P, color, dashed) {
    const points = ellipsePoints(x.slice(0, 2), [P[0], P[1], P[4], P[5]]);
    path(points, color, dashed);
    ctx.fillStyle = color + "18";
    ctx.fill();
  }
  function arrow(a, z, color) {
    const start = pos(a),
      end = pos(z),
      length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length < 1) return;
    path([a, z], color);
    const dx = (end[0] - start[0]) / length,
      dy = (end[1] - start[1]) / length;
    ctx.beginPath();
    ctx.moveTo(...end);
    ctx.lineTo(end[0] - 8 * dx + 3 * dy, end[1] - 8 * dy - 3 * dx);
    ctx.lineTo(end[0] - 8 * dx - 3 * dy, end[1] - 8 * dy + 3 * dx);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, b.pw, b.ph);
  ctx.clip();
  const history = live.history.slice(0, liveCursor + 1);
  if (visible.trails)
    for (const key of ["truth", "prior", "posterior"])
      if (visible[key])
        path(
          history.map((r) => r[key]),
          palette[key],
          key === "prior",
        );
  for (const key of ["observer", "fir", "iir"]) {
    if (!visible[key] || !row.comparisons) continue;
    const position = (r) => r.comparisons[key].map((a) => a[0]);
    if (visible.trails) path(history.map(position), palette[key], true);
    marker(position(row), palette[key]);
  }
  if (visible.measurement)
    for (const r of history.slice(-80))
      if (!r.missing) {
        ctx.fillStyle = palette.measurement;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(...pos(r.y), 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
  if (visible.priorCov) covariance(row.prior, row.Pprior, palette.prior, true);
  if (visible.postCov)
    covariance(row.posterior, row.Ppost, palette.posterior, false);
  if (visible.truth) marker(row.truth, palette.truth);
  if (visible.prior) marker(row.prior, palette.prior);
  if (visible.posterior) marker(row.posterior, palette.posterior);
  if (visible.arrows) {
    arrow(row.prior, row.posterior, palette.posterior);
    arrow(
      row.truth,
      [
        row.truth[0] + row.applied[0] * row.mass * 0.2,
        row.truth[1] + row.applied[1] * row.mass * 0.2,
      ],
      palette.iir,
    );
  }
  ctx.restore();
  liveEquations();
  math("value-prior-x", String.raw`\hat{x}_k^-=${vector(row.prior)}`);
  math("value-prior-p", String.raw`P_k^-=${fullMatrix(row.Pprior, 4)}`);
  math(
    "value-y",
    String.raw`y_k=${row.missing ? String.raw`\varnothing` : vector(row.y)}`,
  );
  math(
    "value-rs",
    row.missing
      ? String.raw`r_k=\text{--},\quad S_k=\text{--}`
      : String.raw`\begin{aligned}r_k&=${vector(row.axisPost.map((a) => a.residual))}\\S_k&=${matrix([row.axisPost[0].S, 0, 0, row.axisPost[1].S])}\end{aligned}`,
  );
  math(
    "value-k",
    String.raw`K_k=${row.missing ? String.raw`\text{--}` : fullMatrix([row.axisPost[0].K[0], 0, 0, row.axisPost[1].K[0], row.axisPost[0].K[1], 0, 0, row.axisPost[1].K[1]], 2)}`,
  );
  math("value-x", String.raw`\hat{x}_k^+=${vector(row.posterior)}`);
  math("value-p", String.raw`P_k^+=${fullMatrix(row.Ppost, 4)}`);
  math("value-truth", String.raw`x_k=${vector(row.truth)}`);
  $("applied-force").textContent =
    `F = (${number(row.applied[0] * row.mass)}, ${number(row.applied[1] * row.mass)}) N`;
  $("numeric-stage").textContent = "";
  $("prediction-equations").classList.remove("active");
  $("update-equations").classList.toggle("active", !row.missing);
  $("update-equations").classList.toggle("absent", row.missing);
  for (const id of ["value-y", "value-rs", "value-k", "value-x", "value-p"])
    $(id).classList.remove("pending");
  $("status").textContent =
    `Live · k = ${row.k}${row.missing ? " · no measurement" : ""}`;
  $("status").style.color = palette.posterior;
  $("sim-time").textContent = `t = ${number(row.time)} s`;
  $("iteration").max = live.history.length;
  $("iteration").value = liveCursor + 1;
  $("iteration-value").textContent = `k = ${row.k}`;
  $("previous").disabled = liveCursor === 0;
  $("next").disabled = false;
  $("play").textContent = livePlaying ? "Pause" : "Play";
  if (!$("comparison").hidden) liveComparison(history);
}
function liveComparison(rows) {
  const { ctx, w, h } = canvasSetup($("comparison"));
  const keys = [
    "posterior",
    ...["observer", "fir", "iir"].filter((key) => visible[key]),
  ];
  const errors = rows.map((r) =>
      keys.map((key) =>
        Math.hypot(
          ...[0, 1].map(
            (j) =>
              (key === "posterior"
                ? r.posterior[j]
                : r.comparisons[key][j][0]) - r.truth[j],
          ),
        ),
      ),
    ),
    max = Math.max(1, ...errors.flat());
  ctx.font = "11px system-ui";
  for (const [j, key] of keys.entries()) {
    ctx.strokeStyle = palette[key];
    ctx.beginPath();
    errors.forEach((e, i) => {
      const x =
          40 +
          ((w - 60) * (rows[i].time - rows[0].time)) /
            Math.max(0.01, rows.at(-1).time - rows[0].time),
        y = 20 + (h - 40) * (1 - e[j] / max);
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = palette[key];
    const rmse = Math.sqrt(
      errors.reduce((s, e) => s + e[j] ** 2, 0) / errors.length,
    );
    ctx.fillText(
      `${key === "posterior" ? "KF" : key === "observer" ? "Luenberger" : key.toUpperCase()} RMSE ${rmse.toFixed(2)}`,
      40 + (j * (w - 50)) / keys.length,
      12,
    );
  }
  ctx.fillStyle = palette.truth;
  ctx.fillText("Position error [m] · last 8 seconds", 40, h - 2);
}
for (const id of ["play", "previous", "next", "reset", "outlier"])
  $(id).onclick = () => {
    if (demoMode !== "live") {
      stagedHandlers[id]();
      return;
    }
    if (id === "play") {
      livePlaying = !livePlaying;
      liveLast = undefined;
      if (livePlaying) liveCursor = live.history.length - 1;
    }
    if (id === "reset") liveReset();
    if (id === "previous") {
      livePlaying = false;
      liveCursor = Math.max(0, liveCursor - 1);
    }
    if (id === "next") {
      livePlaying = false;
      if (liveCursor < live.history.length - 1) liveCursor++;
      else {
        live.step();
        liveCursor = live.history.length - 1;
      }
    }
    if (id === "outlier") live.outlier = true;
    liveDraw();
  };
$("iteration").oninput = () => {
  if (demoMode !== "live") {
    stagedHandlers.iteration();
    return;
  }
  livePlaying = false;
  liveCursor = +$("iteration").value - 1;
  liveDraw();
};
$("state-plot").addEventListener("pointerdown", (event) => {
  if (demoMode !== "live") return;
  const rect = $("state-plot").getBoundingClientRect(),
    b = liveBounds;
  if (
    event.clientX - rect.left < b.left ||
    event.clientX - rect.left > b.left + b.pw ||
    event.clientY - rect.top < b.top ||
    event.clientY - rect.top > b.top + b.ph
  )
    return;
  const target = [
    b.xmin + ((event.clientX - rect.left - b.left) / b.pw) * (b.xmax - b.xmin),
    b.ymax - ((event.clientY - rect.top - b.top) / b.ph) * (b.ymax - b.ymin),
  ];
  live.applyForce(
    target.map((v, j) => v - live.truth[j]),
    +$("force-strength").value,
    +$("force-duration").value,
    $("force-type").value === "known",
  );
  liveDraw();
});
$("clear-forces").onclick = () => {
  live.forces = [];
  liveDraw();
};
for (const id of ["mass", "amplitude", "period", "damping"])
  $(id).addEventListener("input", () => liveParameters());
for (const id of ["height", "velocity", "pHeight", "pVelocity"])
  $(id).addEventListener("change", () => {
    if (demoMode === "live") liveParameters(true);
  });
$("demo-mode").onchange = () => {
  stop();
  demoMode = $("demo-mode").value;
  document.body.classList.toggle("live", demoMode === "live");
  $("live-controls").hidden = demoMode !== "live";
  $("scenario").options[1].textContent =
    demoMode === "live" ? "Gap: 4–6 s every 8 s" : "Gap: k = 11–15";
  $("scenario").options[2].textContent =
    demoMode === "live" ? "Outlier: every 8 s" : "Outlier: k = 12";
  $("plot-heading").textContent =
    demoMode === "live" ? "Live motion" : "State space";
  if (demoMode === "live") {
    $("dt").max = ".1";
    $("dt").value = ".02";
    $("dt").step = ".01";
    livePlaying = true;
    liveReset();
  } else {
    $("dt").max = "1";
    $("dt").value = ".15";
    $("iteration").max = "25";
    regenerate();
  }
  sliderValues();
};
$("demo-mode").onchange();
function liveAnimate(now) {
  if (demoMode === "live" && livePlaying) {
    if (liveLast !== undefined) {
      liveDebt += Math.min(0.25, (now - liveLast) / 1000) * +$("speed").value;
      while (liveDebt + 1e-12 >= live.p.dt) {
        live.step();
        liveDebt -= live.p.dt;
        liveCursor = live.history.length - 1;
      }
    }
    if (now - liveLastDraw >= 50) {
      liveDraw();
      liveLastDraw = now;
    }
  }
  liveLast = now;
  requestAnimationFrame(liveAnimate);
}
requestAnimationFrame(liveAnimate);
