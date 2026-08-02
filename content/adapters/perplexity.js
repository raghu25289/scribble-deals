// Adapter: www.perplexity.ai
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Rebuilt against a verified live structure (2 Aug 2026), not guessed.
// The Radix tabs structure (Answer/Links/Images) is the stable spine;
// Radix's own generated ids (radix-_r_xx_) are never selected on.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/adapter:perplexity]', ...args);
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    return `<${el.tagName.toLowerCase()}${id}>`;
  }

  // document.title on Perplexity carries a " - Perplexity" (or similar)
  // suffix past the actual query -- only relevant when userText falls
  // back to the title (heading selector missed), but when it does, the
  // suffix pollutes budget/pattern matching with irrelevant trailing text.
  function cleanTitle(title) {
    return (title || '').replace(/\s*[-|]\s*Perplexity(\s+AI)?\s*$/i, '').trim();
  }

  function getActivePanel() {
    return (
      document.querySelector('main [role="tabpanel"][data-state="active"]') ||
      document.querySelector('[role="tabpanel"][data-state="active"]')
    );
  }

  function getConversationRoot() {
    const panel = getActivePanel();
    if (panel) {
      debugLog('conversation root: level 1 (active tabpanel)', describeElement(panel));
      return panel;
    }

    const main = document.querySelector('main');
    if (main) {
      debugLog('conversation root: level 2 fallback (main) -- no active tabpanel found');
      return main;
    }

    debugLog('conversation root: level 3 fallback (document.body)');
    return document.body;
  }

  function extract() {
    const panel = getActivePanel();
    if (!panel) {
      debugLog('extract(): no active tabpanel found, falling back to document.title for userText');
      return { userText: cleanTitle(document.title), responseText: '' };
    }

    // Query heading lives inside the active panel; the Links/Images panels
    // are data-state="inactive" and stay empty until opened, so sources
    // are excluded automatically -- inactive panels are never read.
    const headingEl = panel.querySelector('[role="heading"]');
    let userText = headingEl ? (headingEl.innerText || '') : '';
    if (!userText) {
      debugLog('extract(): no [role="heading"] in active panel, falling back to document.title');
      userText = cleanTitle(document.title);
    }

    let responseText = panel.innerText || '';
    if (headingEl) {
      const headingText = headingEl.innerText || '';
      if (headingText && responseText.startsWith(headingText)) {
        responseText = responseText.slice(headingText.length).trimStart();
      }
    }

    return { userText, responseText };
  }

  window.ScribbleAdapters.perplexity = { getConversationRoot, extract };
})();
