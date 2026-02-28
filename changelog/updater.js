const CHANGELOG_URL = "https://homebase.birtik.co/changelog.json";

function initChangelog() {
    // Sequence check: For new users, wait until they've seen the welcome and pin instructions
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcome");
    const hasSeenPin = localStorage.getItem("hasSeenPinInstructions");

    if (!hasSeenWelcome || !hasSeenPin) {
        console.log("HomeBase Update Checker: Skipping check for new user (welcome flow active).");
        return;
    }

    const cacheBuster = new Date().getTime();
    fetch(`${CHANGELOG_URL}?t=${cacheBuster}`)
        .then((response) => response.json())
        .then((data) => {
            console.log("HomeBase Update Checker:", data);

            // Required fields to show modal
            if (!data || !data.show || !data.version) {
                console.log("HomeBase Update Checker: JSON missing required fields or 'show' is false.");
                return;
            }

            const lastSeenVersion = localStorage.getItem("homebase_changelog_version");
            console.log(`HomeBase Update Checker: Last seen version is '${lastSeenVersion}'. Server version is '${data.version}'.`);

            // Only show if the version from server doesn't match the last seen version
            if (lastSeenVersion !== data.version) {
                console.log("HomeBase Update Checker: Versions don't match, showing modal.");
                showChangelogModal(data);
            } else {
                console.log("HomeBase Update Checker: Version already seen, hiding modal.");
            }
        })
        .catch((err) => console.error("Error fetching changelog:", err));
}

function showChangelogModal(data) {
    // Check if modal already exists
    if (document.getElementById("changelogModal")) return;

    // Create Modal Structure
    const modal = document.createElement("div");
    modal.id = "changelogModal";
    modal.className = "modal"; // Base modal class from your style.css

    // Create changes list HTML
    let changesHtml = "";
    if (data.changes && Array.isArray(data.changes) && data.changes.length > 0) {
        changesHtml = `
      <div class="changelog-list">
        <ul>
          ${data.changes.map((change) => `<li>${change}</li>`).join("")}
        </ul>
      </div>
    `;
    }

    modal.innerHTML = `
    <div class="modal-content">
      <div class="changelog-header">
        <div class="changelog-badge">UPDATE</div>
        <h2 id="changelogTitle">${data.title || "What's changed on HomeBase"}</h2>
        <p id="changelogDescription">${data.description || ""}</p>
      </div>
      ${changesHtml}
      <div class="changelog-footer">
        <button id="closeChangelogBtn" class="primary-button">Explore What's New</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    // Show modal using the expected project modal flow
    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    // Basic styling for animation
    modal.style.transition = "opacity 0.3s ease";

    // Handle Close Event
    document.getElementById("closeChangelogBtn").addEventListener("click", () => {
        // Save that the user has seen this version
        localStorage.setItem("homebase_changelog_version", data.version);

        // Animate out
        modal.style.opacity = "0";
        setTimeout(() => {
            closeChangelogModal(modal);
        }, 300);
    });
}

function closeChangelogModal(modal) {
    if (modal) {
        modal.remove();
    }

    // Only remove body blur if no other modal is currently visible
    const otherModals = Array.from(document.querySelectorAll('.modal')).filter(m => m.style.display === 'flex' && m.id !== 'changelogModal');
    if (otherModals.length === 0) {
        document.body.classList.remove("modal-open");
    }
}

// Initialize directly since this script is loaded with 'defer'
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChangelog);
} else {
    initChangelog();
}
