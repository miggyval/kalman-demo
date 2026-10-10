/* Fixed zoom, edge dead zone and finite quintic recentering in simulation time. */
(function (root) {
  const defaults = { viewRange: 25, followLag: 0.75, recenterDuration: 1.5 };
  const quintic = (u) =>
    u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 + u * (-15 + 6 * u));
  class Camera {
    constructor(center = [0, 0]) {
      this.reset(center);
    }
    reset(center) {
      this.center = center.slice(0, 2);
      this.lastTime = null;
      this.edgeSince = null;
      this.move = null;
    }
    update(target, hx, hy, time, delay, duration = defaults.recenterDuration) {
      if (this.lastTime !== null && time < this.lastTime) {
        this.edgeSince = null;
        this.move = null;
      }
      this.lastTime = time;
      if (this.move) {
        const u = (time - this.move.time) / this.move.duration,
          s = quintic(u);
        this.center = this.move.from.map(
          (v, j) => v + s * (this.move.to[j] - v),
        );
        if (u >= 1) this.move = null;
        return this.center;
      }
      const distance = Math.max(
        Math.abs(target[0] - this.center[0]) / hx,
        Math.abs(target[1] - this.center[1]) / hy,
      );
      if (distance >= 0.7) {
        if (this.edgeSince === null) this.edgeSince = time;
        if (time - this.edgeSince >= delay) {
          this.move = {
            from: this.center.slice(),
            to: target.slice(0, 2),
            time,
            duration,
          };
          this.edgeSince = null;
        }
      } else this.edgeSince = null;
      return this.center;
    }
  }
  root.PlotCamera = { defaults, Camera, quintic };
  if (typeof module !== "undefined") module.exports = root.PlotCamera;
})(typeof window !== "undefined" ? window : globalThis);
