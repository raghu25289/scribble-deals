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
    debugLog('extract(): found', articles.length, '[role="article"] elements');

    if (!articles.length) {
      debugLog('extract(): no [role="article"] turns found');
      return { userText: '', responseText: '' };
    }

    const lastArticle = articles[articles.length - 1];
    const lastHasUserMessage = !!lastArticle.querySelector('[data-testid="user-message"]');
    debugLog('extract(): last article contains [data-testid="user-message"]?', lastHasUserMessage);

    let userText = '';
    let responseText = '';

    for (let i = articles.length - 1; i >= 0; i--) {
      const article = articles[i];
      const userNode = article.querySelector('[data-testid="user-message"]');

      if (!userText && userNode) {
        userText = userNode.innerText || '';
      }

      if (!responseText && !userNode) {
        const streamingEl = article.querySelector('[data-is-streaming]');
        if (streamingEl) {
          debugLog('assistant-candidate article (index', i, ') data-is-streaming=', streamingEl.getAttribute('data-is-streaming'));
        }

        // The article's accessible text carries an a11y-only prefix
        // ("Claude responded:") ahead of the actual response content.
        const rawText = article.innerText || '';
        const stripped = rawText.replace(/^Claude responded:\s*/i, '');
        debugLog('assistant-candidate article (index', i, ') innerText length before strip=', rawText.length, 'after strip=', stripped.length);

        if (stripped.length > 0) {
          responseText = stripped;
        } else {
          // This non-user article had nothing left after stripping --
          // likely a trailing action-bar/placeholder article rather than
          // the real assistant turn (this is the "last article is empty"
          // failure mode: grabbing it here would lock in responseText=''
          // even though an earlier article has the real content). Keep
          // scanning backward instead of accepting it.
          debugLog('assistant-candidate article (index', i, ') empty after strip, trying an earlier article');
        }
      }

      if (userText && responseText) break;
    }

    if (!userText) debugLog('extract(): no article containing [data-testid="user-message"] found');
    if (!responseText) debugLog('extract(): no non-empty non-user article found for the assistant turn');

    return { userText, responseText };
  }

  window.ScribbleAdapters.claude = { getConversationRoot, extract };
})();
