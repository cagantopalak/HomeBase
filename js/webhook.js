const WEBHOOK_URL = "https://homebase.birtik.co/news.php";

/* ---------- WEBHOOK CHECK ---------- */
function checkWebhook() {
  if (!WEBHOOK_URL) return;

  fetch(WEBHOOK_URL)
    .then((response) => response.text())
    .then((text) => {
      let data = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Fallback for raw PHP file serving (e.g. GitHub Pages)
        if (text.includes('"news" => true')) data.news = true;
        if (text.includes('"snow" => true')) data.snow = true;
      }

      if (data) {
        // Check if news or snow is enabled
        const isSnowEnabled = data.news === true || data.snow === true;

        if (isSnowEnabled) {
          // 1. Start Snowing (default)
          // Check if user previously turned it off
          const userPref = localStorage.getItem("homebase_snow_enabled");
          if (userPref !== "false") {
            startSnowAnimation();
          }

          // 2. Add Toggle Button to Settings (Next to Contact Btn)
          const contactBtn = document.getElementById("contactBtn");
          if (contactBtn && contactBtn.parentNode) {
            const leftButtonsContainer = contactBtn.parentNode;

            // Create Snow Toggle Button
            const snowBtn = document.createElement("button");
            snowBtn.id = "snowToggleBtn";
            snowBtn.className = "snow-button"; // Theme: Christmas
            snowBtn.style.marginLeft = "10px";
            snowBtn.textContent =
              userPref !== "false" ? "Snow: On" : "Snow: Off";

            snowBtn.addEventListener("click", () => {
              const canvas = document.querySelector("canvas.snow-canvas");
              if (canvas) {
                // Currently On -> Turn Off
                canvas.remove();
                snowBtn.textContent = "Snow: Off";
                localStorage.setItem("homebase_snow_enabled", "false");
              } else {
                // Currently Off -> Turn On
                startSnowAnimation();
                snowBtn.textContent = "Snow: On";
                localStorage.setItem("homebase_snow_enabled", "true");
              }
            });

            // Insert after Contact button
            leftButtonsContainer.appendChild(snowBtn);
          }
        }
      }
    })
    .catch((err) => console.error("Error checking webhook:", err));
}

function startSnowAnimation() {
  // Prevent duplicates
  if (document.querySelector("canvas.snow-canvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "snow-canvas"; // Add class for easy selection
  const ctx = canvas.getContext("2d");

  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const particles = [];
  const particleCount = 100;

  class Snowflake {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * -height; // Start above screen
      this.vy = 1 + Math.random() * 3; // Fall speed
      this.vx = (Math.random() - 0.5) * 2; // Wind/drift
      this.r = 1 + Math.random() * 2; // Size
      this.o = 0.5 + Math.random() * 0.5; // Opacity
    }

    update() {
      this.y += this.vy;
      this.x += this.vx;

      // Reset if out of bounds
      if (this.y > height) {
        this.reset();
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${this.o})`;
      ctx.fill();
    }
  }

  // Initialize particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Snowflake());
  }

  // Handle resize
  window.addEventListener("resize", () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  animate();
}

checkWebhook();
