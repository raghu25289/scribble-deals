// Popup: consent gate + settings. This is the only place the extension
// ever writes to chrome.storage.local, and it only ever writes booleans/
// timestamps -- never page content.

const CONSENT_VERSION = 1;

const consentScreen = document.getElementById('consent-screen');
const settingsScreen = document.getElementById('settings-screen');
const acceptBtn = document.getElementById('consent-accept');
const declineBtn = document.getElementById('consent-decline');
const globalToggle = document.getElementById('global-toggle');
const siteList = document.getElementById('site-list');

function defaultSettings() {
  const sites = {};
  for (const [key, surface] of Object.entries(window.ScribbleConfig.SURFACES)) {
    sites[key] = !!surface.enabled;
  }
  return { globalEnabled: true, sites };
}

async function init() {
  const stored = await chrome.storage.local.get(['consent', 'settings']);

  if (!stored.consent || !stored.consent.accepted) {
    showConsentScreen();
    return;
  }

  const settings = stored.settings || defaultSettings();
  showSettingsScreen(settings);
}

function showConsentScreen() {
  consentScreen.hidden = false;
  settingsScreen.hidden = true;
}

function showSettingsScreen(settings) {
  consentScreen.hidden = true;
  settingsScreen.hidden = false;

  globalToggle.checked = settings.globalEnabled !== false;
  globalToggle.onchange = async () => {
    settings.globalEnabled = globalToggle.checked;
    await chrome.storage.local.set({ settings });
  };

  siteList.innerHTML = '';
  for (const [key, surface] of Object.entries(window.ScribbleConfig.SURFACES)) {
    const row = document.createElement('div');
    row.className = 'site-row' + (surface.enabled ? '' : ' site-row-disabled');

    const label = document.createElement('span');
    label.textContent = surface.enabled ? surface.label : `${surface.label} (coming soon)`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings.sites ? settings.sites[key] !== false : true;
    input.disabled = !surface.enabled;

    input.onchange = async () => {
      settings.sites = settings.sites || {};
      settings.sites[key] = input.checked;
      await chrome.storage.local.set({ settings });
    };

    row.appendChild(label);
    row.appendChild(input);
    siteList.appendChild(row);
  }
}

acceptBtn.addEventListener('click', async () => {
  const consent = { accepted: true, version: CONSENT_VERSION, timestamp: Date.now() };
  const settings = defaultSettings();
  await chrome.storage.local.set({ consent, settings });
  showSettingsScreen(settings);
});

declineBtn.addEventListener('click', () => {
  // "Not now" leaves the extension fully inert: no consent record is
  // written, so every content script's first-statement check stays
  // unsatisfied and no-ops. Just close the popup.
  window.close();
});

init();
