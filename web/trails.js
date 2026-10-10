/* Trajectory styling only; timestamps are simulation seconds. */
(function (root) {
  const defaults = {
    trailLength: 8,
    trailHalfLife: 2,
    trailWidth: 1,
    trailDash: 4,
    trailGap: 4,
    trailStyle: "auto",
  };
  function clip(samples, now, settings) {
    const past = samples.filter((s) => s.time <= now);
    if (!settings.limitTrail || !past.length) return past;
    const cutoff = now - settings.trailLength;
    const first = past.findIndex((s) => s.time >= cutoff);
    if (first < 0) return [];
    const selected = past.slice(first);
    if (first > 0 && selected[0].time > cutoff) {
      const a = past[first - 1],
        b = selected[0],
        f = (cutoff - a.time) / (b.time - a.time);
      selected.unshift({
        time: cutoff,
        point: a.point.map((v, j) => v + f * (b.point[j] - v)),
      });
    }
    return selected;
  }
  function draw(
    ctx,
    samples,
    pos,
    now,
    settings,
    color,
    defaultDashed = false,
  ) {
    const rows = clip(samples, now, settings);
    if (rows.length < 2) return;
    const style =
      settings.trailStyle === "auto"
        ? defaultDashed
          ? "dashed"
          : "solid"
        : settings.trailStyle;
    const dash =
      style === "solid"
        ? []
        : style === "dotted"
          ? [1, settings.trailGap]
          : style === "dashdot"
            ? [settings.trailDash, settings.trailGap, 1, settings.trailGap]
            : [settings.trailDash, settings.trailGap];
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.trailWidth;
    ctx.lineCap = style === "dotted" ? "round" : "butt";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash);
    if (!settings.fadeTrail) {
      ctx.beginPath();
      rows.forEach((r, i) => {
        const p = pos(r.point);
        if (i) ctx.lineTo(...p);
        else ctx.moveTo(...p);
      });
      ctx.stroke();
    } else {
      let distance = 0;
      for (let i = 1; i < rows.length; i++) {
        const a = pos(rows[i - 1].point),
          b = pos(rows[i].point);
        ctx.globalAlpha =
          2 **
          (-Math.max(0, now - (rows[i - 1].time + rows[i].time) / 2) /
            settings.trailHalfLife);
        ctx.lineDashOffset = -distance;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    ctx.restore();
  }
  root.TrailRenderer = { defaults, clip, draw };
  if (typeof module !== "undefined") module.exports = root.TrailRenderer;
})(typeof window !== "undefined" ? window : globalThis);
