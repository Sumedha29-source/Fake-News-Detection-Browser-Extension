// background.js — TruthLens Service Worker

// Clear cached results when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([`result_${tabId}`]);
});

// Reset badge when navigating to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.storage.session.remove([`result_${tabId}`]);
  }
});