const WEBHOOK_URL = "https://homebase.birtik.co/news.php";

/* ---------- WEBHOOK CHECK ---------- */
function checkWebhook() {
  if (!WEBHOOK_URL) return;

  fetch(WEBHOOK_URL)
    .then((response) => response.json())
    .then((data) => {
      if (data && data.news === true) {
        const circle = document.createElement("div");
        circle.className = "green-pulse-circle";
        document.body.appendChild(circle);
      }
    })
    .catch((err) => console.error("Error checking webhook:", err));
}

checkWebhook();
