# Presentation options

| Format | Use | Requirement |
| --- | --- | --- |
| Browser state-space view | Live prediction/update, matrices, covariance ellipses | Modern browser; opens offline |
| Matplotlib + Pygame | Keyboard-controlled 2D motion and fixed-observer comparison | Python GUI environment |
| Jupyter notebook | Reproducible 2D plots, equations, RMSE | Jupyter |
| GIF / MP4 | Slide insert or presentation backup | GIF: Pillow; MP4: FFmpeg |

For the browser view, maximise the window for projection. Keep the additional controls collapsed unless using mismatched noise, missing measurements, outliers, or the smoother comparison. Hide individual plot components using the checkboxes. Pause or step to leave matrices visible at an exact stage endpoint.

Other possible formats include a 1D prior/likelihood/posterior distribution view, a radar-style tracking view, a robot map with odometry and landmarks, or a camera-tracking overlay. The last two need additional models or real sensor inputs.

The browser is a two-state Euler model; the Python demo and notebook retain the four-state 2D controlled-motion model. A public GitHub repository stores these files but does not automatically host the browser demo. Static hosting can serve `web/` separately.
