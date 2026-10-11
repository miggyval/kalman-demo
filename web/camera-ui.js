"use strict";
function cameraLabels() {
  $("viewRange-value").textContent =
    (2 * +$("viewRange").value).toFixed(0) + " m";
  $("recenterDuration-value").textContent =
    (+$("recenterDuration").value).toFixed(2) + " s";
  $("followLag-value").textContent = (+$("followLag").value).toFixed(2) + " s";
}
function setViewRange(value) {
  const input = $("viewRange");
  input.value = String(Math.min(+input.max, Math.max(+input.min, value)));
  cameraLabels();
  draw();
}
$("viewRange").addEventListener("input", () => {
  cameraLabels();
  draw();
});
$("recenterDuration").addEventListener("input", () => {
  cameraLabels();
  draw();
});
$("followLag").addEventListener("input", () => {
  cameraLabels();
  draw();
});
$("zoom-in").onclick = () => setViewRange(+$("viewRange").value / 1.2);
$("zoom-out").onclick = () => setViewRange(+$("viewRange").value * 1.2);
$("center-view").onclick = () => {
  if (demoMode === "live") {
    $("follow-object").checked = true;
    liveCamera.reset(live.history[liveCursor].truth);
    draw();
  }
};
$("reset-view").onclick = () => {
  if (demoMode === "live") {
    $("follow-object").checked = true;
    liveCamera.reset(live.origin);
    setViewRange(PlotCamera.defaults.viewRange);
  }
};
$("state-plot").addEventListener(
  "wheel",
  (event) => {
    if (demoMode !== "live") return;
    event.preventDefault();
    const delta =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
    setViewRange(
      +$("viewRange").value *
        Math.exp(Math.max(-0.3, Math.min(0.3, delta * 0.002))),
    );
  },
  { passive: false },
);
const cameraTouches = new Map();
let panStart = null,
  dragged = false,
  pinchDistance = 0,
  pinchRange = 0,
  pinchUsed = false;
function cameraTouchStart(event) {
  if (event.button !== undefined && event.button !== 0) return;
  cameraTouches.set(event.pointerId, [event.clientX, event.clientY]);
  $("state-plot").setPointerCapture(event.pointerId);
  if (cameraTouches.size === 1) {
    pinchUsed = false;
    dragged = false;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      center: [...liveCamera.center],
      bounds: { ...liveBounds },
    };
  }
  if (cameraTouches.size === 2) {
    pinchUsed = true;
    const [a, b] = [...cameraTouches.values()];
    pinchDistance = Math.hypot(a[0] - b[0], a[1] - b[1]);
    pinchRange = +$("viewRange").value;
  }
}
$("state-plot").addEventListener("pointermove", (event) => {
  if (demoMode !== "live" || !cameraTouches.has(event.pointerId)) return;
  cameraTouches.set(event.pointerId, [event.clientX, event.clientY]);
  if (cameraTouches.size === 1 && !pinchUsed && panStart) {
    const dx = event.clientX - panStart.x,
      dy = event.clientY - panStart.y;
    if (Math.hypot(dx, dy) > 5) dragged = true;
    if (dragged) {
      $("follow-object").checked = false;
      const b = panStart.bounds;
      liveCamera.reset([
        panStart.center[0] - (dx * (b.xmax - b.xmin)) / b.pw,
        panStart.center[1] + (dy * (b.ymax - b.ymin)) / b.ph,
      ]);
      draw();
    }
  }
  if (cameraTouches.size === 2 && pinchDistance > 0) {
    const [a, b] = [...cameraTouches.values()],
      distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (distance > 0) setViewRange((pinchRange * pinchDistance) / distance);
  }
});
function endCameraTouch(event, cancelled = false) {
  if (!cameraTouches.has(event.pointerId)) return;
  if (!pinchUsed && !dragged && !cancelled && demoMode === "live")
    applyPlotForce(event);
  cameraTouches.delete(event.pointerId);
  if (cameraTouches.size < 2) pinchDistance = 0;
}
$("state-plot").addEventListener("pointerup", (event) => endCameraTouch(event));
$("state-plot").addEventListener("pointercancel", (event) =>
  endCameraTouch(event, true),
);
$("state-plot").addEventListener("lostpointercapture", (event) =>
  endCameraTouch(event, true),
);
cameraLabels();

$("follow-object").addEventListener("change", () => {
  liveCamera.reset(liveCamera.center);
  draw();
});
