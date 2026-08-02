// Adapter: www.google.com/search
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Google's SERP markup is obfuscated, A/B tested, and changes constantly --
// unlike the chat adapters, there is no single confident selector here by
// design. This adapter tries several independent candidates in sequence,
// DEBUG-logs every attempt, and always has a safe query-only fallback
// rather than failing silent. Matches only /search paths (enforced by the
// manifest match pattern, not re-checked here).
//
// PROVENANCE NOTE: the captured HTML this file was rebuilt against reads
// as Google's own "what is an AI Overview" explainer copy (a definitional
// blurb about AI Overviews themselves), not a live overview answering an
// actual shopping query -- so the exact selectors below are informed by
// its real DOM shape (jscontroller/data-sfc-root/data-subtree attributes)
// but not verified against genuine shopping-query overview content. If
// this adapter's fallback-chain DEBUG logs show every candidate missing
// on a real overview, that's the signal to recapture from an actual
// "best X under $Y" query with a visible overview and tighten the chain.

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

  // Ordered, independent candidates for the AI Overview container. Each is
  // tried in turn; none is assumed correct. "mfl"/"aimfl" appears in a
  // data-subtree value in the captured markup (plausibly "AI multi-line" /
  // "model-fed-line" internal naming); jscontroller values are Google's
  // own JS-framework wiring hooks, which tend to outlive CSS class names
  // (those are visibly hashed/build-generated in the captured markup) but
  // are still not guaranteed stable across deploys or A/B cohorts.
  const OVERVIEW_CONTAINER_CANDIDATES = [
    '[data-subtree*="mfl"]',
    '[jscontroller^="TDBkbc"]',
    '[data-sfc-root="ep"]',
    // Pre-existing, less specific candidates from the original build --
    // kept as later-priority fallbacks rather than removed, since they
    // cost nothing to try and may still catch a differently-shaped overview.
    '[data-attrid="wa:/description"]',
    '[jsname][data-hveid] div[data-attrid]'
  ];

  function findOverviewContainer() {
    for (const sel of OVERVIEW_CONTAINER_CANDIDATES) {
      let el;
      try {
        el = document.querySelector(sel);
      } catch (e) {
        continue;
      }
      if (el) {
        debugLog('overview container candidate matched:', sel, describeElement(el));
        return el;
      }
      debugLog('overview container candidate missed:', sel);
    }
    return null;
  }

  function getConversationRoot() {
    const overview = findOverviewContainer();
    if (overview) {
      debugLog('conversation root: level 1 (overview container)', describeElement(overview));
      return overview;
    }

    const rso = document.querySelector('#rso');
    if (rso) {
      debugLog('conversation root: level 2 fallback (#rso) -- no overview container found yet');
      return rso;
    }

    const search = document.querySelector('#search');
    if (search) {
      debugLog('conversation root: level 3 fallback (#search)');
      return search;
    }

    debugLog('conversation root: level 4 fallback (document.body) -- no #rso/#search found');
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
    // Secondary source, per the shared rule: read the input's current
    // value, never write to it or dispatch anything at it.
    try {
      const input = document.querySelector('input[name="q"], textarea[name="q"]');
      return (input && input.value) || '';
    } catch (e) {
      return '';
    }
  }

  function extractOverviewText() {
    // Re-scan the same candidate list at extract() time (not just at
    // getConversationRoot() time) -- the overview loads asynchronously
    // and may not have existed yet when the root was first resolved; by
    // the time a mutation settles enough to classify, it likely has.
    for (const sel of OVERVIEW_CONTAINER_CANDIDATES) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      for (const el of nodes) {
        const text = el.innerText || '';
        if (text.length > 40) {
          debugLog('overview text extracted via:', sel);
          return text;
        }
      }
    }

    // Last-resort broad candidate, matching the original v1.0 heuristic:
    // any result-column block with substantial text. Deliberately last --
    // widest net, most likely to catch the wrong thing.
    const broad = document.querySelectorAll('#rso div[data-hveid]');
    for (const el of broad) {
      const text = el.innerText || '';
      if (text.length > 40) {
        debugLog('overview text extracted via broad fallback: #rso div[data-hveid]');
        return text;
      }
    }

    debugLog('no AI Overview found by any candidate -- falling back to query-only (per product spec, this is fine: a search query is itself high-signal)');
    return '';
  }

  function extract() {
    const userText = getQueryFromUrl();
    const responseText = extractOverviewText();
    return { userText, responseText };
  }

  window.ScribbleAdapters.google = { getConversationRoot, extract };
})();
