"use strict";
(() => {
  const mode = $("color-mode"), theme = $("color-theme");
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  try {
    const saved = JSON.parse(localStorage.getItem("kalman-appearance"));
    if (["dark", "light", "system"].includes(saved?.mode)) mode.value = saved.mode;
    if (["uq", "ocean", "amber"].includes(saved?.theme)) theme.value = saved.theme;
  } catch { /* Storage may be unavailable for local files. */ }
  function apply() {
    document.documentElement.dataset.mode = mode.value === "system"
      ? (system.matches ? "dark" : "light") : mode.value;
    document.documentElement.dataset.theme = theme.value;
    const css = getComputedStyle(document.documentElement);
    const tokens = { posterior: "post", border: "control-border" };
    for (const key of Object.keys(palette)) {
      palette[key] = css.getPropertyValue("--" + (tokens[key] || key)).trim();
    }
    try {
      localStorage.setItem("kalman-appearance", JSON.stringify({ mode: mode.value, theme: theme.value }));
    } catch { /* Appearance still works without persistence. */ }
    draw();
  }
  mode.addEventListener("change", apply);
  theme.addEventListener("change", apply);
  system.addEventListener("change", () => { if (mode.value === "system") apply(); });
  apply();
})();
