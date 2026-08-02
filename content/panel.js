// Offer panel: shadow-DOM UI injected into the host page. Reads and
// renders only -- no synthetic events on the host page, no clicks, no
// input manipulation. All outbound links open in a new tab via normal
// anchor semantics (rel=noopener), never programmatic navigation.

(function () {
  const SESSION_DISMISS_KEY = 'scribble_panel_dismissed';

  // Bundled inline, not loaded via chrome.runtime.getURL(). A URL-based
  // stylesheet load (or a manifest "css" content-script injection) requires
  // either web_accessible_resources or a page-visible <link>/<style> tag in
  // the host document -- both give a page script a way to detect Scribble
  // is installed. Shipping the CSS as a string and attaching it only inside
  // this shadow root avoids both: nothing extension-identifiable ever
  // touches the host page's own DOM or resource-load surface.
  const PANEL_CSS = `
.scribble-wrapper {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.scribble-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #14532d;
  color: #ffffff;
  padding: 10px 16px;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.scribble-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
}

.scribble-pill-active {
  background: #166534;
}

.scribble-pill-icon {
  font-size: 15px;
}

.scribble-panel {
  width: 320px;
  max-height: 420px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
}

.scribble-panel[hidden] {
  display: none;
}

.scribble-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.scribble-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.scribble-dismiss {
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 4px;
}

.scribble-dismiss:hover {
  color: #111827;
}

.scribble-card-list {
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scribble-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
}

.scribble-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.scribble-merchant {
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.scribble-sponsored-badge {
  font-size: 10px;
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
  border-radius: 999px;
  padding: 2px 8px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.scribble-title {
  font-size: 13px;
  color: #1f2937;
  margin-bottom: 2px;
}

.scribble-discount {
  font-size: 13px;
  font-weight: 700;
  color: #166534;
  margin-bottom: 8px;
}

.scribble-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.scribble-copy-btn {
  flex: 1;
  border: 1px dashed #9ca3af;
  background: #f9fafb;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
}

.scribble-copy-btn:hover {
  background: #f3f4f6;
}

.scribble-outbound {
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  background: #14532d;
  border-radius: 8px;
  padding: 7px 10px;
  text-decoration: none;
  white-space: nowrap;
}

.scribble-outbound:hover {
  background: #166534;
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

  let hostEl = null;
  let shadow = null;
  let pillEl = null;
  let cardListEl = null;
  let expanded = false;

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

  function ensureMounted() {
    if (hostEl) return;

    hostEl = document.createElement('div');
    hostEl.id = 'scribble-deals-host';
    hostEl.style.all = 'initial';
    document.documentElement.appendChild(hostEl);

    shadow = hostEl.attachShadow({ mode: 'open' });
    attachStyles(shadow);

    const wrapper = document.createElement('div');
    wrapper.className = 'scribble-wrapper';
    wrapper.innerHTML = `
      <div class="scribble-pill" part="pill">
        <span class="scribble-pill-icon">✎</span>
        <span class="scribble-pill-label">Deals</span>
      </div>
      <div class="scribble-panel" hidden>
        <div class="scribble-panel-header">
          <span class="scribble-panel-title">Scribble Deals</span>
          <button type="button" class="scribble-dismiss" title="Dismiss for this session">✕</button>
        </div>
        <div class="scribble-card-list"></div>
      </div>
    `;
    shadow.appendChild(wrapper);

    pillEl = wrapper.querySelector('.scribble-pill');
    const panelEl = wrapper.querySelector('.scribble-panel');
    cardListEl = wrapper.querySelector('.scribble-card-list');
    const dismissBtn = wrapper.querySelector('.scribble-dismiss');

    pillEl.addEventListener('click', () => {
      expanded = !expanded;
      panelEl.hidden = !expanded;
      pillEl.classList.toggle('scribble-pill-active', expanded);
    });

    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markDismissedThisSession();
      hide();
    });
  }

  function copyToClipboard(text) {
    // Clipboard write originates from extension UI (the shadow DOM panel),
    // not from the host page -- this is explicitly allowed. We never write
    // into the host page's DOM or inputs.
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function renderCard(offer) {
    const card = document.createElement('div');
    card.className = 'scribble-card';

    const sponsoredBadge = offer.sponsored
      ? '<span class="scribble-sponsored-badge">Sponsored</span>'
      : '';

    card.innerHTML = `
      <div class="scribble-card-top">
        <span class="scribble-merchant">${escapeHtml(offer.merchant)}</span>
        ${sponsoredBadge}
      </div>
      <div class="scribble-title">${escapeHtml(offer.title)}</div>
      <div class="scribble-discount">${escapeHtml(offer.discount_text)}</div>
      <div class="scribble-card-actions">
        <button type="button" class="scribble-copy-btn" data-code="${escapeHtml(offer.code)}">
          ${escapeHtml(offer.code)} · Copy
        </button>
        <a class="scribble-outbound" href="${escapeAttr(offer.url)}" target="_blank" rel="noopener noreferrer">
          Get deal ↗
        </a>
      </div>
    `;

    const copyBtn = card.querySelector('.scribble-copy-btn');
    copyBtn.addEventListener('click', () => {
      copyToClipboard(offer.code);
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1200);
    });

    return card;
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

  function render(offers) {
    if (isDismissedThisSession()) return;
    ensureMounted();

    const ranked = rankOffers(offers);
    cardListEl.innerHTML = '';
    ranked.forEach((offer) => {
      cardListEl.appendChild(renderCard(offer));
    });

    hostEl.style.display = '';
  }

  function hide() {
    if (hostEl) {
      hostEl.style.display = 'none';
    }
  }

  window.ScribblePanel = { render, hide, isDismissedThisSession };
})();
