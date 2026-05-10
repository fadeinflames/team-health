// Apply theme before React mounts so there is no flash of opposite theme.
// Loaded as an external script to satisfy a strict `script-src 'self'` CSP.
(function () {
  try {
    var stored = localStorage.getItem("th_theme");
    var resolved = stored;
    if (resolved === "system" || !resolved) {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : null;
    }
    if (resolved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {
    // localStorage unavailable; default to light
  }
})();
