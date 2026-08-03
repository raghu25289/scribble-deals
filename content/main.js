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

  // Non-cryptographic string hash -- used ONLY to compare "is this the
  // same turn as last time", never logged or stored anywhere. This is the
  // turn-identity mechanism, deliberately not the raw userText itself, so
  // there is nothing content-shaped sitting in a variable that a future
  // debugLog() could accidentally leak.
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash;
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

    // shopping.general keyword match (v2.0): titles, merchants, and the
    // matched offer's own category display name are all fair game -- a
    // product token like "notion" should find a Notion offer even though
    // no taxonomy category pattern mentions it by name.
    //
    // Scored by distinct-token hit count, not a plain filter -- with up to
    // 8 offers surviving the slice() in handleClassification, a query with
    // many loose one-token matches (e.g. a shared "music" token pulling in
    // unrelated instrument offers alongside the real Spotify/Apple Music
    // hits) needs the strongest matches to win the cut. This only decides
    // *selection*; on-screen order is still panel.js's rankOffers by
    // value_score alone -- untouched here, per that file's own rule.
    function matchOffersByTokens(offers, tokens) {
      if (!tokens.length) return [];
      const { CATEGORIES } = window.ScribbleTaxonomy;
      return offers
        .map((o) => {
          const displayName = (CATEGORIES[o.category] && CATEGORIES[o.category].display_name) || '';
          const haystack = `${o.title} ${o.merchant} ${displayName}`.toLowerCase();
          const score = tokens.filter((t) => haystack.includes(t)).length;
          return { offer: o, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score || b.offer.value_score - a.offer.value_score)
        .map((m) => m.offer);
    }

    async function handleClassification(result) {
      if (!result) {
        debugLog('classifier result: null (see [Scribble/classifier] log above for reason)');
        // Defense in depth: the new-turn detector in handleMutations()
        // already clears on the first mutation of a turn, well before
        // classification finishes, so the panel should already be hidden
        // by the time a null result lands. Clearing again here is a
        // no-op in the normal case, but guarantees "null classification
        // never leaves stale offers visible" even if that earlier
        // detection is ever bypassed (e.g. the immediate classification
        // pass on attachObserver(), which has no "previous mutation" to
        // hang a new-turn check off of).
        if (window.ScribblePanel && window.ScribblePanel.clear) {
          window.ScribblePanel.clear('null_classification');
        }
        return;
      }

      debugLog('classifier result:', result);

      const offers = await loadOffersOnce();
      let matches;

      if (result.category === 'shopping.general') {
        // Fallback path (v2.0): no specific taxonomy category matched, but
        // a research signal + plausible product reference were present.
        // Keyword-match the extracted product tokens against the catalog
        // itself rather than any single category's pre-filtered slice --
        // renders ONLY if a real offer matches; otherwise this is a
        // no_inventory log line (the catalog roadmap), never a random
        // unrelated panel.
        matches = matchOffersByTokens(offers, result.matchedTokens || []);
        if (!matches.length) {
          debugLog('no_inventory: shopping.general found no catalog match for tokens: ' + (result.matchedTokens || []).join(', '));
          return;
        }
      } else {
        matches = offers.filter((o) => o.category === result.category);
        if (!matches.length) {
          debugLog('panel render skipped: no catalog offers for category', result.category);
          return;
        }
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

    // Turn identity: a hash of the latest userText, compared on every
    // mutation batch so a new turn is caught the moment it starts, not
    // 800ms-4000ms later when classification of THAT turn finally
    // finishes. null means "no turn observed yet on this page" -- the
    // very first turn shouldn't log a "cleared" line for content that was
    // never showing in the first place.
    let lastTurnHash = null;

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

      // New-turn detection: userText only changes when the user actually
      // submits a new message (streaming only touches responseText), so
      // this fires exactly once per real new turn, never mid-stream. Hide
      // and clear immediately -- before classification of the new turn
      // has even started, let alone finished -- so a hotels panel can
      // never survive into an unrelated lipstick conversation.
      const turnHash = simpleHash((adapter.extract().userText || ''));
      if (lastTurnHash === null) {
        lastTurnHash = turnHash; // first turn on this page, nothing to clear
      } else if (turnHash !== lastTurnHash) {
        lastTurnHash = turnHash;
        if (window.ScribblePanel && window.ScribblePanel.clear) {
          window.ScribblePanel.clear('new_turn');
        }
      }

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

      // Establish the turn-identity baseline for whatever's already on
      // screen right now. Content may already be present (e.g. Google's
      // results page, or returning to an existing ChatGPT thread) and its
      // classification below runs via this direct call, NOT through
      // handleMutations() -- so without this, lastTurnHash would still be
      // null when the actual NEXT turn's mutation arrives, and that next
      // turn would be wrongly treated as "the first turn ever" (skipping
      // the clear it should trigger).
      lastTurnHash = simpleHash(adapter.extract().userText || '');

      // Content may already be present, so run one classification pass
      // immediately rather than waiting for the first mutation.
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
      lastTurnHash = null; // fresh conversation -- no prior turn to compare against
      debugLog('SPA navigation detected via', source, '-- new url:', location.pathname);
      // Always clear as part of the teardown/re-init, unconditionally --
      // a new chat/route is exactly the "unrelated conversation" case
      // this whole fix exists for.
      if (window.ScribblePanel && window.ScribblePanel.clear) {
        window.ScribblePanel.clear('route_change');
      }
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
