/* Causal measurement filters and a predict/correct Luenberger observer.
   Cutoff is a fraction of Nyquist; FIR order N means N+1 taps. */
(function (root) {
  const defaults = {
    pole1: 0.85,
    pole2: 0.9,
    firType: "mean",
    firOrder: 10,
    firCutoff: 0.15,
    iirType: "butterworth",
    iirOrder: 2,
    iirCutoff: 0.15,
  };
  function firWeights(p) {
    const n = p.firOrder + 1;
    let w = Array.from({ length: n }, (_, i) => {
      if (p.firType === "mean") return 1;
      if (p.firType === "triangular") return Math.min(i + 1, n - i);
      const hann =
        n === 2 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      if (p.firType === "hann") return hann;
      const x = i - (n - 1) / 2;
      return (
        (Math.abs(x) < 1e-12
          ? p.firCutoff
          : Math.sin(Math.PI * p.firCutoff * x) / (Math.PI * x)) *
        (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)))
      );
    });
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / sum);
  }
  function sections(p) {
    if (p.iirType === "exponential") {
      // Set the full cascade, rather than each stage, to -3 dB at cutoff.
      const gain2 = 2 ** (-1 / p.iirOrder),
        c = 1 - gain2,
        b = -2 + 2 * gain2 * Math.cos(Math.PI * p.iirCutoff);
      const pole = (2 * c) / (-b + Math.sqrt(b * b - 4 * c * c)),
        a = 1 - pole;
      return Array.from({ length: p.iirOrder }, () => ({
        b: [a, 0, 0],
        a: [1, -(1 - a), 0],
      }));
    }
    const t = Math.tan((Math.PI * p.iirCutoff) / 2),
      result = [];
    if (p.iirOrder % 2)
      result.push({
        b: [t / (1 + t), t / (1 + t), 0],
        a: [1, (t - 1) / (t + 1), 0],
      });
    for (let k = 0; k < Math.floor(p.iirOrder / 2); k++) {
      const q = 1 / (2 * Math.sin(((2 * k + 1) * Math.PI) / (2 * p.iirOrder))),
        den = 1 + t / q + t * t;
      result.push({
        b: [(t * t) / den, (2 * t * t) / den, (t * t) / den],
        a: [1, (2 * (t * t - 1)) / den, (1 - t / q + t * t) / den],
      });
    }
    return result;
  }
  class ComparisonFilters {
    constructor(initial, settings = {}) {
      this.p = { ...defaults, ...settings };
      this.axes = initial.map((x) => ({
        observer: x.slice(),
        samples: [],
        lastFir: x[0],
        lastIir: x[0],
        stages: sections(this.p).map((c) => ({
          ...c,
          x: [x[0], x[0]],
          y: [x[0], x[0]],
        })),
      }));
      this.weights = firWeights(this.p);
    }
    step(measurements, dt, acceleration) {
      const outputs = { observer: [], fir: [], iir: [] };
      this.axes.forEach((axis, j) => {
        const predicted = [
          axis.observer[0] + dt * axis.observer[1],
          axis.observer[1] + dt * acceleration[j],
        ];
        const y = measurements[j];
        let fir = axis.lastFir,
          iir = axis.lastIir;
        if (y !== null) {
          const residual = y - predicted[0],
            { pole1: a, pole2: b } = this.p;
          // Eigenvalues of (I-LC)A are the selected discrete poles.
          predicted[0] += (1 - a * b) * residual;
          predicted[1] += ((1 + a * b - a - b) / dt) * residual;
          if (!axis.samples.length)
            axis.samples = Array(this.weights.length).fill(y);
          axis.samples.unshift(y);
          axis.samples.length = this.weights.length;
          fir = this.weights.reduce(
            (sum, w, i) => sum + w * axis.samples[i],
            0,
          );
          iir = y;
          for (const stage of axis.stages) {
            const z =
              stage.b[0] * iir +
              stage.b[1] * stage.x[0] +
              stage.b[2] * stage.x[1] -
              stage.a[1] * stage.y[0] -
              stage.a[2] * stage.y[1];
            stage.x = [iir, stage.x[0]];
            stage.y = [z, stage.y[0]];
            iir = z;
          }
        }
        axis.observer = predicted;
        outputs.observer.push(predicted);
        outputs.fir.push([fir, (fir - axis.lastFir) / dt]);
        outputs.iir.push([iir, (iir - axis.lastIir) / dt]);
        axis.lastFir = fir;
        axis.lastIir = iir;
      });
      return outputs;
    }
  }
  root.FilterComparison = { defaults, ComparisonFilters, firWeights, sections };
  if (typeof module !== "undefined") module.exports = root.FilterComparison;
})(typeof window !== "undefined" ? window : globalThis);
