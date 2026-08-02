// Adapter: www.google.com/search
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Google's SERP markup is obfuscated and changes constantly; when it
// breaks, fixing it should mean editing only this file's selectors.
//
// Reads the AI Overview block when present, else falls back to the query
// string from the results page. Matches only /search paths (enforced by
// the manifest match pattern, not re-checked here).

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function getConversationRoot() {
    // AI Overview container, when present. Falls back to the main results
    // column so the MutationObserver still has something stable to watch.
    return (
      document.querySelector('#rso') ||
      document.querySelector('#search') ||
      document.body
    );
  }

  function getQueryFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('q') || '';
    } catch (e) {
      return '';
    }
  }

  function extract() {
    const userText = getQueryFromUrl();

    // AI Overview block: Google wraps it in a container generally reachable
    // via a distinctive heading or region role. Selector kept loose and
    // defensive since this is the single most likely thing to break.
    const overviewCandidates = document.querySelectorAll(
      '[data-attrid="wa:/description"], [jsname][data-hveid] div[data-attrid], #rso div[data-hveid]'
    );

    let responseText = '';
    for (const el of overviewCandidates) {
      const text = el.innerText || '';
      if (text.length > 40) {
        responseText = text;
        break;
      }
    }

    return { userText, responseText };
  }

  window.ScribbleAdapters.google = { getConversationRoot, extract };
})();
