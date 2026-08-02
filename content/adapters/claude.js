// Adapter: claude.ai
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Rebuilt against a verified live structure (2 Aug 2026), not guessed --
// but claude.ai's hashed utility classes still rotate per deploy, so if
// this breaks, the fix should mean editing only this file. The stable
// spine is role/aria/data-testid attributes, not classes.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/adapter:claude]', ...args);
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    const role = el.getAttribute && el.getAttribute('role');
    return `<${el.tagName.toLowerCase()}${id}${role ? ` [role=${role}]` : ''}>`;
  }

  function getConversationRoot() {
    const feed = document.querySelector('div[role="feed"][aria-label="Chat messages"]');
    if (feed) {
      debugLog('conversation root: level 1 (feed)', describeElement(feed));
      return feed;
    }

    const autoscroll = document.querySelector('[data-autoscroll-container="true"]');
    if (autoscroll) {
      debugLog('conversation root: level 2 fallback (autoscroll container)', describeElement(autoscroll));
      return autoscroll;
    }

    const main = document.querySelector('main');
    if (main) {
      debugLog('conversation root: level 3 fallback (main) -- no feed/autoscroll container found');
      return main;
    }

    debugLog('conversation root: level 4 fallback (document.body) -- no feed/autoscroll/main found');
    return document.body;
  }

  function extract() {
    // Turns are div[role="article"], each aria-label="Message N of M".
    // Artifact side panels render OUTSIDE the feed, so observing/reading
    // from within the feed root already excludes them without any extra
    // filtering here.
    const articles = document.querySelectorAll('div[role="article"]');
    if (!articles.length) {
      debugLog('extract(): no [role="article"] turns found');
      return { userText: '', responseText: '' };
    }

    let userText = '';
    let responseText = '';

    for (let i = articles.length - 1; i >= 0; i--) {
      const article = articles[i];

      if (!userText) {
        const userNode = article.querySelector('[data-testid="user-message"]');
        if (userNode) {
          userText = userNode.innerText || '';
        }
      }

      if (!responseText) {
        const isUserArticle = article.querySelector('[data-testid="user-message"]');
        if (!isUserArticle) {
          const streamingEl = article.querySelector('[data-is-streaming]');
          if (streamingEl) {
            debugLog('assistant turn data-is-streaming=', streamingEl.getAttribute('data-is-streaming'));
          }
          // The article's accessible text carries an a11y-only prefix
          // ("Claude responded:") ahead of the actual response content.
          let text = article.innerText || '';
          text = text.replace(/^Claude responded:\s*/, '');
          responseText = text;
        }
      }

      if (userText && responseText) break;
    }

    if (!userText) debugLog('extract(): no article containing [data-testid="user-message"] found');
    if (!responseText) debugLog('extract(): no non-user article found for the assistant turn');

    return { userText, responseText };
  }

  window.ScribbleAdapters.claude = { getConversationRoot, extract };
})();
