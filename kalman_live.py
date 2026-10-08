"""Live Matplotlib/Pygame demo, plus deterministic PNG/GIF/MP4 export."""
import argparse
from pathlib import Path
import time

import numpy as np

from kalman_model import Settings, Simulation, simulate


class DemoPlots:
    def __init__(self):
        import matplotlib.pyplot as plt
        from matplotlib.patches import Ellipse
        self.plt = plt
        self.fig, self.axes = plt.subplots(2, 1, sharex=True, figsize=(9, 6))
        self.lines = []
        for axis, label in zip(self.axes, ("x", "y")):
            self.lines.append([axis.plot([], [], style, label=name,
                                        alpha=0.5 if name == "measurement" else 1)[0]
                               for name, style in (("truth", "-"),
                                                   ("measurement", "."),
                                                   ("KF", "-"),
                                                   ("+2σ", "--"), ("−2σ", "--"))])
            axis.set_ylabel(f"{label} position")
            axis.grid(alpha=0.3)
        self.axes[-1].set_xlabel("Simulation time [s]")
        self.axes[0].legend(ncol=5, fontsize=9)
        self.fig.tight_layout(rect=(0, 0, 1, 0.92))
        self.traj_fig, self.traj_ax = plt.subplots(figsize=(7, 7))
        self.traj_lines = [self.traj_ax.plot([], [], style, label=label)[0]
                           for label, style in (("truth", "-"),
                                                ("measurement", "."), ("KF", "-"))]
        self.traj_lines[1].set_alpha(0.3)
        self.ellipse = Ellipse((0, 0), 0, 0, color="C2", alpha=0.2)
        self.traj_ax.add_patch(self.ellipse)
        self.arrows = [self.traj_ax.quiver([0], [0], [0], [0], angles="xy",
                                         scale_units="xy", scale=1,
                                         color=color, label=label)
                       for label, color in (("control ×0.2", "C3"),
                                            ("gravity ×0.2", "C4"),
                                            ("total ×0.2", "C5"))]
        self.traj_ax.set(xlabel="x position", ylabel="y position")
        self.traj_ax.set_aspect("equal", adjustable="box")
        self.traj_ax.grid(alpha=0.3)
        self.traj_ax.legend(loc="upper left", fontsize=9)
        self.traj_fig.tight_layout()

    def update(self, data, index, mode="KF", view=40., settings=None):
        settings = settings or Settings()
        start = max(0, index - 199)
        sl = slice(start, index + 1)
        t = data["time"][sl]
        sigma = np.sqrt(np.maximum(0, np.diagonal(data["covariance"][sl], axis1=1, axis2=2)))
        for j, axis in enumerate(self.axes):
            values = [data["truth"][sl, j], data["measurement"][sl, j],
                      data[mode][sl, j], data["KF"][sl, j] + 2 * sigma[:, j],
                      data["KF"][sl, j] - 2 * sigma[:, j]]
            for k, (line, value) in enumerate(zip(self.lines[j], values)):
                line.set_data(t, value)
                line.set_visible(k < 3 or mode == "KF")
            self.lines[j][2].set_label(mode)
            axis.set_xlim(max(0, t[-1] - 2), max(2, t[-1] + 0.05))
            center = data["truth"][index, j]
            axis.set_ylim(center - view / 2, center + view / 2)
        self.axes[0].legend(ncol=5, fontsize=9)
        self.fig.suptitle(f"{mode} | process scale {settings.process_noise:.1f} | "
                          f"sensor scale {settings.sensor_noise:.1f} | spikes {settings.spikes}")
        for line, key in zip(self.traj_lines, ("truth", "measurement", mode)):
            line.set_data(data[key][sl, 0], data[key][sl, 1])
        self.traj_lines[2].set_label(mode)
        vals, vecs = np.linalg.eigh(data["covariance"][index])
        order = np.argsort(vals)[::-1]
        vals, vecs = np.maximum(vals[order], 0), vecs[:, order]
        self.ellipse.set_center(data["KF"][index])
        self.ellipse.width, self.ellipse.height = 4 * np.sqrt(vals)
        self.ellipse.angle = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
        self.ellipse.set_visible(mode == "KF")
        center = data["truth"][index]
        for arrow, vector in zip(self.arrows, (data["control"][index],
                                               [0, -0.0981], data["acceleration"][index])):
            arrow.set_offsets(center.reshape(1, 2))
            arrow.set_UVC(*(np.asarray(vector) * 0.2))
        self.traj_ax.set_xlim(center[0] - view / 2, center[0] + view / 2)
        self.traj_ax.set_ylim(center[1] - view / 2, center[1] + view / 2)
        self.traj_ax.set_title(f"Trajectory: {mode} | t={data['time'][index]:.2f}s")
        self.traj_ax.legend(loc="upper left", fontsize=9)


def export(args):
    import matplotlib
    matplotlib.use("Agg")
    from matplotlib.animation import FFMpegWriter, PillowWriter
    import matplotlib.pyplot as plt
    destination = Path(args.export)
    if destination.suffix.lower() not in (".png", ".gif", ".mp4"):
        raise ValueError("Export extension must be .png, .gif or .mp4")
    settings = Settings(args.process_noise, args.sensor_noise, args.spikes)
    data = simulate(args.duration, seed=args.seed, settings=settings)
    plots = DemoPlots()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".png":
        plots.update(data, len(data["time"]) - 1, args.mode, settings=settings)
        plots.fig.savefig(destination, dpi=120)
    else:
        writer = PillowWriter(fps=20) if destination.suffix.lower() == ".gif" else FFMpegWriter(fps=20)
        if not writer.isAvailable():
            raise RuntimeError("MP4 export requires FFmpeg on PATH; use .gif instead")
        with writer.saving(plots.fig, str(destination), dpi=90):
            for i in range(0, len(data["time"]), 5):
                plots.update(data, i, args.mode, settings=settings)
                writer.grab_frame()
    plt.close("all")
    print(f"Saved {destination}")


def run_live(args):
    import matplotlib.pyplot as plt
    import pygame
    settings = Settings(args.process_noise, args.sensor_noise, args.spikes)
    sim = Simulation(seed=args.seed)
    plots = DemoPlots()
    mode, view_scale = args.mode, 0.
    count = int(np.ceil(args.duration / sim.dt))
    # Preallocate history, avoiding quadratic array reconstruction each frame.
    data = None
    pygame.init()
    try:
        pygame.display.set_mode((580, 170))
        pygame.display.set_caption("Kalman demo — click here for keyboard controls")
        pygame.display.get_surface().fill((35, 40, 45))
        pygame.display.set_caption("Arrows: motion | 1–4: estimator | t: spikes | Esc: quit")
        pygame.display.flip()
        plt.ion()
        plt.show()
        running = True
        for i in range(count):
            started = time.perf_counter()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    key = event.key
                    if key == pygame.K_ESCAPE:
                        running = False
                    elif key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4):
                        mode = {pygame.K_1: "KF", pygame.K_2: "LB",
                                pygame.K_3: "IIR", pygame.K_4: "SMA"}[key]
                    elif key == pygame.K_t:
                        settings.spikes = not settings.spikes
                    elif key in (pygame.K_PERIOD, pygame.K_COMMA):
                        delta = -0.1 if event.mod & pygame.KMOD_SHIFT else 0.1
                        name = "process_noise" if key == pygame.K_PERIOD else "sensor_noise"
                        setattr(settings, name, max(0., round(getattr(settings, name) + delta, 1)))
                    elif key in (pygame.K_EQUALS, pygame.K_MINUS):
                        view_scale = np.clip(view_scale + (0.2 if key == pygame.K_EQUALS else -0.2), -2, 2)
            if not running or not all(plt.fignum_exists(f.number) for f in (plots.fig, plots.traj_fig)):
                break
            keys = pygame.key.get_pressed()
            control = (30. * (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]),
                       30. * (keys[pygame.K_UP] - keys[pygame.K_DOWN]))
            row = sim.step(control, settings)
            if data is None:
                data = {k: np.empty((count,) + np.shape(v)) for k, v in row.items()}
            for k, v in row.items():
                data[k][i] = v
            # Simulation stays at 100 Hz; plots refresh at up to 20 Hz.
            if i % 5 == 0:
                plots.update(data, i, mode, 40 * 2**view_scale, settings)
                plots.fig.canvas.draw_idle()
                plots.traj_fig.canvas.draw_idle()
                plt.pause(0.001)
            time.sleep(max(0, sim.dt - (time.perf_counter() - started)))
    except KeyboardInterrupt:
        pass
    finally:
        pygame.quit()
        plt.close("all")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=200.)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--process-noise", type=float, default=1.)
    parser.add_argument("--sensor-noise", type=float, default=1.)
    parser.add_argument("--spikes", action="store_true")
    parser.add_argument("--mode", choices=("KF", "LB", "IIR", "SMA"), default="KF")
    parser.add_argument("--export", help="Save scripted time plots to .png, .gif or .mp4 without GUI")
    args = parser.parse_args()
    if not np.isfinite(args.duration) or args.duration <= 0:
        parser.error("--duration must be finite and positive")
    if any(not np.isfinite(v) or v < 0 for v in (args.process_noise, args.sensor_noise)):
        parser.error("Noise scales must be finite and nonnegative")
    if args.export:
        export(args)
    else:
        run_live(args)


if __name__ == "__main__":
    main()
