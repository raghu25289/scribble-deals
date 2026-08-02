// Orchestration: consent check, config/settings check, adapter lookup,
// observe, debounce, classify, render. This is the only file that ties the
// other modules together for a live page.
//
// PRIVACY: nothing in this file (or anything it calls) ever writes
// conversation text to chrome.storage, localStorage, console, or a network
// call. The only thing ever persisted is the boolean consent/settings
// state, which is handled entirely in the popup. Every diagnostic log below
// is gated on DEBUG and logs shapes/counts/tag names only, never page text.

(function () {
  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/main]', ...args);
    }
  }

  // Reloading/updating the extension while a tab stays open orphans this
  // content script: chrome.runtime (and its .id) go away, so any later
  // chrome.* call throws "Cannot read properties of undefined". Every
  // function that touches chrome.runtime or chrome.storage checks this
  // first and stands down instead of crashing.
  function isContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function describeElement(el) {
    if (!el) return 'null';
    const id = el.id ? `#${el.id}` : '';
    const testId = el.getAttribute && el.getAttribute('data-testid');
    return `<${el.tagName.toLowerCase()}${id}${testId ? ` [data-testid=${testId}]` : ''}>`;
  }

  // Pure diagnostic, zero page content, logged before the consent guard so
  // "did the script even inject" is never itself a mystery.
  debugLog('content script loaded on', location.hostname, location.pathname);

  (async function boot() {
    // First functional statement of all: if the extension context is
    // already gone (reloaded/updated while this tab stayed open), there is
    // nothing safe to do -- bail before the first chrome.* touch below.
    if (!isContextValid()) {
      debugLog('context invalidated, standing down');
      return;
    }
    let contextInvalidated = false;

    // Consent gate. If the user has not explicitly accepted, every content
    // script no-ops immediately.
    //
    // try/catch on top of the pre-check above: the pre-check only catches
    // "already invalid before we tried"; if invalidation happens WHILE this
    // await is in flight, chrome.storage.local.get rejects instead, which
    // would otherwise be an unhandled promise rejection.
    let stored;
    try {
      stored = await chrome.storage.local.get(['consent', 'settings']);
    } catch (e) {
      debugLog('context invalidated, standing down');
      return;
    }
    debugLog('consent read from chrome.storage.local key "consent":', stored.consent);
    if (!stored.consent || !stored.consent.accepted) {
      debugLog('no accepted consent record, no-op');
      return;
    }

    const settings = stored.settings || { globalEnabled: true, sites: {} };
    debugLog('settings read from chrome.storage.local key "settings":', settings);
    if (settings.globalEnabled === false) {
      debugLog('global toggle is off, no-op');
      return;
    }

    const hostname = window.location.hostname;
    const entry = window.ScribbleAdapterRegistry.getAdapterForHostname(hostname);
    if (!entry || !entry.adapter) {
      debugLog('no adapter matched for hostname:', hostname);
      return;
    }

    const { surfaceKey, adapter } = entry;
    debugLog('adapter resolved:', surfaceKey, 'for hostname', hostname);

    const surfaceConfig = window.ScribbleConfig.SURFACES[surfaceKey];
    if (!surfaceConfig || !surfaceConfig.enabled) {
      debugLog('surface disabled in config:', surfaceKey);
      return;
    }

    const siteEnabled = settings.sites ? settings.sites[surfaceKey] : true;
    debugLog('site toggle for', surfaceKey, ':', siteEnabled !== false ? 'on' : 'off');
    if (siteEnabled === false) {
      return;
    }

    // Loaded once, at script init, and kept in memory -- classification
    // never triggers a fetch itself, it only ever reads this (already
    // resolved, by the time it's needed) promise.
    let offersPromise = null;
    function loadOffersOnce() {
      if (offersPromise) return offersPromise;
      offersPromise = (async () => {
        if (!isContextValid()) {
          standDown();
          return [];
        }
        try {
          // Bundled catalog only. This is a local extension resource fetch,
          // not an external network request -- it never leaves the browser.
          //
          // SEAM: a future version could refresh the catalog from a remote
          // URL here. Not implemented in this MVP by design -- do not add a
          // fetch() to an external host without revisiting the "no network
          // requests" product rule above.
          const url = chrome.runtime.getURL('data/offers.json');
          const res = await fetch(url);
          return await res.json();
        } catch (e) {
          // Covers invalidation happening mid-flight (the pre-check above
          // only catches "already invalid before we tried") and any other
          // resource-load failure -- fail to an empty catalog, not an
          // unhandled rejection.
          standDown();
          return [];
        }
      })();
      return offersPromise;
    }

    // Kick off the fetch now, at init, rather than lazily on first
    // classification -- by the time anything is classified the catalog is
    // already in memory (or resolving).
    loadOffersOnce();

    async function handleClassification(result) {
      if (!result) {
        debugLog('classifier result: null (see [Scribble/classifier] log above for reason)');
        return;
      }

      debugLog('classifier result:', result);

      const offers = await loadOffersOnce();
      const matches = offers.filter((o) => o.category === result.category);
      if (!matches.length) {
        debugLog('panel render skipped: no catalog offers for category', result.category);
        return;
      }

      if (window.ScribblePanel.isDismissedThisSession()) {
        debugLog('panel render skipped: dismissed this session');
        return;
      }

      debugLog('invoking panel render with', matches.length, 'offers for', result.category);
      // The authoritative "did it actually paint" confirmation (isConnected,
      // bounding rect, resolved z-index) is logged by panel.js itself, after
      // the DOM append -- that's the log that matters if nothing is visible.
      window.ScribblePanel.render(matches.slice(0, 8), result.category);
    }

    function classifyNow(trigger) {
      const extracted = adapter.extract();
      const userLen = (extracted.userText || '').length;
      const responseLen = (extracted.responseText || '').length;
      debugLog(
        `extract() via ${trigger}: userText ${userLen} chars, responseText ${responseLen} chars`
      );
      const result = window.ScribbleClassifier.classify(extracted);
      handleClassification(result);
    }

    // --- Debounce + hard cap ------------------------------------------
    // ChatGPT-style responses (product carousels, images, streaming UI) can
    // mutate indefinitely, so a pure "quiet for 800ms" debounce can starve
    // forever. Classify on whichever comes first: 800ms of stability, or
    // 4000ms since the first mutation of the current burst.
    let debounceTimer = null;
    let capTimer = null;

    function clearTimers() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (capTimer) {
        clearTimeout(capTimer);
        capTimer = null;
      }
    }

    function fire(trigger) {
      clearTimers();
      classifyNow(trigger);
    }

    function scheduleClassification() {
      const isNewBurst = !debounceTimer && !capTimer;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fire('800ms stability debounce'), window.ScribbleConfig.STABLE_MS);

      if (isNewBurst) {
        capTimer = setTimeout(() => fire('4000ms hard cap'), window.ScribbleConfig.STABLE_CAP_MS);
      }
    }

    // --- Mutation noise filtering ---------------------------------------
    // We never subscribe to `attributes` (only childList/subtree/
    // characterData), which already excludes pure attribute churn (e.g.
    // aria-live, style, srcset swaps). On top of that, ignore any mutation
    // record whose target sits inside an <img> or <picture> -- lazy image
    // loading and animation frames shouldn't reset the stability clock.
    function isNoiseRecord(record) {
      const target = record.target;
      return !!(target && target.closest && target.closest('img, picture'));
    }

    let mutationCount = 0;
    let lastMutationLogTime = 0;
    function throttledMutationLog() {
      const now = Date.now();
      if (now - lastMutationLogTime >= 1000) {
        lastMutationLogTime = now;
        debugLog('mutation activity: count so far', mutationCount);
      }
    }

    // --- Observer lifecycle, with SPA-navigation re-init -----------------
    let observer = null;
    let currentRoot = null;

    function standDown() {
      if (contextInvalidated) return; // idempotent -- announce/teardown once
      contextInvalidated = true;
      debugLog('context invalidated, standing down');
      clearTimers();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (window.ScribblePanel && window.ScribblePanel.teardown) {
        window.ScribblePanel.teardown();
      }
    }

    function handleMutations(records) {
      // Nothing else in this file re-touches chrome.* after the initial
      // boot/fetch (by design -- the catalog is loaded once, not on every
      // classification), so a reload/update happening well into a session
      // would otherwise never be noticed until something crashed. Mutation
      // callbacks are this content script's one reliably recurring
      // heartbeat on a live ChatGPT page, so that's where this is checked
      // proactively instead of only reactively guarding chrome.* call sites.
      if (!isContextValid()) {
        standDown();
        return;
      }

      if (currentRoot && !currentRoot.isConnected) {
        debugLog('observed root detached from document, reinitializing');
        attachObserver();
        return;
      }

      const meaningful = records.filter((r) => !isNoiseRecord(r));
      if (!meaningful.length) return;

      mutationCount += meaningful.length;
      throttledMutationLog();
      scheduleClassification();
    }

    function attachObserver() {
      clearTimers();
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      currentRoot = adapter.getConversationRoot();
      if (!currentRoot) {
        debugLog('getConversationRoot() returned null/undefined, cannot observe');
        return;
      }

      observer = new MutationObserver(handleMutations);
      observer.observe(currentRoot, { childList: true, subtree: true, characterData: true });
      debugLog('observer attached to', describeElement(currentRoot));

      // Content may already be present (e.g. Google's results page, or
      // returning to an existing ChatGPT thread), so run one classification
      // pass immediately rather than waiting for the first mutation.
      scheduleClassification();
    }

    // --- SPA navigation detection -----------------------------------
    // chatgpt.com swaps the DOM on chat switches without a full page load,
    // which would otherwise orphan the observer on a removed node. Wrap
    // history.pushState/replaceState (content scripts share the page's
    // History object, so this patch is visible to the page's own router)
    // and add a popstate listener as a second signal.
    let lastHref = location.href;
    function onLocationChange(source) {
      if (contextInvalidated) return; // don't resurrect a torn-down observer
      if (location.href === lastHref) return;
      lastHref = location.href;
      debugLog('SPA navigation detected via', source, '-- new url:', location.pathname);
      attachObserver();
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const ret = originalPushState.apply(this, args);
      onLocationChange('pushState');
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = originalReplaceState.apply(this, args);
      onLocationChange('replaceState');
      return ret;
    };
    window.addEventListener('popstate', () => onLocationChange('popstate'));

    attachObserver();
  })();
})();
