// Near-empty service worker. MV3 requires a background entry to be declared
// in the manifest for some install/update lifecycle events, but Scribble
// Deals does no background work: no network calls, no message routing of
// page content. Everything happens locally in the content script and popup.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // No-op: consent is requested from the popup on first open, not here.
  }
});
