"use strict";
const poleCanvas = $("pole-map");
let poleDrag = null;
function poleGeometry(w, h) {
  return { cx: w / 2, cy: h / 2, scale: Math.max(1, Math.min(w, h) / 2 - 22) };
}
function drawPolePlot() {
  const { points } = FilterComparison.observerPoles(filterSettings());
  $("pole-readout").textContent = points
    .map(
      ([re, im], i) =>
        `z${i + 1} = ${re.toFixed(2)}${Math.abs(im) < 1e-10 ? "" : ` ${im < 0 ? "−" : "+"} ${Math.abs(im).toFixed(2)}j`}`,
    )
    .join(" · ");
  if (poleCanvas.hidden) return;
  const { ctx, w, h } = canvasSetup(poleCanvas),
    { cx, cy, scale } = poleGeometry(w, h);
  ctx.font = "10px system-ui";
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.grid;
  ctx.beginPath();
  ctx.moveTo(10, cy);
  ctx.lineTo(w - 10, cy);
  ctx.moveTo(cx, 10);
  ctx.lineTo(cx, h - 10);
  ctx.stroke();
  ctx.strokeStyle = palette.muted;
  ctx.beginPath();
  ctx.arc(cx, cy, scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = palette.observer;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 0.99, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "center";
  ctx.fillText("−1", cx - scale, cy + 13);
  ctx.fillText("1", cx + scale, cy + 13);
  ctx.fillText("Re", w - 12, cy - 5);
  ctx.fillText("Im", cx + 12, 12);
  ctx.fillText("|z| = 1", cx, h - 5);
  points.forEach(([re, im], i) => {
    const x = cx + re * scale,
      y = cy - im * scale;
    ctx.strokeStyle = palette.observer;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.stroke();
    ctx.fillStyle = palette.observer;
    ctx.textAlign = "left";
    ctx.fillText(`z${i + 1}`, x + 6, y + (i ? 12 : -6));
  });
}
function setPolePoint(re, im, index = 0, dragging = false) {
  if ($("poleType").value === "real") {
    const other = +$("pole" + (2 - index)).value;
    const x = Math.max(-0.99, Math.min(0.99, re));
    // Separate real poles move on the real axis. A nearby pair can bifurcate.
    if (
      dragging &&
      Math.abs(x - other) <= 0.05 + 1e-10 &&
      Math.abs(im) > 0.04
    ) {
      $("poleType").value = "complex";
      re = (x + other) / 2;
    } else {
      $("pole" + (index + 1)).value = x.toFixed(2);
      configureFilters({ target: $("poleType") });
      return;
    }
  }
  if (dragging && Math.abs(im) <= 0.025) {
    $("poleType").value = "real";
    $("pole1").value = $("pole2").value = Math.max(
      -0.99,
      Math.min(0.99, re),
    ).toFixed(2);
  } else {
    $("poleRadius").value = Math.min(0.99, Math.hypot(re, im)).toFixed(2);
    $("poleAngle").value = (
      (Math.atan2(Math.abs(im), re) * 180) /
      Math.PI
    ).toFixed(0);
  }
  configureFilters({ target: $("poleType") });
}
function polePointer(event) {
  const rect = poleCanvas.getBoundingClientRect(),
    { cx, cy, scale } = poleGeometry(rect.width, rect.height);
  return [
    (event.clientX - rect.left - cx) / scale,
    (cy - event.clientY + rect.top) / scale,
  ];
}
poleCanvas.addEventListener("pointerdown", (event) => {
  const [re, im] = polePointer(event),
    points = FilterComparison.observerPoles(filterSettings()).points;
  poleDrag =
    Math.hypot(re - points[0][0], im - points[0][1]) <=
    Math.hypot(re - points[1][0], im - points[1][1])
      ? 0
      : 1;
  poleCanvas.setPointerCapture(event.pointerId);
  setPolePoint(re, im, poleDrag, true);
});
poleCanvas.addEventListener("pointermove", (event) => {
  if (poleDrag !== null) setPolePoint(...polePointer(event), poleDrag, true);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  poleCanvas.addEventListener(event, () => {
    poleDrag = null;
  });
poleCanvas.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return;
  event.preventDefault();
  event.stopPropagation();
  const i = event.shiftKey ? 1 : 0,
    [re, im] = FilterComparison.observerPoles(filterSettings()).points[i];
  setPolePoint(
    re +
      (event.key === "ArrowRight"
        ? 0.01
        : event.key === "ArrowLeft"
          ? -0.01
          : 0),
    im +
      (event.key === "ArrowUp" ? 0.01 : event.key === "ArrowDown" ? -0.01 : 0),
    i,
  );
});
$("show-pole-map").addEventListener("change", () => {
  poleCanvas.hidden = !$("show-pole-map").checked;
  drawPolePlot();
});
window.addEventListener("resize", drawPolePlot);
drawPolePlot();
