import unittest
import numpy as np
from kalman_model import Settings, Simulation, simulate


class ModelTests(unittest.TestCase):
    def test_repeatability_and_accuracy(self):
        a, b = simulate(), simulate()
        np.testing.assert_array_equal(a['KF'], b['KF'])
        rmse = lambda key: np.sqrt(np.mean((a[key] - a['truth'])**2))
        self.assertLess(rmse('KF'), rmse('measurement'))
        self.assertLess(rmse('KF'), rmse('SMA'))

    def test_covariance_with_spikes_and_zero_noise(self):
        for settings in (Settings(spikes=True), Settings(0, 0)):
            sim = Simulation()
            for i in range(300):
                row = sim.step((10, -5), settings)
                self.assertTrue(np.all(np.isfinite(row['KF'])))
                np.testing.assert_allclose(sim.P, sim.P.T, atol=1e-10)
                self.assertGreaterEqual(np.linalg.eigvalsh(sim.P).min(), -1e-8)

    def test_sma_length_and_iir_initialization(self):
        sim = Simulation(window=20)
        np.testing.assert_array_equal(sim.iir, [0, 0])
        z = [sim.step()['measurement'] for _ in range(21)]
        np.testing.assert_allclose(np.mean(sim.measurements, axis=0), np.mean(z[-20:], axis=0))

    def test_known_acceleration(self):
        sim = Simulation()
        for _ in range(100):
            sim.step((4, 2), Settings(0, 0))
        np.testing.assert_allclose(sim.x, [2, (2-.0981)/2, 4, 2-.0981], atol=1e-10)

    def test_invalid_parameters(self):
        with self.assertRaises(ValueError): Simulation(dt=0)
        with self.assertRaises(ValueError): simulate(duration=0)
        with self.assertRaises(ValueError): Simulation().step(settings=Settings(-1, 1))


if __name__ == '__main__': unittest.main()
