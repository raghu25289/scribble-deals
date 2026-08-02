// Adapter: claude.ai
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// claude.ai's DOM structure changes without notice; when it breaks, fixing
// it should mean editing only this file's selectors, nothing else.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function getConversationRoot() {
    return (
      document.querySelector('[data-testid="conversation-turns"]') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function extract() {
    // Human turns and assistant turns carry distinct data-testid markers in
    // current Claude markup.
    const humanTurns = document.querySelectorAll('[data-testid="user-message"]');
    const assistantTurns = document.querySelectorAll('[data-testid="assistant-message"], .font-claude-message');

    const userText = humanTurns.length ? humanTurns[humanTurns.length - 1].innerText || '' : '';
    const responseText = assistantTurns.length
      ? assistantTurns[assistantTurns.length - 1].innerText || ''
      : '';

    return { userText, responseText };
  }

  window.ScribbleAdapters.claude = { getConversationRoot, extract };
})();
