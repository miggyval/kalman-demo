"use strict";
const $ = (id) => document.getElementById(id),
  Lab = KalmanLab;
const palette = {
  truth: "#f2eee5",
  prior: "#8cbfe8",
  posterior: "#c7a0ef",
  measurement: "#9391a2",
  iir: "#f9b86b",
  sma: "#7bbfac",
  fir: "#7bbfac",
  observer: "#ef8faa",
  grid: "#332c3c",
  muted: "#b4aabb",
  border: "#63556f",
  background: "#17131d",
};
const visible = {
  truth: true,
  prior: true,
  posterior: true,
  priorCov: true,
  postCov: true,
  measurement: true,
  arrows: true,
  trails: true,
  observer: true,
  fir: true,
  iir: true,
};
const visibilityLabels = {
  truth: "True state",
  prior: "Prediction",
  posterior: "Update",
  priorCov: "P− ellipse",
  postCov: "P+ ellipse",
  measurement: "Measurement",
  arrows: "Arrows",
  trails: "Trails",
  observer: "Luenberger",
  fir: "FIR",
  iir: "IIR",
};
for (const [key, label] of Object.entries(visibilityLabels)) {
  const wrapper = document.createElement("label"),
    input = document.createElement("input");
  if (["observer", "fir", "iir"].includes(key)) wrapper.className = key;
  input.type = "checkbox";
  input.checked = true;
  input.id = "show-" + key;
  input.addEventListener("change", () => {
    visible[key] = input.checked;
    if (demoMode === "staged" && simulation) calculateBounds();
    draw();
  });
  wrapper.append(input, document.createTextNode(label));
  $("visibility").append(wrapper);
}
let demoMode = "staged";
let simulation,
  phase = 0,
  progress = 0,
  playing = false,
  previousTime,
  bounds,
  outlierAt = 0;
const number = (v) => (Math.abs(v) < 0.0005 ? "0.000" : v.toFixed(3));
const vector = (v) =>
  String.raw`\begin{bmatrix}${v.map(number).join(String.raw`\\`)}\end{bmatrix}`;
const matrix = (p) =>
  String.raw`\begin{bmatrix}${number(p[0])}&${number(p[1])}\\${number(p[2])}&${number(p[3])}\end{bmatrix}`;
function math(id, tex) {
  const element = $(id);
  if (element.dataset.tex === tex) return;
  katex.render(tex, element, {
    displayMode: true,
    throwOnError: true,
    strict: "error",
  });
  element.dataset.tex = tex;
}
function equations() {
  const p = simulation.parameters,
    f = simulation.filterParameters;
  math(
    "model-equations",
    String.raw`x_{k+1}=Ax_k+Bu_k+Gw_k,\quad y_k=Cx_k+\nu_k`,
  );
  math(
    "model-matrices",
    String.raw`A=\begin{bmatrix}1&\Delta t\\0&1\end{bmatrix},\quad B=G=\begin{bmatrix}0\\\Delta t\end{bmatrix},\quad C=\begin{bmatrix}1&0\end{bmatrix}`,
  );
  math(
    "noise-equations",
    String.raw`u_k=-g,\quad Q=\sigma_w^2=${number(f.processStd ** 2)},\quad R=\sigma_\nu^2=${number(f.sensorStd ** 2)}`,
  );
  math("predict-x", String.raw`\hat{x}_k^-=A\hat{x}_{k-1}^++Bu_{k-1}`);
  math("predict-p", String.raw`P_k^-=AP_{k-1}^+A^T+GQG^T`);
  math("update-rs", String.raw`r_k=y_k-C\hat{x}_k^-,\qquad S_k=CP_k^-C^T+R`);
  math("update-k", String.raw`K_k=P_k^-C^TS_k^{-1}`);
  math("update-x", String.raw`\hat{x}_k^+=\hat{x}_k^-+K_kr_k`);
  math(
    "update-p",
    String.raw`\begin{aligned}P_k^+={}&(I-K_kC)P_k^-(I-K_kC)^T\\&+K_kRK_k^T\end{aligned}`,
  );
}
function canvasSetup(canvas) {
  const r = canvas.getBoundingClientRect(),
    scale = devicePixelRatio || 1,
    w = r.width,
    h = r.height;
  if (
    canvas.width !== Math.round(w * scale) ||
    canvas.height !== Math.round(h * scale)
  ) {
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function ellipsePoints(x, P) {
  const { eigenvalues, eigenvectors } = Lab.ellipse(P);
  return Array.from({ length: 81 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 80,
      a = Math.sqrt(eigenvalues[0]) * Math.cos(angle),
      b = Math.sqrt(eigenvalues[1]) * Math.sin(angle);
    return [
      x[0] + a * eigenvectors[0][0] + b * eigenvectors[1][0],
      x[1] + a * eigenvectors[0][1] + b * eigenvectors[1][1],
    ];
  });
}
function calculateBounds() {
  const points = [simulation.initial.truth];
  for (const row of simulation.rows) {
    points.push(
      row.truth,
      ...ellipsePoints(row.prior.x, row.prior.P),
      ...ellipsePoints(row.posterior.x, row.posterior.P),
    );
    if (row.comparisons)
      for (const [key, axes] of Object.entries(row.comparisons))
        if (visible[key]) points.push(axes[0]);
    if (row.y !== null) points.push([row.y, row.truth[1]]);
  }
  const hs = points.map((p) => p[0]),
    vs = points.map((p) => p[1]);
  const hmin = Math.min(...hs),
    hmax = Math.max(...hs),
    vmin = Math.min(...vs),
    vmax = Math.max(...vs),
    hp = Math.max(5, (hmax - hmin) * 0.12),
    vp = Math.max(2, (vmax - vmin) * 0.12);
  bounds = {
    hmin: hmin - hp,
    hmax: hmax + hp,
    vmin: vmin - vp,
    vmax: vmax + vp,
  };
}
function plot() {
  const { ctx, w, h } = canvasSetup($("state-plot")),
    left = 66,
    right = 20,
    top = 18,
    bottom = 46,
    pw = w - left - right,
    ph = h - top - bottom;
  const pos = (x) => [
    left + ((x[1] - bounds.vmin) / (bounds.vmax - bounds.vmin)) * pw,
    top + ((bounds.hmax - x[0]) / (bounds.hmax - bounds.hmin)) * ph,
  ];
  const frame = Lab.frame(simulation, phase, progress),
    row = frame.row;
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const hh = bounds.hmin + ((bounds.hmax - bounds.hmin) * i) / 5,
      vv = bounds.vmin + ((bounds.vmax - bounds.vmin) * i) / 5;
    const [vx, hy] = pos([hh, vv]);
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, hy);
    ctx.lineTo(w - right, hy);
    ctx.moveTo(vx, top);
    ctx.lineTo(vx, h - bottom);
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "right";
    ctx.fillText(hh.toFixed(1), left - 9, hy);
    ctx.textAlign = "center";
    ctx.fillText(vv.toFixed(1), vx, h - bottom + 17);
  }
  ctx.strokeStyle = palette.border;
  ctx.strokeRect(left, top, pw, ph);
  ctx.fillStyle = palette.truth;
  ctx.textAlign = "center";
  ctx.fillText("Vertical velocity, v [m/s]", left + pw / 2, h - 10);
  ctx.save();
  ctx.translate(16, top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Height, h [m]", 0, 0);
  ctx.restore();
  function path(points, color, dashed = false, width = 1.5) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = pos(p);
      if (i === 0) ctx.moveTo(...q);
      else ctx.lineTo(...q);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function covariance(x, P, color, dashed) {
    const points = ellipsePoints(x, P);
    path(points, color, dashed);
    ctx.fillStyle = color + "12";
    ctx.fill();
  }
  function marker(x, color, shape) {
    const [a, b] = pos(x);
    ctx.fillStyle = palette.background;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (shape === "square") ctx.rect(a - 4, b - 4, 8, 8);
    else if (shape === "diamond") {
      ctx.moveTo(a, b - 5);
      ctx.lineTo(a + 5, b);
      ctx.lineTo(a, b + 5);
      ctx.lineTo(a - 5, b);
      ctx.closePath();
    } else ctx.arc(a, b, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  function arrow(from, to, color) {
    const a = pos(from),
      b = pos(to),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (length < 1) return;
    path([from, to], color, false, 2);
    const ux = dx / length,
      uy = dy / length;
    ctx.beginPath();
    ctx.moveTo(...b);
    ctx.lineTo(b[0] - 8 * ux + 3 * uy, b[1] - 8 * uy - 3 * ux);
    ctx.lineTo(b[0] - 8 * ux - 3 * uy, b[1] - 8 * uy + 3 * ux);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, pw, ph);
  ctx.clip();
  const past = simulation.rows.slice(0, row.k - 1);
  if (visible.trails) {
    if (visible.truth)
      path(
        [simulation.initial.truth, ...past.map((r) => r.truth), frame.truth],
        palette.truth,
        false,
        1,
      );
    if (visible.posterior)
      path(
        [
          simulation.initial.x,
          ...past.map((r) => r.posterior.x),
          ...(frame.prediction ? [] : [frame.x]),
        ],
        palette.posterior,
        false,
        1,
      );
    if (visible.prior && past.length)
      path(
        past.map((r) => r.prior.x),
        palette.prior,
        true,
        1,
      );
  }
  if (visible.measurement && row.y !== null && !frame.prediction)
    path(
      [
        [row.y, bounds.vmin],
        [row.y, bounds.vmax],
      ],
      palette.measurement,
      true,
    );
  if (visible.priorCov)
    covariance(
      frame.prediction ? frame.x : row.prior.x,
      frame.prediction ? frame.P : row.prior.P,
      palette.prior,
      true,
    );
  if (visible.postCov)
    covariance(
      frame.prediction ? row.previous.x : frame.x,
      frame.prediction ? row.previous.P : frame.P,
      palette.posterior,
      false,
    );
  if (visible.arrows) {
    arrow(
      row.previous.x,
      frame.prediction ? frame.x : row.prior.x,
      palette.prior,
    );
    if (!frame.prediction && row.y !== null)
      arrow(row.prior.x, frame.x, palette.posterior);
  }
  if (visible.prior)
    marker(frame.prediction ? frame.x : row.prior.x, palette.prior, "square");
  if (visible.posterior)
    marker(
      frame.prediction ? row.previous.x : frame.x,
      palette.posterior,
      "diamond",
    );
  if (visible.truth) marker(frame.truth, palette.truth, "circle");
  for (const key of ["observer", "fir", "iir"]) {
    if (!visible[key]) continue;
    const index = Math.floor(phase / 2) - (frame.prediction ? 1 : 0);
    const sample = simulation.rows[index];
    if (!sample?.comparisons) {
      if (simulation.rows[0].comparisons)
        marker(simulation.initial.x, palette[key], "square");
      continue;
    }
    if (visible.trails)
      path(
        simulation.rows.slice(0, index + 1).map((r) => r.comparisons[key][0]),
        palette[key],
        true,
      );
    marker(sample.comparisons[key][0], palette[key], "square");
  }
  ctx.restore();
}
function numbers() {
  const f = Lab.frame(simulation, phase, progress),
    r = f.row;
  const prior = f.prediction ? { x: f.x, P: f.P } : r.prior;
  const completed = !f.prediction;
  const posterior = completed ? { x: f.x, P: f.P } : null;
  math("value-prior-x", String.raw`\hat{x}_k^-=${vector(prior.x)}`);
  math("value-prior-p", String.raw`P_k^-=${matrix(prior.P)}`);
  math(
    "value-y",
    String.raw`y_k=${completed ? (r.y === null ? String.raw`\varnothing` : number(r.y)) : String.raw`\text{--}`}`,
  );
  math(
    "value-rs",
    String.raw`\begin{aligned}r_k&=${completed && r.y !== null ? number(r.posterior.residual) : String.raw`\text{--}`}\\S_k&=${completed && r.y !== null ? number(r.posterior.S) : String.raw`\text{--}`}\end{aligned}`,
  );
  math(
    "value-k",
    String.raw`K_k=${completed && r.y !== null ? vector(r.posterior.K) : String.raw`\text{--}`}`,
  );
  math(
    "value-x",
    String.raw`\hat{x}_k^+=${posterior ? vector(posterior.x) : String.raw`\text{--}`}`,
  );
  math(
    "value-p",
    String.raw`P_k^+=${posterior ? matrix(posterior.P) : String.raw`\text{--}`}`,
  );
  math("value-truth", String.raw`x_k=${vector(f.truth)}`);
  $("numeric-stage").textContent =
    progress < 1 ? `${Math.round(progress * 100)}%` : "";
  for (const id of ["value-y", "value-rs", "value-k", "value-x", "value-p"])
    $(id).classList.toggle("pending", !completed);
  $("prediction-equations").classList.toggle("active", f.prediction);
  $("update-equations").classList.toggle(
    "active",
    !f.prediction && r.y !== null,
  );
  $("update-equations").classList.toggle("absent", r.y === null);
  const stage = f.prediction
    ? "Prediction"
    : r.y === null
      ? "Measurement update · no measurement"
      : "Measurement update";
  $("status").textContent = `k = ${r.k} · ${stage}`;
  $("status").style.color = f.prediction ? palette.prior : palette.posterior;
  $("iteration").value = r.k;
  $("iteration-value").textContent = `${r.k} / ${simulation.rows.length}`;
  $("sim-time").textContent =
    `t = ${number(f.prediction ? (r.k - 1 + progress) * simulation.parameters.dt : r.time)} s`;
  $("previous").disabled = phase === 0 && progress === 0;
  $("next").disabled =
    phase === simulation.rows.length * 2 - 1 && progress === 1;
}
function comparison() {
  if ($("comparison").hidden) return;
  const f = Lab.frame(simulation, phase, progress);
  const { ctx, w, h } = canvasSetup($("comparison")),
    rows = simulation.rows.slice(0, Math.floor(phase / 2));
  if (!f.prediction)
    rows.push({ ...f.row, posterior: { x: f.x }, truth: f.truth });
  const all = [
      simulation.initial.truth[0],
      ...rows.flatMap((r) => [
        r.truth[0],
        r.posterior.x[0],
        ...(r.comparisons
          ? Object.values(r.comparisons).map((a) => a[0][0])
          : [r.iir, r.sma]),
      ]),
    ],
    lo = Math.min(...all) - 2,
    hi = Math.max(...all) + 2;
  const pos = (r, v) => [
    50 + ((w - 70) * r.k) / simulation.rows.length,
    12 + ((h - 38) * (hi - v)) / (hi - lo),
  ];
  ctx.font = "11px system-ui";
  ctx.fillStyle = palette.truth;
  ctx.fillText("Height [m]", 8, 12);
  ctx.fillText(
    `t [s]   0 — ${number(simulation.rows.at(-1).time)}`,
    w / 2 - 40,
    h - 3,
  );
  for (const [key, color, get] of [
    ["True", palette.truth, (r) => r.truth[0]],
    ["KF", palette.posterior, (r) => r.posterior.x[0]],
    ...["observer", "fir", "iir"]
      .filter((key) => visible[key] && rows[0]?.comparisons)
      .map((key) => [
        key === "observer" ? "Luenberger" : key.toUpperCase(),
        palette[key],
        (r) => r.comparisons[key][0][0],
      ]),
  ]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    rows.forEach((r, i) => {
      const p = pos(r, get(r));
      if (i === 0) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(
      key,
      w - 330 + ["True", "KF", "Luenberger", "FIR", "IIR"].indexOf(key) * 65,
      12,
    );
  }
}
function draw() {
  if (typeof drawPolePlot === "function") drawPolePlot();
  if (demoMode === "live" && typeof liveDraw === "function") {
    liveDraw();
    return;
  }
  if (!simulation) return;
  plot();
  numbers();
  comparison();
}
function stop() {
  playing = false;
  $("play").textContent = "Play";
}
function regenerate(keepPosition = false) {
  if (demoMode === "live" && typeof liveParameters === "function") {
    liveParameters();
    return;
  }
  if (
    !$("parameters").checkValidity() ||
    !$("assumedProcess").checkValidity() ||
    !$("assumedSensor").checkValidity()
  )
    return;
  const parameters = {};
  for (const key of [
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
  ])
    parameters[key] = +$(key).value;
  parameters.matched = $("matched").checked;
  parameters.scenario = $("scenario").value;
  parameters.outlierAt = outlierAt;
  const generated = Lab.generate(parameters);
  stop();
  simulation = generated;
  if (typeof prepareStagedFilters === "function") prepareStagedFilters();
  if (!keepPosition) {
    phase = 0;
    progress = 0;
  }
  calculateBounds();
  equations();
  draw();
}
$("play").onclick = () => {
  if (playing) {
    stop();
    return;
  }
  if (phase === simulation.rows.length * 2 - 1 && progress === 1) {
    phase = 0;
    progress = 0;
  } else if (progress === 1) {
    phase++;
    progress = 0;
  }
  playing = true;
  previousTime = undefined;
  $("play").textContent = "Pause";
};
$("next").onclick = () => {
  stop();
  if (progress < 1) progress = 1;
  else if (phase < simulation.rows.length * 2 - 1) {
    phase++;
    progress = 1;
  }
  draw();
};
$("previous").onclick = () => {
  stop();
  if (progress > 0 && phase === 0) progress = 0;
  else if (phase > 0) {
    phase--;
    progress = 1;
  }
  draw();
};
$("reset").onclick = () => {
  stop();
  phase = 0;
  progress = 0;
  draw();
};
$("iteration").oninput = () => {
  stop();
  phase = 2 * (+$("iteration").value - 1) + 1;
  progress = 1;
  draw();
};
$("parameters").onsubmit = (e) => e.preventDefault();
$("parameters").addEventListener("input", () => regenerate());
for (const id of ["assumedProcess", "assumedSensor"])
  $(id).addEventListener("input", () => regenerate());
$("matched").onchange = () => {
  for (const id of ["assumedProcess", "assumedSensor"])
    $(id).disabled = $("matched").checked;
  regenerate();
};
$("scenario").onchange = () => {
  outlierAt = 0;
  regenerate();
};
$("outlier").onclick = () => {
  outlierAt = Math.floor(phase / 2) + 1;
  phase = 2 * (outlierAt - 1) + 1;
  progress = 1;
  regenerate(true);
};
$("compare").onchange = () => {
  $("comparison").hidden = !$("compare").checked;
  draw();
};
window.addEventListener("resize", draw);
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "BUTTON"].includes(e.target.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    $("play").click();
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    $("next").click();
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    $("previous").click();
  }
});
regenerate();
function animate(now) {
  if (playing) {
    if (previousTime !== undefined) {
      let remaining =
        Math.min(0.25, (now - previousTime) / 1000) * +$("speed").value;
      const stageDuration = simulation.parameters.dt / 2;
      while (remaining > 0 && playing) {
        const amount = Math.min(remaining, (1 - progress) * stageDuration);
        progress = Math.min(1, progress + amount / stageDuration);
        remaining -= amount;
        if (progress >= 1 - 1e-10) {
          progress = 1;
          if (phase === simulation.rows.length * 2 - 1) stop();
          else {
            phase++;
            progress = 0;
          }
        } else break;
      }
    }
    draw();
  }
  previousTime = now;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
