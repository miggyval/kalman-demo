# Project review

The original project contained one Python script and a short README, with no Git history or dependency file. Its useful teaching elements were interactive acceleration, four estimators, rolling position plots, a trajectory, and uncertainty graphics.

## Findings addressed

- **Incorrect observer time plot:** mode `LB` selected the Kalman history instead of the Luenberger history. Both views now display the selected estimator and label it correctly. LB means Luenberger, not low bandwidth.
- **Repeated toggles:** polling a held `t` flipped the switch every simulation step. Discrete settings now use Pygame KEYDOWN events; held arrows still control acceleration.
- **Moving-average off-by-one:** the original slice used up to 21 samples for a requested 20. A bounded deque now holds exactly 20.
- **Wrong IIR initialization:** position smoothing began from estimated velocity. It now begins from estimated position.
- **Inconsistent motion model:** the original `dt − b dt² / 2` position term reduced displacement without applying corresponding drag to velocity. Replaced it with a standard constant-acceleration discretization. This intentionally changes the physical trajectory and removes the unexplained `b = 50` parameter.
- **Covariance stability:** replaced the one-sided covariance update with Joseph form and explicit symmetrization. A pseudoinverse supports the zero-noise case.
- **Lifecycle:** import no longer opens windows or runs 200 seconds of simulation. Closing windows, Esc, and Ctrl+C clean up Pygame and Matplotlib.
- **Dependencies:** removed unused OpenCV and unused joystick configuration. Added explicit requirements and an isolated environment guide.
- **Sharing:** added seeded runs, headless export, a notebook, a browser UI, regression checks, and presentation instructions.
- **Visibility/performance:** noise defaults are now nonzero, legends reflect the active mode, trajectory tails are bounded, and GUI redraws run at up to 20 Hz while simulation steps remain 100 Hz.

## Interpretation and future improvements

The Python model assumes its controls and noise levels are known exactly. Its extreme process burst is a demonstration of covariance-aware response, not realistic robust estimation. The browser uses the requested two-state Euler model and adds wrong noise assumptions, missing observations, and an unannounced outlier.

The browser includes separate assumed process/measurement-noise controls, selectable sampling periods, state-space ellipses, stored prediction/update playback, numerical matrices, LaTeX equations, visibility controls, and optional IIR/SMA height comparisons. The fixed observer remains available in Python. Future extensions could add innovation gating and covariance-consistency statistics over many trials. Neither model represents a calibrated physical sensor.
