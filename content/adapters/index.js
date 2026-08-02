// Adapter registry: hostname -> adapter + surface key.
//
// Adding a sixth surface touches exactly three places:
//   1. a new content/adapters/<name>.js implementing getConversationRoot()/extract()
//   2. one match pattern in manifest.json
//   3. one line in this file's REGISTRY map
// Nothing else in the extension needs to change.

(function () {
  const REGISTRY = {
    'chatgpt.com': { surfaceKey: 'chatgpt', adapter: window.ScribbleAdapters.chatgpt },
    'claude.ai': { surfaceKey: 'claude', adapter: window.ScribbleAdapters.claude },
    'www.google.com': { surfaceKey: 'google', adapter: window.ScribbleAdapters.google },
    'www.perplexity.ai': { surfaceKey: 'perplexity', adapter: window.ScribbleAdapters.perplexity },
    'gemini.google.com': { surfaceKey: 'gemini', adapter: window.ScribbleAdapters.gemini }

    // Second wave (adapters not yet written):
    // 'chat.deepseek.com': { surfaceKey: 'deepseek', adapter: window.ScribbleAdapters.deepseek },
    // 'grok.com': { surfaceKey: 'grok', adapter: window.ScribbleAdapters.grok },
    // 'copilot.microsoft.com': { surfaceKey: 'copilot', adapter: window.ScribbleAdapters.copilot },
    // 'meta.ai': { surfaceKey: 'meta', adapter: window.ScribbleAdapters.meta },
  };

  function getAdapterForHostname(hostname) {
    return REGISTRY[hostname] || null;
  }

  window.ScribbleAdapterRegistry = { getAdapterForHostname };
})();
