// Rules-based, fully local intent classifier. No network calls, no storage
// of the text it classifies. Attaches to window.ScribbleClassifier.
//
// DEBUG gate: when window.ScribbleConfig.DEBUG is true, this module logs
// category/blocked decisions (never raw conversation text) to help tune
// selectors and patterns. DEBUG defaults to false in config.js.

(function () {
  function debugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/classifier]', ...args);
    }
  }

  function wordBoundaryMatch(text, pattern) {
    // Simple substring check is enough for stems like "sneaker"/"sneakers";
    // phrases are multi-word so substring match is already conservative.
    return text.includes(pattern);
  }

  function checkBlocked(text) {
    const { BLOCKED } = window.ScribbleTaxonomy;
    for (const [name, def] of Object.entries(BLOCKED)) {
      for (const phrase of def.phrases) {
        if (wordBoundaryMatch(text, phrase)) {
          return name;
        }
      }
    }
    return null;
  }

  function scoreCategories(text) {
    const { CATEGORIES } = window.ScribbleTaxonomy;
    const scored = [];

    const nearMisses = [];

    for (const [name, def] of Object.entries(CATEGORIES)) {
      // Negative patterns veto this category outright.
      if (def.negative && def.negative.some((neg) => wordBoundaryMatch(text, neg))) {
        continue;
      }

      let hits = 0;
      let strongPhraseHit = false;

      for (const kw of def.keywords || []) {
        if (wordBoundaryMatch(text, kw)) hits += 1;
      }
      for (const phrase of def.phrases || []) {
        if (wordBoundaryMatch(text, phrase)) {
          hits += 1;
          strongPhraseHit = true;
        }
      }

      if (hits === 0) continue;

      // Threshold: at least two independent pattern hits, OR one strong
      // phrase match. Confidence scales gently with extra hits, capped.
      const meetsThreshold = hits >= 2 || strongPhraseHit;
      if (!meetsThreshold) {
        nearMisses.push({ category: name, hits });
        continue;
      }

      const confidence = Math.min(0.95, 0.55 + hits * 0.12);
      scored.push({ category: name, hits, confidence });
    }

    scored.sort((a, b) => b.confidence - a.confidence || b.hits - a.hits);

    if (scored.length === 0 && nearMisses.length && window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      nearMisses.sort((a, b) => b.hits - a.hits);
      debugLog('near-miss categories (below threshold):', nearMisses.slice(0, 3));
    }

    return scored;
  }

  function classify({ userText, responseText }) {
    const combined = `${userText || ''} \n ${responseText || ''}`.toLowerCase().trim();

    if (!combined) {
      debugLog('empty input (userText and responseText both blank), returning null');
      return null;
    }

    // Blocked topics short-circuit everything, even if shopping intent is
    // also present. Silence is the default whenever there is doubt.
    const blockedHit = checkBlocked(combined);
    if (blockedHit) {
      debugLog('blocked category matched, returning null:', blockedHit);
      return null;
    }

    const scored = scoreCategories(combined);
    if (scored.length === 0) {
      debugLog('no category met threshold, returning null');
      return null;
    }

    const top = scored[0];
    // Budget parsing is scoped to userText only (see taxonomy.js) -- the
    // assistant's response text is excluded here even though it's part of
    // `combined` for category scoring above.
    const budget_band = window.ScribbleTaxonomy.extractBudgetBand(userText);

    debugLog('classified:', top.category, 'confidence:', top.confidence, 'budget_band:', budget_band);

    return {
      category: top.category,
      budget_band,
      confidence: top.confidence
    };
  }

  window.ScribbleClassifier = { classify };
})();
