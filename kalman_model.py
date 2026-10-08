"""Import-safe simulation shared by the interactive demo and notebook.

State: [x, y, vx, vy]. R is sensor covariance and Q is state process
covariance, following the common Kalman-filter convention.
"""
from collections import deque
from dataclasses import dataclass

import numpy as np
from scipy.signal import place_poles


@dataclass
class Settings:
    process_noise: float = 1.0
    sensor_noise: float = 1.0
    spikes: bool = False


class Simulation:
    def __init__(self, dt=0.01, seed=7, window=20, alpha=0.95):
        if not np.isfinite(dt) or dt <= 0:
            raise ValueError("dt must be finite and positive")
        if window < 1 or not isinstance(window, int):
            raise ValueError("window must be a positive integer")
        if not 0 <= alpha < 1:
            raise ValueError("alpha must be in [0, 1)")
        self.dt, self.alpha = dt, alpha
        self.rng = np.random.default_rng(seed)
        self.A = np.eye(4)
        self.A[0, 2] = self.A[1, 3] = dt
        self.G = np.vstack((np.eye(2) * dt**2 / 2, np.eye(2) * dt))
        self.C = np.eye(2, 4)
        self.L = place_poles(self.A.T, self.C.T,
                             [0.92, 0.93, 0.94, 0.95]).gain_matrix.T
        self.x = np.zeros(4)
        self.estimate = np.r_[np.zeros(2), self.rng.normal(0, 5, 2)]
        self.P = np.diag([0., 0., 25., 25.])
        self.observer = self.estimate.copy()
        self.iir = self.C @ self.estimate
        self.measurements = deque(maxlen=window)
        self.steps = 0

    def step(self, control=(0., 0.), settings=None):
        settings = settings or Settings()
        if any(not np.isfinite(v) or v < 0 for v in
               (settings.process_noise, settings.sensor_noise)):
            raise ValueError("Noise scales must be finite and nonnegative")
        control = np.asarray(control, dtype=float)
        if control.shape != (2,) or not np.all(np.isfinite(control)):
            raise ValueError("control must contain two finite accelerations")
        # Spikes repeat every two seconds; the filter knows their covariance.
        phase = (self.steps * self.dt) % 2
        sensor_spike = settings.spikes and 0.7 <= phase < 0.8
        process_spike = settings.spikes and 0.8 <= phase < 0.9
        accel_std = 20 * settings.process_noise * (500 if process_spike else 1)
        sensor_std = 2 * settings.sensor_noise * (20 if sensor_spike else 1)
        Q = self.G @ (np.eye(2) * accel_std**2) @ self.G.T
        R = np.eye(2) * sensor_std**2
        acceleration = control + np.array([0., -0.0981])
        self.x = (self.A @ self.x + self.G @ acceleration
                  + self.G @ self.rng.normal(0, accel_std, 2))
        z = self.C @ self.x + self.rng.normal(0, sensor_std, 2)
        prior = self.A @ self.estimate + self.G @ acceleration
        prior_P = self.A @ self.P @ self.A.T + Q
        S = self.C @ prior_P @ self.C.T + R
        # pinv also supports the deterministic, zero-noise setting.
        K = prior_P @ self.C.T @ np.linalg.pinv(S)
        self.estimate = prior + K @ (z - self.C @ prior)
        residual = np.eye(4) - K @ self.C
        # Joseph form preserves positive semidefiniteness under roundoff.
        self.P = residual @ prior_P @ residual.T + K @ R @ K.T
        self.P = (self.P + self.P.T) / 2
        self.observer = (self.A @ self.observer + self.G @ acceleration
                         + self.L @ (z - self.C @ self.observer))
        self.iir = self.alpha * self.iir + (1 - self.alpha) * z
        self.measurements.append(z.copy())
        self.steps += 1
        return dict(time=self.steps * self.dt, truth=self.x[:2].copy(),
                    measurement=z, KF=self.estimate[:2].copy(),
                    LB=self.observer[:2].copy(), IIR=self.iir.copy(),
                    SMA=np.mean(self.measurements, axis=0),
                    covariance=self.P[:2, :2].copy(),
                    control=control.copy(), acceleration=acceleration)


def scripted_control(t):
    """Smooth, repeatable motion for slides and the notebook."""
    return (12 * np.cos(1.2 * t), 12 * np.sin(1.2 * t))


def simulate(duration=8., dt=0.01, seed=7, settings=None):
    if not np.isfinite(duration) or duration <= 0:
        raise ValueError("duration must be finite and positive")
    sim = Simulation(dt=dt, seed=seed)
    rows = [sim.step(scripted_control(i * dt), settings)
            for i in range(int(np.ceil(duration / dt)))]
    return {key: np.array([row[key] for row in rows]) for key in rows[0]}
