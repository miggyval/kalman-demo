/* Two-state forward Euler model; all stages are generated once, seed 7. */
(function (root) {
  const defaults = {
    dt: 0.15,
    processStd: 2,
    sensorStd: 3,
    height: 100,
    velocity: 0,
    gravity: 9.81,
    pHeight: 25,
    pVelocity: 16,
    iterations: 25,
    seed: 7,
    assumedProcess: 2,
    assumedSensor: 3,
  };
  function generator(seed = 7) {
    return () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return (seed + 0.5) / 4294967296;
    };
  }
  function predict(x, P, p) {
    const d = p.dt,
      [a, b, c, e] = P;
    return {
      x: [x[0] + d * x[1], x[1] - d * p.gravity],
      P: [
        a + d * (b + c) + d * d * e,
        b + d * e,
        c + d * e,
        e + d * d * p.processStd ** 2,
      ],
    };
  }
  function update(prior, y, p) {
    const [a, b, c, e] = prior.P,
      R = p.sensorStd ** 2;
    const residual = y - prior.x[0],
      S = a + R,
      K = [a / S, c / S],
      u = 1 - K[0];
    const x = [prior.x[0] + K[0] * residual, prior.x[1] + K[1] * residual];
    // Joseph form: (I-KC) P (I-KC)^T + K R K^T.
    const p00 = u * u * a + K[0] * K[0] * R;
    const p01 = u * (b - K[1] * a) + K[0] * K[1] * R;
    const p10 = u * (c - K[1] * a) + K[0] * K[1] * R;
    const p11 = e - K[1] * (b + c) + K[1] * K[1] * (a + R);
    const off = (p01 + p10) / 2;
    return { x, P: [p00, off, off, p11], residual, S, K };
  }
  function generate(parameters = {}) {
    const p = {
      ...defaults,
      matched: true,
      scenario: "normal",
      outlierAt: 0,
      ...parameters,
    };
    for (const key of Object.keys(defaults))
      if (!Number.isFinite(p[key])) throw new Error(`${key} must be finite`);
    if (
      p.assumedProcess < 0 ||
      p.assumedSensor <= 0 ||
      p.dt <= 0 ||
      p.sensorStd <= 0 ||
      p.processStd < 0 ||
      p.pHeight < 0 ||
      p.pVelocity < 0 ||
      p.gravity < 0 ||
      !Number.isInteger(p.iterations) ||
      p.iterations < 1 ||
      p.iterations > 100
    )
      throw new Error("Invalid simulation parameters");
    const random = generator(p.seed),
      normal = () =>
        Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    let truth = [p.height, p.velocity],
      estimate = truth.slice(),
      P = [p.pHeight, 0, 0, p.pVelocity];
    const initial = { truth: truth.slice(), x: estimate.slice(), P: P.slice() };
    const rows = [];
    const filterParameters = {
      ...p,
      processStd: p.matched ? p.processStd : p.assumedProcess,
      sensorStd: p.matched ? p.sensorStd : p.assumedSensor,
    };
    let iir = p.height,
      sma = p.height;
    const samples = [];
    for (let k = 1; k <= p.iterations; k++) {
      const previous = {
        truth: truth.slice(),
        x: estimate.slice(),
        P: P.slice(),
      };
      const w = p.processStd * normal();
      truth = [
        truth[0] + p.dt * truth[1],
        truth[1] - p.dt * p.gravity + p.dt * w,
      ];
      const raw = truth[0] + p.sensorStd * normal();
      const missing = p.scenario === "dropout" && k >= 11 && k <= 15;
      const spike = k === p.outlierAt || (p.scenario === "outlier" && k === 12);
      const y = missing
        ? null
        : raw + (spike ? Math.max(10, 6 * p.sensorStd) : 0);
      const prior = predict(estimate, P, filterParameters);
      const posterior =
        y === null
          ? {
              x: prior.x.slice(),
              P: prior.P.slice(),
              residual: null,
              S: null,
              K: null,
            }
          : update(prior, y, filterParameters);
      if (y !== null) {
        iir = 0.8 * iir + 0.2 * y;
        samples.push(y);
        if (samples.length > 5) samples.shift();
        sma = samples.reduce((a, b) => a + b, 0) / samples.length;
      }
      rows.push({
        k,
        time: k * p.dt,
        previous,
        truth: truth.slice(),
        w,
        y,
        prior,
        posterior,
        iir,
        sma,
      });
      estimate = posterior.x.slice();
      P = posterior.P.slice();
    }
    return { parameters: p, filterParameters, initial, rows };
  }
  function ellipse(P) {
    const a = P[0],
      b = (P[1] + P[2]) / 2,
      d = P[3],
      gap = Math.hypot(a - d, 2 * b);
    const eigenvalues = [
      Math.max(0, (a + d + gap) / 2),
      Math.max(0, (a + d - gap) / 2),
    ];
    const angle = 0.5 * Math.atan2(2 * b, a - d),
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    return {
      eigenvalues,
      eigenvectors: [
        [cs, sn],
        [-sn, cs],
      ],
      angle,
    };
  }
  const mix = (a, b, f) =>
    f === 0
      ? a.slice()
      : f === 1
        ? b.slice()
        : a.map((v, i) => v + (b[i] - v) * f);
  function frame(simulation, phase, progress) {
    const row = simulation.rows[Math.floor(phase / 2)],
      prediction = phase % 2 === 0;
    const f = Math.min(1, Math.max(0, progress));
    const from = prediction ? row.previous : row.prior,
      to = prediction ? row.prior : row.posterior;
    return {
      row,
      prediction,
      progress: f,
      x: mix(from.x, to.x, f),
      P: mix(from.P, to.P, f),
      truth: prediction
        ? mix(row.previous.truth, row.truth, f)
        : row.truth.slice(),
    };
  }
  root.KalmanLab = {
    defaults,
    generator,
    predict,
    update,
    generate,
    ellipse,
    frame,
  };
  if (typeof module !== "undefined") module.exports = root.KalmanLab;
})(typeof window !== "undefined" ? window : globalThis);
