/* ---------- BACKGROUND IMAGE ---------- */
// Reads the stored image as early as it can so the page does not flash the default, and
// owns the file picker and the reset button in the settings modal.

(function (root) {
  const App = root.HomeBaseApp;
  const Persist = root.HomeBasePersist;

  const DEFAULT_BACKGROUND =
    "https://www.windowslatest.com/wp-content/uploads/2024/10/Windows-XP-4K-modified.jpg";

  function apply(url) {
    document.body.style.background = `url('${url || DEFAULT_BACKGROUND}') center/cover no-repeat fixed`;
  }

  // Shrinks a data URL to fit a box and re-encodes it as JPEG. Returns the original when
  // it already fits, so a small PNG is not needlessly turned into a lossy JPEG.
  function resize(dataUrl, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, Math.min(maxWidth / img.width, maxHeight / img.height));
        if (ratio >= 1) return resolve(dataUrl);

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Image load error"));
      img.src = dataUrl;
    });
  }

  async function restore() {
    try {
      apply(await Persist.loadBackground());
    } catch (err) {
      console.error("background load failed:", err && err.message);
      apply(null);
    }
  }

  async function set(dataUrl) {
    let toApply = dataUrl;
    try {
      toApply = await resize(dataUrl);
    } catch (err) {
      console.warn("resize skipped:", err && err.message);
    }
    apply(toApply);
    const where = await Persist.saveBackground(toApply, resize);
    if (where === "session") {
      App.showCustomAlert(
        "Background image could not be saved. It will be applied for this session only."
      );
    }
    return where;
  }

  async function reset() {
    await Persist.clearBackground();
    apply(null);
  }

  function init() {
    const fileInput = document.getElementById("bgFileInput");
    const browseButton = document.getElementById("browseBgButton");
    const resetButton = document.getElementById("resetBgBtn");

    if (browseButton && fileInput) {
      browseButton.addEventListener("click", () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          set(event.target.result).catch((err) =>
            console.error("background save failed:", err && err.message)
          );
        };
        reader.readAsDataURL(file);
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        App.showCustomConfirm(
          "Are you sure you want to reset the background image to default?",
          () => {
            reset().catch((err) =>
              console.error("background reset failed:", err && err.message)
            );
          }
        );
      });
    }
  }

  root.HomeBaseWallpaper = { DEFAULT_BACKGROUND, apply, resize, restore, set, reset, init };
})(window);
