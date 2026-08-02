// Surface flags + global config. Loaded before adapters/index.js so the
// registry and main.js can read window.ScribbleConfig synchronously.
//
// To add a second-wave surface: flip its flag here, write one adapter file,
// add one line to adapters/index.js, and one match pattern in manifest.json.
// That's the whole checklist -- nothing else in the extension should need
// to change.

(function () {
  // Build stamp: bump this on every content-script change. Logged
  // unconditionally (the one deliberate exception to "DEBUG gates every
  // log" below) so a stale reload after an edit is caught by eye in the
  // console immediately, instead of silently debugging the wrong build.
  const VERSION = 'v1.1';
  console.log('[Scribble] ' + VERSION);

  window.ScribbleConfig = {
    VERSION,

    // Set true only for local debugging. Gates every diagnostic console.log
    // in the extension. Must ship false -- production paths never log page
    // content, and this flag governs the only logging that exists at all.
    DEBUG: true,

    // Debounce window (ms) after the observed conversation container goes
    // quiet before we classify. Streaming responses mean we don't want to
    // classify mid-stream.
    STABLE_MS: 800,

    // Hard cap (ms): classify at most this long after the first mutation of
    // a new burst, even if the container never goes fully quiet (product
    // carousels/tables/lazy images can mutate indefinitely and starve the
    // stability debounce otherwise).
    STABLE_CAP_MS: 4000,

    SURFACES: {
      chatgpt: { enabled: true, hostname: 'chatgpt.com', label: 'ChatGPT' },
      claude: { enabled: true, hostname: 'claude.ai', label: 'Claude' },
      google: { enabled: true, hostname: 'www.google.com', label: 'Google Search' },
      perplexity: { enabled: true, hostname: 'www.perplexity.ai', label: 'Perplexity' },
      gemini: { enabled: true, hostname: 'gemini.google.com', label: 'Gemini' },

      // Second wave: adapters not yet written. Flags exist so settings UI
      // and the registry have a stable shape to grow into.
      deepseek: { enabled: false, hostname: 'chat.deepseek.com', label: 'DeepSeek' },
      grok: { enabled: false, hostname: 'grok.com', label: 'Grok' },
      copilot: { enabled: false, hostname: 'copilot.microsoft.com', label: 'Copilot' },
      meta: { enabled: false, hostname: 'meta.ai', label: 'Meta AI' }
    }
  };
})();
