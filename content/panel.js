// Offer panel: shadow-DOM UI injected into the host page. Reads and
// renders only -- no synthetic events on the host page, no clicks, no
// input manipulation. All outbound links open in a new tab via normal
// anchor semantics (rel=noopener), never programmatic navigation.

(function () {
  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/panel]', ...args);
    }
  }

  const SESSION_DISMISS_KEY = 'scribble_panel_dismissed';

  function isDismissedThisSession() {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markDismissedThisSession() {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch (e) {
      // sessionStorage unavailable (rare); panel simply won't persist the
      // dismissal across a reload, which is an acceptable degradation.
    }
  }

  // Display names now live on the taxonomy category itself
  // (window.ScribbleTaxonomy.CATEGORIES[slug].display_name) rather than a
  // second map maintained here -- v1's taxonomy covers ~150 slugs
  // (enabled and disabled), and a map duplicated across two files would
  // drift the moment either one is edited without the other. The
  // slug-humanizing fallback below only matters for a category that
  // somehow isn't in the taxonomy at all.
  function humanizeCategory(slug) {
    const taxonomy = window.ScribbleTaxonomy;
    const def = taxonomy && taxonomy.CATEGORIES && taxonomy.CATEGORIES[slug];
    if (def && def.display_name) return def.display_name;
    const last = String(slug || '').split('.').pop() || '';
    return last.replace(/_/g, ' ');
  }

  function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    return str.slice(0, maxLen - 1).trimEnd() + '…';
  }

  // --- Inline SVG assets -- no webfonts, no network requests -------------
  const SVG_SCRIBBLE_S =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">' +
    '<path d="M15.5 7c-1.7-1.7-4.6-2-6.2-.3-1.2 1.3-.4 2.6 1.6 3.4 2.5 1 4.8 1.8 3.7 4-1 2.1-4.3 2.4-6.4.8" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const SVG_CHEVRON =
    '<svg class="scribble-chevron" viewBox="0 0 24 24" width="10" height="10" fill="none" aria-hidden="true">' +
    '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const SVG_X =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const SVG_PADLOCK =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">' +
    '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" stroke-width="1.6"/></svg>';

  // Bundled inline, not loaded via chrome.runtime.getURL(). A URL-based
  // stylesheet load (or a manifest "css" content-script injection) requires
  // either web_accessible_resources or a page-visible <link>/<style> tag in
  // the host document -- both give a page script a way to detect Scribble
  // is installed. Shipping the CSS as a string and attaching it only inside
  // this shadow root avoids both.
  const PANEL_CSS = `
:host {
  all: initial;
  display: block;
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
}

:host([data-theme="light"]) {
  --bg: #FFFFFF;
  --ink: #1A1D21;
  --muted: #6A7076;
  --line: #E4E6E8;
  --highlight: #FFE86B;
  --accent-ink: #0F4C3A;
}

:host([data-theme="dark"]) {
  --bg: #1E2126;
  --ink: #F2F3F4;
  --muted: #9AA0A6;
  --line: #33373D;
  /* Spec called for 85% opacity, but that renders --accent-ink text at
     ~1.1:1 contrast against this swipe (measured) -- nearly invisible.
     Dialed back to meet the 4.5:1 floor; accent-ink hex is unchanged since
     that one's pinned by name ("used ONLY for savings text"). */
  --highlight: rgba(245, 217, 63, 0.3);
  --accent-ink: #7BD8B0;
}

* {
  box-sizing: border-box;
}

.scribble-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* ---------- collapsed pill ---------- */

.scribble-pill {
  display: flex;
  align-items: center;
}

.scribble-pill-main {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  background: var(--bg);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.10);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: border-color 0.15s ease;
  animation: scribble-pill-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes scribble-pill-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .scribble-pill-main {
    animation: none;
  }
}

.scribble-pill-main:hover {
  border-color: var(--muted);
}

.scribble-pill-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--ink);
  flex: none;
}

.scribble-pill-count {
  white-space: nowrap;
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scribble-chevron {
  transition: transform 0.2s ease;
  flex: none;
}

.scribble-pill-main[aria-expanded="true"] .scribble-chevron {
  transform: rotate(180deg);
}

.scribble-pill-dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0;
  height: 40px;
  padding: 0;
  margin-right: 0;
  overflow: hidden;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: width 0.15s ease, opacity 0.15s ease, margin-right 0.15s ease;
}

.scribble-pill:hover .scribble-pill-dismiss,
.scribble-pill:focus-within .scribble-pill-dismiss {
  width: 28px;
  opacity: 1;
  margin-right: 4px;
}

.scribble-pill-dismiss:hover {
  color: var(--ink);
}

/* ---------- expanded panel ---------- */

.scribble-panel {
  width: 320px;
  max-height: 0;
  margin-bottom: 0;
  opacity: 0;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  transition: max-height 0.2s ease, opacity 0.2s ease, margin-bottom 0.2s ease;
}

.scribble-panel.scribble-open {
  max-height: 420px;
  margin-bottom: 8px;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .scribble-panel {
    transition: none;
  }
}

.scribble-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 10px 16px;
  border-bottom: 1px solid var(--line);
  flex: none;
}

.scribble-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scribble-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex: none;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.scribble-close:hover {
  color: var(--ink);
}

.scribble-card-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.scribble-card {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}

.scribble-card:last-child {
  border-bottom: none;
}

.scribble-card-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.scribble-merchant {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.scribble-chip {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  border: 1px solid var(--muted);
  border-radius: 4px;
  padding: 2px 6px;
}

.scribble-card-row2 {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.scribble-card-row3 {
  position: relative;
  display: inline-block;
  margin-bottom: 10px;
  padding: 1px 3px;
}

.scribble-highlight-swipe {
  position: absolute;
  inset: 8% -6px;
  background: var(--highlight);
  border-radius: 3px;
  transform: rotate(-1.2deg);
  z-index: 0;
}

.scribble-discount {
  position: relative;
  z-index: 1;
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-ink);
}

.scribble-card-row4 {
  margin-bottom: 6px;
}

.scribble-code-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 6px 6px 6px 10px;
  transition: border-color 0.2s ease;
}

.scribble-code-box.scribble-copied {
  border-style: solid;
  border-color: var(--accent-ink);
}

.scribble-code-text {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scribble-copy-btn {
  flex: none;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 6px;
}

.scribble-copy-btn:hover {
  color: var(--ink);
}

.scribble-copy-btn.scribble-copied {
  color: var(--accent-ink);
}

.scribble-get-deal-btn {
  display: block;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--bg);
  background: var(--accent-ink);
  border-radius: 6px;
  padding: 8px 10px;
  text-decoration: none;
}

.scribble-go-link {
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-ink);
  text-decoration: none;
}

.scribble-go-link:hover {
  text-decoration: underline;
}

.scribble-footer {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--muted);
  flex: none;
}

.scribble-footer svg {
  flex: none;
}

/* ---------- accessibility ---------- */

.scribble-pill-main:focus-visible,
.scribble-pill-dismiss:focus-visible,
.scribble-close:focus-visible,
.scribble-copy-btn:focus-visible,
.scribble-get-deal-btn:focus-visible,
.scribble-go-link:focus-visible {
  outline: 2px solid var(--accent-ink);
  outline-offset: 2px;
}

/* ---------- narrow viewport ---------- */

@media (max-width: 480px) {
  :host {
    bottom: 16px;
    right: 16px;
  }
  .scribble-panel {
    width: calc(100vw - 32px);
  }
}
`;

  function attachStyles(shadowRoot) {
    // Prefer a constructed stylesheet (no DOM node at all, nothing for a
    // host page to enumerate even if it walked the shadow root). Fall back
    // to a plain <style> element on engines/versions without
    // adoptedStyleSheets/CSSStyleSheet.replaceSync support -- still fully
    // contained inside the shadow root either way.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_CSS);
      shadowRoot.adoptedStyleSheets = [sheet];
    } catch (e) {
      const styleEl = document.createElement('style');
      styleEl.textContent = PANEL_CSS;
      shadowRoot.appendChild(styleEl);
    }
  }

  // --- Theme: OS preference, overridden by sampling the host page's own
  // background so the panel matches whatever page it's actually sitting on.
  function parseRgbString(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length < 3) return null;
    const [r, g, b, a = 1] = parts;
    if (a === 0) return null; // fully transparent, not a usable signal
    return { r, g, b };
  }

  function luminance({ r, g, b }) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function sampleHostBackgroundLuminance() {
    try {
      const bodyRgb = parseRgbString(getComputedStyle(document.body).backgroundColor);
      if (bodyRgb) return luminance(bodyRgb);
      const htmlRgb = parseRgbString(getComputedStyle(document.documentElement).backgroundColor);
      if (htmlRgb) return luminance(htmlRgb);
    } catch (e) {
      // ignore, fall through to OS preference
    }
    return null;
  }

  function computeTheme() {
    const lum = sampleHostBackgroundLuminance();
    if (lum !== null) return lum < 0.5 ? 'dark' : 'light';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  // --- Module state (mount-once guard) ------------------------------------
  let mounted = false;
  let hostEl = null;
  let shadow = null;
  let pillMainEl = null;
  let pillCountEl = null;
  let panelEl = null;
  let panelTitleEl = null;
  let cardListEl = null;
  let expanded = false;
  let themeIntervalId = null;
  let lastRenderedKey = null;

  function copyToClipboard(text) {
    // Clipboard write originates from extension UI (the shadow DOM panel),
    // not from the host page -- this is explicitly allowed. We never write
    // into the host page's DOM or inputs.
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // Ranking: best value first, always. `sponsored` is a label rendered on
  // the card -- it must never influence sort order. Do not add a sponsored
  // boost here; that's the one rule this file exists to protect.
  function rankOffers(offers) {
    return [...offers].sort((a, b) => b.value_score - a.value_score);
  }

  function renderCard(offer) {
    const card = document.createElement('div');
    card.className = 'scribble-card';

    const sponsoredChip = offer.sponsored
      ? '<span class="scribble-chip">Sponsored</span>'
      : '';

    const row4 = offer.code
      ? `
        <div class="scribble-card-row4">
          <div class="scribble-code-box">
            <span class="scribble-code-text">${escapeHtml(offer.code)}</span>
            <button type="button" class="scribble-copy-btn" aria-live="polite">Copy</button>
          </div>
        </div>
        <a class="scribble-go-link" href="${escapeAttr(offer.url)}" target="_blank" rel="noopener noreferrer">Go to offer →</a>
      `
      : `
        <div class="scribble-card-row4">
          <a class="scribble-get-deal-btn" href="${escapeAttr(offer.url)}" target="_blank" rel="noopener noreferrer">Get deal</a>
        </div>
      `;

    card.innerHTML = `
      <div class="scribble-card-row1">
        <span class="scribble-merchant">${escapeHtml(offer.merchant)}</span>
        ${sponsoredChip}
      </div>
      <div class="scribble-card-row2">${escapeHtml(offer.title)}</div>
      <div class="scribble-card-row3">
        <span class="scribble-highlight-swipe" aria-hidden="true"></span>
        <span class="scribble-discount">${escapeHtml(offer.discount_text)}</span>
      </div>
      ${row4}
    `;

    const copyBtn = card.querySelector('.scribble-copy-btn');
    if (copyBtn) {
      const codeBox = card.querySelector('.scribble-code-box');
      copyBtn.addEventListener('click', () => {
        copyToClipboard(offer.code);
        copyBtn.textContent = 'Copied';
        copyBtn.classList.add('scribble-copied');
        codeBox.classList.add('scribble-copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('scribble-copied');
          codeBox.classList.remove('scribble-copied');
        }, 1500);
      });
    }

    return card;
  }

  function applyTheme() {
    if (!hostEl) return;
    hostEl.setAttribute('data-theme', computeTheme());
  }

  function startThemePolling() {
    stopThemePolling();
    applyTheme();
    themeIntervalId = setInterval(applyTheme, 5000);
  }

  function stopThemePolling() {
    if (themeIntervalId) {
      clearInterval(themeIntervalId);
      themeIntervalId = null;
    }
  }

  function setExpanded(next) {
    expanded = next;
    panelEl.classList.toggle('scribble-open', expanded);
    panelEl.toggleAttribute('inert', !expanded);
    panelEl.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    pillMainEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    if (expanded) {
      startThemePolling();
      const firstFocusable = panelEl.querySelector('button, a[href]');
      if (firstFocusable) firstFocusable.focus();
    } else {
      stopThemePolling();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && expanded) {
      setExpanded(false);
      pillMainEl.focus();
    }
  }

  function ensureMounted() {
    if (mounted) return;
    mounted = true;

    hostEl = document.createElement('div');
    hostEl.id = 'scribble-deals-host';
    document.documentElement.appendChild(hostEl);

    shadow = hostEl.attachShadow({ mode: 'open' });
    attachStyles(shadow);
    applyTheme();

    const wrapper = document.createElement('div');
    wrapper.className = 'scribble-wrapper';
    wrapper.innerHTML = `
      <div class="scribble-panel" role="dialog" aria-label="Scribble deals" aria-hidden="true" inert>
        <div class="scribble-panel-header">
          <span class="scribble-panel-title"></span>
          <button type="button" class="scribble-close" aria-label="Close">${SVG_X}</button>
        </div>
        <div class="scribble-card-list"></div>
        <div class="scribble-footer">
          ${SVG_PADLOCK}
          <span>Found locally. Your chat never leaves this device.</span>
        </div>
      </div>
      <div class="scribble-pill">
        <button type="button" class="scribble-pill-dismiss" aria-label="Dismiss deals for this site">${SVG_X}</button>
        <button type="button" class="scribble-pill-main" aria-haspopup="dialog" aria-expanded="false">
          <span class="scribble-pill-mark">${SVG_SCRIBBLE_S}</span>
          <span class="scribble-pill-count"></span>
          ${SVG_CHEVRON}
        </button>
      </div>
    `;
    shadow.appendChild(wrapper);

    panelEl = wrapper.querySelector('.scribble-panel');
    panelTitleEl = wrapper.querySelector('.scribble-panel-title');
    cardListEl = wrapper.querySelector('.scribble-card-list');
    const closeBtn = wrapper.querySelector('.scribble-close');
    pillMainEl = wrapper.querySelector('.scribble-pill-main');
    pillCountEl = wrapper.querySelector('.scribble-pill-count');
    const dismissBtn = wrapper.querySelector('.scribble-pill-dismiss');

    pillMainEl.addEventListener('click', () => setExpanded(!expanded));
    closeBtn.addEventListener('click', () => {
      setExpanded(false);
      pillMainEl.focus();
    });
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markDismissedThisSession();
      hide();
    });
    document.addEventListener('keydown', onKeyDown);

    debugLog(
      'mounted: isConnected=', hostEl.isConnected,
      'rect=', JSON.stringify(hostEl.getBoundingClientRect()),
      'resolved z-index=', getComputedStyle(hostEl).zIndex
    );
  }

  function updateContent(offers, category) {
    const ranked = rankOffers(offers);
    const displayName = truncate(humanizeCategory(category), 24);
    const count = ranked.length;
    const label = `${count} ${count === 1 ? 'deal' : 'deals'} · ${displayName}`;

    pillCountEl.textContent = label;
    panelTitleEl.textContent = `Deals for ${displayName}`;

    const key = category + '|' + ranked.map((o) => o.id).join(',');
    if (key === lastRenderedKey) {
      // Same offer set as last render -- skip the DOM rebuild entirely so
      // an open panel never flickers or loses scroll position on a
      // redundant classifier cycle.
      return;
    }
    lastRenderedKey = key;

    const scrollTop = cardListEl.scrollTop;
    cardListEl.innerHTML = '';
    ranked.forEach((offer) => {
      cardListEl.appendChild(renderCard(offer));
    });
    cardListEl.scrollTop = scrollTop;
  }

  function render(offers, category) {
    if (isDismissedThisSession()) return;

    ensureMounted();
    hostEl.style.display = '';
    updateContent(offers, category);

    debugLog(
      'post-render check: isConnected=', hostEl.isConnected,
      'rect=', JSON.stringify(hostEl.getBoundingClientRect()),
      'resolved z-index=', getComputedStyle(hostEl).zIndex,
      'offers=', offers.length
    );
  }

  function hide() {
    if (hostEl) {
      hostEl.style.display = 'none';
    }
  }

  // Called by main.js the moment a new turn/route/null-classification
  // invalidates whatever's currently showing -- e.g. a hotels panel must
  // not still be visible once the conversation has moved on to lipstick.
  // This is a VISIBILITY + CONTENT reset, not a host removal: the
  // mount-once guard is untouched (mounted/hostEl/shadow stay as they
  // are), so the next successful render() just re-populates and re-shows
  // the same host rather than re-mounting.
  function clear(reason) {
    if (expanded) {
      setExpanded(false);
    }
    if (cardListEl) {
      cardListEl.innerHTML = '';
    }
    lastRenderedKey = null;
    if (hostEl) {
      hostEl.style.display = 'none';
    }
    debugLog('panel cleared: ' + reason);
  }

  // Called by main.js when the extension context is invalidated (reload
  // while this tab stayed open). Removes the panel from the page entirely
  // rather than leaving a dead, unresponsive host element behind.
  function teardown() {
    stopThemePolling();
    document.removeEventListener('keydown', onKeyDown);
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
    mounted = false;
    lastRenderedKey = null;
  }

  window.ScribblePanel = { render, hide, clear, isDismissedThisSession, teardown };
})();
