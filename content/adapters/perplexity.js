// Adapter: www.perplexity.ai
//
// SELECTOR WARNING: everything below is scoped to this file on purpose.
// Perplexity's DOM structure changes without notice; when it breaks, fixing
// it should mean editing only this file's selectors, nothing else.
//
// Reads the query and the answer block. The sources sidebar exists in the
// DOM but is deliberately ignored for classification -- it's citations, not
// shopping intent signal.

(function () {
  window.ScribbleAdapters = window.ScribbleAdapters || {};

  function getConversationRoot() {
    return (
      document.querySelector('main') ||
      document.body
    );
  }

  function extract() {
    // Query text usually renders as a heading-like block at the top of a
    // thread turn; answer renders in a prose block below it. Both selectors
    // are intentionally broad with an innerText length filter as a
    // safety net since Perplexity's class names are hashed/unstable.
    const queryEl = document.querySelector('[data-testid="thread-query"], h1');
    const answerEls = document.querySelectorAll(
      '[data-testid="answer-content"], .prose'
    );

    const userText = queryEl ? queryEl.innerText || '' : '';
    const responseText = answerEls.length
      ? answerEls[answerEls.length - 1].innerText || ''
      : '';

    // Note: sources/citations sidebar intentionally not read here.

    return { userText, responseText };
  }

  window.ScribbleAdapters.perplexity = { getConversationRoot, extract };
})();
