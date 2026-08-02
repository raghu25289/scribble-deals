// Adapter: www.google.com/search
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Rebuilt against a verified live structure (2 Aug 2026) -- replaces the
// earlier v1.1 speculative candidate chain (data-subtree/jscontroller
// guesses), which was explicitly built against unverified content and is
// no longer needed now that a confirmed anchor exists. Google's SERP is
// still obfuscated and A/B tested, so this stays defensive: never select
// by jsname or generated ids, always land on query-only rather than
// failing silent.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/adapter:google]', ...args);
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    return `<${el.tagName.toLowerCase()}${id}>`;
  }

  // Phrases Google itself renders inside the overview container when
  // generation failed or is unavailable -- these are NOT page content in
  // the sense the privacy rule cares about (they're Google's own static
  // UI strings, not conversation content), so matching against them here
  // is fine; nothing about the user's query or the page's substance is
  // logged.
  const NO_OVERVIEW_PHRASES = [
    'an ai overview is not available for this search',
    "can't generate an ai overview right now",
    'cant generate an ai overview right now'
  ];

  function findOverviewHeading() {
    const headings = document.querySelectorAll('[role="heading"]');
    for (const h of headings) {
      if ((h.innerText || '').trim() === 'AI Overview') return h;
    }
    return null;
  }

  function findOverviewContainer() {
    const heading = findOverviewHeading();
    if (!heading) {
      debugLog('no [role="heading"] with text "AI Overview" found');
      return null;
    }

    let node = heading;
    for (let i = 0; i < 12 && node; i++) {
      if (node.id === 'm-x-content' || node.hasAttribute('data-mcpr') || node.hasAttribute('data-subtree')) {
        debugLog('overview container found:', describeElement(node));
        return node;
      }
      node = node.parentElement;
    }

    debugLog('AI Overview heading found but no #m-x-content/[data-mcpr]/[data-subtree] ancestor within 12 levels -- using the heading\'s parent as a last resort');
    return heading.parentElement;
  }

  function getConversationRoot() {
    const overview = findOverviewContainer();
    if (overview) {
      debugLog('conversation root: level 1 (overview container)');
      return overview;
    }

    const search = document.querySelector('#search');
    if (search) {
      debugLog('conversation root: level 2 fallback (#search) -- no overview container found yet');
      return search;
    }

    const rcnt = document.querySelector('#rcnt');
    if (rcnt) {
      debugLog('conversation root: level 3 fallback (#rcnt)');
      return rcnt;
    }

    debugLog('conversation root: level 4 fallback (document.body) -- no #search/#rcnt found');
    return document.body;
  }

  function getQueryFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q) return q;
    } catch (e) {
      // fall through to the input-value fallback below
    }
    try {
      const input = document.querySelector('input[name="q"], textarea[name="q"]');
      return (input && input.value) || '';
    } catch (e) {
      return '';
    }
  }

  function looksLikeNoOverviewMessage(text) {
    const lower = text.toLowerCase();
    return NO_OVERVIEW_PHRASES.some((phrase) => lower.includes(phrase));
  }

  function extractOverviewText() {
    const container = findOverviewContainer();
    if (!container) {
      debugLog('no AI Overview container -- falling back to query-only (clean, expected path, not a failure)');
      return '';
    }

    const text = container.innerText || '';
    if (looksLikeNoOverviewMessage(text)) {
      debugLog('AI Overview container present but shows a not-available/failed message -- treating as no-overview');
      return '';
    }

    return text;
  }

  function extract() {
    const userText = getQueryFromUrl();
    const responseText = extractOverviewText();
    return { userText, responseText };
  }

  window.ScribbleAdapters.google = { getConversationRoot, extract };
})();
