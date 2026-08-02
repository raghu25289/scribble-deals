// Adapter: chatgpt.com
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// ChatGPT's DOM structure changes without notice, and class names on
// chatgpt.com are build-hashed and rotate between deploys -- never anchor a
// selector on a hashed class. Prefer stable attributes: data-testid,
// data-message-author-role, aria roles, semantic tags (main, article).
//
// STATUS: this file has NOT yet been verified against a real captured DOM
// snapshot. It's written defensively against ChatGPT's documented/observed
// attribute conventions (data-message-author-role on turn nodes, wrapped in
// <article data-testid="conversation-turn-N">), with a fallback chain for
// when those move. Paste real outerHTML from a live session to verify/tune
// this -- see the diagnostic log lines below for exactly what's failing.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/adapter:chatgpt]', ...args);
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    const testId = el.getAttribute && el.getAttribute('data-testid');
    return `<${el.tagName.toLowerCase()}${id}${testId ? ` [data-testid=${testId}]` : ''}>`;
  }

  function getConversationRoot() {
    // Level 1: the narrowest container that actually wraps the turn list.
    // Anchor on the common ancestor of the turn nodes rather than a
    // specific wrapper class/testid, since that ancestor's own attributes
    // are the least stable part of the tree.
    const turns = document.querySelectorAll('[data-message-author-role]');
    if (turns.length) {
      // Walk up from the first turn until we find an ancestor that also
      // contains the last turn -- i.e. the shared thread container.
      let candidate = turns[0].parentElement;
      const lastTurn = turns[turns.length - 1];
      while (candidate && candidate !== document.body) {
        if (candidate.contains(lastTurn)) {
          debugLog('conversation root: level 1 (turn-list common ancestor)', describeElement(candidate));
          return candidate;
        }
        candidate = candidate.parentElement;
      }
    }

    // Level 2: semantic fallback.
    const main = document.querySelector('main');
    if (main) {
      debugLog('conversation root: level 2 fallback (main)', describeElement(main));
      return main;
    }

    // Level 3: last resort.
    debugLog('conversation root: level 3 fallback (document.body) -- no turns and no <main> found');
    return document.body;
  }

  function turnText(el) {
    // Tolerate embedded product cards, carousels, and tables inside a turn:
    // innerText serializes all visible descendant text, so rich content
    // inside the assistant turn is included and counts as response text.
    // Prefer the closest [data-testid^="conversation-turn-"] wrapper (the
    // full <article>) over the narrower role node when present, since some
    // rich content renders as a sibling of the role div rather than inside it.
    const wrapper = el.closest('[data-testid^="conversation-turn-"]') || el;
    return wrapper.innerText || '';
  }

  function extract() {
    const turns = document.querySelectorAll('[data-message-author-role]');
    if (!turns.length) {
      debugLog('extract(): no [data-message-author-role] nodes found in document');
      return { userText: '', responseText: '' };
    }

    let userText = '';
    let responseText = '';

    for (let i = turns.length - 1; i >= 0; i--) {
      const role = turns[i].getAttribute('data-message-author-role');
      if (role === 'assistant' && !responseText) {
        responseText = turnText(turns[i]);
      } else if (role === 'user' && !userText) {
        userText = turnText(turns[i]);
      }
      if (userText && responseText) break;
    }

    return { userText, responseText };
  }

  window.ScribbleAdapters.chatgpt = { getConversationRoot, extract };
})();
