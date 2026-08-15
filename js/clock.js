/* ---------- CLOCK ---------- */
// Reads its settings from whatever it is handed, so the settings modal can preview a
// change without storing it.

(function (root) {
  let element = null;
  let timer = null;
  let current = null;

  function format(settings, now) {
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    if (settings.clockFormat === "12") {
      const suffix = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const base = `${String(hours).padStart(2, "0")}:${minutes}`;
      return (settings.showSeconds ? `${base}:${seconds}` : base) + ` ${suffix}`;
    }

    const base = `${String(hours).padStart(2, "0")}:${minutes}`;
    return settings.showSeconds ? `${base}:${seconds}` : base;
  }

  function tick() {
    if (!element || !current) return;
    element.textContent = format(current, new Date());
  }

  // Applies colour, font, size, position and visibility, then redraws immediately so a
  // preview does not wait up to a second for the next tick.
  function apply(settings) {
    current = settings;
    if (!element) element = document.getElementById("new-digital-clock");

    const css = document.documentElement.style;
    css.setProperty("--clock-display-color", settings.clockColor);
    css.setProperty("--clock-display-font-family", settings.clockFontFamily);
    css.setProperty("--clock-font-size", settings.clockSize + "px");

    if (element) {
      element.classList.remove("clock-pos-left", "clock-pos-right");
      element.classList.add(
        settings.clockPosition === "right" ? "clock-pos-right" : "clock-pos-left"
      );
      element.style.display = settings.showClock ? "flex" : "none";
    }
    tick();
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, 1000);
  }

  root.HomeBaseClock = { apply, start, format };
})(window);
