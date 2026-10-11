/* External force in N, evaluated at arbitrary simulation times. No renderer or RNG state. */
(function (root) {
  const defaults = {
    windEnabled: false,
    windProfile: "quintic",
    windMode: "step",
    windStart: 2,
    windDuration: 2,
    windHold: 2,
    windRepeat: false,
    windInterval: 10,
    windA: 2,
    windC: 1,
    windAmplitude: 3,
    windAngle: 35,
    windMeanX: 0.5,
    windMeanY: 0,
    windTurbulence: true,
    windNoiseAmplitude: 0.65,
    windRate: 0.8,
    windSeed: 12,
  };
  const profiles = [
    ["hard", "Instantaneous"],
    ["first", "First-order"],
    ["second", "Critical second-order"],
    ["tanh", "Original tanh"],
    ["normalized", "Normalised tanh"],
    ["quintic", "Quintic"],
  ];
  const smooth = (u) =>
    u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 + u * (-15 + 6 * u));
  function response(id, s, p) {
    if (s < 0) return 0;
    if (id === "hard") return 1;
    if (id === "first") return -Math.expm1((-3 * s) / p.windDuration);
    if (id === "second") {
      const z = (4.75 * s) / p.windDuration;
      return 1 - (1 + z) * Math.exp(-z);
    }
    if (id === "tanh") return (1 + Math.tanh(p.windA * (s - p.windC))) / 2;
    if (id === "normalized") {
      if (s <= 0) return 0;
      const z = Math.tanh(p.windA * p.windC);
      return (Math.tanh(p.windA * (s - p.windC)) + z) / (1 + z);
    }
    return smooth(s / p.windDuration);
  }
  function shape(t, p, id = p.windProfile) {
    const pulse = (elapsed) =>
      response(id, elapsed, p) -
      response(id, elapsed - p.windDuration - p.windHold, p);
    const elapsed = t - p.windStart;
    if (p.windMode !== "pulse") return response(id, elapsed, p);
    if (!p.windRepeat || elapsed < 0) return pulse(elapsed);
    const interval = Math.max(p.windInterval, 2 * p.windDuration + p.windHold);
    // Keep the asymptotic tails until they are below floating-point precision.
    const tail = Math.max(
      16 * p.windDuration + p.windHold,
      20 / p.windA + p.windC + p.windDuration + p.windHold,
    );
    const last = Math.floor(elapsed / interval);
    const first = Math.max(0, Math.ceil((elapsed - tail) / interval));
    let level = 0;
    for (let k = first; k <= last; k++) level += pulse(elapsed - k * interval);
    return level;
  }
  function hash(n, seed) {
    let x = Math.imul(n + Math.imul(seed, 374761393), 668265263);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, seed) {
    const i = Math.floor(x),
      f = x - i,
      u = smooth(f),
      g0 = 2 * hash(i, seed) - 1,
      g1 = 2 * hash(i + 1, seed) - 1;
    return 3 * (g0 * f * (1 - u) + g1 * (f - 1) * u);
  }
  class Generator {
    constructor(p = {}) {
      this.p = { ...defaults, ...p };
      this.starts = [{ time: -Infinity, start: this.p.windStart }];
    }
    trigger(time) {
      this.starts.push({ time, start: time });
    }
    parametersAt(time) {
      const epoch = this.starts.findLast((entry) => entry.time <= time);
      return { ...this.p, windStart: epoch.start };
    }
    sample(time) {
      const p = this.parametersAt(time);
      if (!p.windEnabled)
        return { force: [0, 0], gust: [0, 0], turbulence: [0, 0], shape: 0 };
      const level = shape(time, p),
        angle = (p.windAngle * Math.PI) / 180;
      const gust = [Math.cos(angle), Math.sin(angle)].map(
        (v) => v * p.windAmplitude * level,
      );
      const turbulence = [p.windSeed, p.windSeed + 313].map((seed) =>
        p.windTurbulence
          ? p.windNoiseAmplitude * noise(time * p.windRate, seed) || 0
          : 0,
      );
      return {
        force: [p.windMeanX, p.windMeanY].map(
          (v, j) => v + gust[j] + turbulence[j],
        ),
        gust,
        turbulence,
        shape: level,
      };
    }
  }
  root.WindModel = {
    defaults,
    profiles,
    smooth,
    response,
    shape,
    noise,
    Generator,
  };
  if (typeof module !== "undefined") module.exports = root.WindModel;
})(typeof window !== "undefined" ? window : globalThis);
