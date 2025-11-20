// Background script to handle icon updates based on theme

function updateIcon(theme) {
  const isDark = theme === 'dark';
  // Dark mode -> White icons
  // Light mode -> Dark icons
  const suffix = isDark ? 'white' : 'dark';
  const path = {
    16: `icons/icon16${suffix}.png`,
    32: `icons/icon32${suffix}.png`
  };

  // Try to set the icon
  try {
    if (typeof chrome !== 'undefined' && chrome.action) {
      chrome.action.setIcon({ path });
    } else if (typeof browser !== 'undefined' && browser.browserAction) {
      browser.browserAction.setIcon({ path });
    } else if (typeof chrome !== 'undefined' && chrome.browserAction) {
      chrome.browserAction.setIcon({ path });
    }
  } catch (err) {
    console.error('Error setting icon:', err);
  }
}

// Firefox (MV2) has access to window and matchMedia in background scripts
if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  updateIcon(media.matches ? 'dark' : 'light');
  media.onchange = (e) => updateIcon(e.matches ? 'dark' : 'light');
}

// Chrome (MV3) Service Worker does not have window/matchMedia.
// We listen for messages from content scripts or extension pages (like newtab/main.js).
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'THEME_CHANGED') {
      updateIcon(message.theme);
    }
  });
}
