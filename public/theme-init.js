// Внешний вид применяется до того, как стартует React: иначе при загрузке
// мелькнула бы светлая тема, акцент по умолчанию или другая плотность.
// Файл внешний, а не inline, потому что CSP разрешает только script-src 'self'.
// Значения кладёт в localStorage раздел «Внешний вид» (src/appearance.js).
(function () {
  try {
    var root = document.documentElement;
    var get = function (key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    };

    var theme = get("th_theme");
    if (theme === "system" || !theme) {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : null;
    }
    if (theme === "dark") root.setAttribute("data-theme", "dark");

    var accent = get("th_accent");
    if (accent && /^(teal|blue|indigo|violet|rose|orange|graphite)$/.test(accent) && accent !== "teal") {
      root.setAttribute("data-accent", accent);
    }
    if (get("th_density") === "compact") root.setAttribute("data-density", "compact");
    if (get("th_text") === "large") root.setAttribute("data-text", "large");
    if (get("th_motion") === "reduced") root.setAttribute("data-motion", "reduced");
  } catch (e) {
    // localStorage недоступен: остаются значения по умолчанию
  }
})();
