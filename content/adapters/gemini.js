// Adapter: gemini.google.com
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Rebuilt against a verified live structure (2 Aug 2026), not guessed.
// Angular custom-element TAG NAMES are the stable spine here -- they're
// more durable than the hashed classes/generated ids that would otherwise
// be the only alternative.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/adapter:gemini]', ...args);
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    return `<${el.tagName.toLowerCase()}${id}>`;
  }

  function getConversationRoot() {
    const scroller = document.querySelector('chat-window chat-window-content infinite-scroller');
    if (scroller) {
      debugLog('conversation root: level 1 (infinite-scroller)', describeElement(scroller));
      return scroller;
    }

    const content = document.querySelector('chat-window chat-window-content');
    if (content) {
      debugLog('conversation root: level 2 fallback (chat-window-content) -- no infinite-scroller found');
      return content;
    }

    const chatWindow = document.querySelector('chat-window');
    if (chatWindow) {
      debugLog('conversation root: level 3 fallback (chat-window)');
      return chatWindow;
    }

    const main = document.querySelector('main');
    if (main) {
      debugLog('conversation root: level 4 fallback (main)');
      return main;
    }

    debugLog('conversation root: level 5 fallback (document.body) -- no chat-window/main found');
    return document.body;
  }

  // Citations, disclaimers, and action-bar chrome inside a response --
  // stripped from a CLONE before reading innerText, never touched on the
  // live DOM (read-only rule).
  const RESPONSE_EXCLUDE_TAGS = [
    'sources-carousel-inline', 'source-inline-chip', 'sources-list',
    'message-actions', 'model-response-disclaimers', 'freemium-rag-disclaimer'
  ];

  function cleanResponseText(messageContentEl) {
    const clone = messageContentEl.cloneNode(true);
    RESPONSE_EXCLUDE_TAGS.forEach((tag) => {
      clone.querySelectorAll(tag).forEach((el) => el.remove());
    });
    return clone.innerText || '';
  }

  function extract() {
    const userQueries = document.querySelectorAll('user-query');
    let userText = '';
    if (userQueries.length) {
      const last = userQueries[userQueries.length - 1];
      const contentEl = last.querySelector('user-query-content');
      userText = (contentEl || last).innerText || '';
    } else {
      debugLog('extract(): no <user-query> elements found');
    }

    const modelResponses = document.querySelectorAll('model-response');
    let responseText = '';
    if (modelResponses.length) {
      const last = modelResponses[modelResponses.length - 1];
      const thinking = last.querySelector('thinking-overlay');
      if (thinking) {
        debugLog('extract(): thinking-overlay present, response still generating (debounce/cap is the backstop)');
      }

      const messageContent =
        last.querySelector('response-container message-content') ||
        last.querySelector('message-content');
      if (messageContent) {
        responseText = cleanResponseText(messageContent);
      } else {
        debugLog('extract(): <model-response> found but no message-content inside it');
      }
    } else {
      debugLog('extract(): no <model-response> elements found');
    }

    return { userText, responseText };
  }

  window.ScribbleAdapters.gemini = { getConversationRoot, extract };
})();
