// Adapter: gemini.google.com
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Gemini's DOM structure changes without notice; when it breaks, fixing it
// should mean editing only this file's selectors, nothing else.
//
// Observes the chat container for completed turns.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function getConversationRoot() {
    return (
      document.querySelector('chat-window') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function extract() {
    const userTurns = document.querySelectorAll('user-query, [data-test-id="user-query-content"]');
    const responseTurns = document.querySelectorAll('model-response, [data-test-id="response-container"]');

    const userText = userTurns.length ? userTurns[userTurns.length - 1].innerText || '' : '';
    const responseText = responseTurns.length
      ? responseTurns[responseTurns.length - 1].innerText || ''
      : '';

    return { userText, responseText };
  }

  window.ScribbleAdapters.gemini = { getConversationRoot, extract };
})();
