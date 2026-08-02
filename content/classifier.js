// Rules-based, fully local intent classifier. No network calls, no storage
// of the text it classifies. Attaches to window.ScribbleClassifier.
//
// DEBUG gate: when window.ScribbleConfig.DEBUG is true, this module logs
// category/blocked decisions (never raw conversation text) to help tune
// selectors and patterns. DEBUG defaults to false in config.js.
//
// v1 (trigger-taxonomy-v1.md): a category firing now requires BOTH a
// category-pattern score clearing threshold AND at least one purchase-
// intent signal (Section 2 of the doc) -- category nouns inside
// informational framing ("how does X work") no longer fire just because
// the noun matched.

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

  function scoreCategories(text, dealSeekingBonus) {
    const { CATEGORIES } = window.ScribbleTaxonomy;
    const scored = [];
    const nearMisses = [];

    for (const [name, def] of Object.entries(CATEGORIES)) {
      // P1/P2 stubs have enabled:false and empty pattern arrays, so they'd
      // never score anyway -- this is a defensive, explicit skip in case a
      // future edit adds patterns without flipping the flag.
      if (!def.enabled) continue;

      // Negative patterns veto this category outright.
      if (def.negative && def.negative.some((neg) => wordBoundaryMatch(text, neg))) {
        continue;
      }

      // Weighted hit total: pattern hits count as a full point each.
      // Multi-word patterns (containing a space) ALSO satisfy the
      // threshold alone, same as v0.3's phrase-bypass -- see the SCOPE
      // NOTE at the top of taxonomy.js for why. `secondary` (brand-
      // adjacent, generic) signals count as half a point -- strong enough
      // to tip a borderline match, never enough alone.
      let points = 0;
      let strongPhraseHit = false;

      for (const pattern of def.patterns || []) {
        if (wordBoundaryMatch(text, pattern)) {
          points += 1;
          if (pattern.includes(' ')) strongPhraseHit = true;
        }
      }
      for (const secondary of def.secondary || []) {
        if (wordBoundaryMatch(text, secondary)) points += 0.5;
      }

      // Deal-seeking language ("cheapest", "coupon", ...) is the
      // highest-value intent signal -- it also nudges every category's
      // score, which can be enough to tip a borderline match over
      // threshold when combined with a real pattern hit.
      if (dealSeekingBonus) points += 0.5;

      if (points === 0) continue;

      // Threshold: at least two points worth of independent pattern hits,
      // OR one strong (multi-word) pattern match. Confidence scales gently
      // with extra points, capped.
      const meetsThreshold = points >= 2 || strongPhraseHit;
      if (!meetsThreshold) {
        nearMisses.push({ category: name, points });
        continue;
      }

      const confidence = Math.min(0.95, 0.55 + points * 0.12);
      scored.push({ category: name, points, confidence });
    }

    scored.sort((a, b) => b.confidence - a.confidence || b.points - a.points);

    if (scored.length === 0 && nearMisses.length && window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      nearMisses.sort((a, b) => b.points - a.points);
      // One flat string, not an array-of-objects -- console renders the
      // latter as a collapsed/expandable tree, which defeats "glance at
      // the log and see the gap" during taxonomy tuning.
      const topLine = nearMisses.slice(0, 3).map((nm) => `${nm.category}=${nm.points}`).join(', ');
      debugLog('near-miss categories (below threshold): ' + topLine);
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

    // Intent signals are scoped to userText only, same rationale as
    // budget parsing -- the shopper's own framing lives in what they
    // typed, not the assistant's response.
    const intent = window.ScribbleTaxonomy.detectIntentSignals(userText || '');
    const intentLine = intent.signals.length ? intent.signals.join(', ') : '(none)';
    debugLog('intent signals matched: ' + intentLine);

    const scored = scoreCategories(combined, intent.dealSeeking);
    if (scored.length === 0) {
      debugLog('no category met threshold, returning null');
      return null;
    }

    if (scored.length > 1) {
      const runnersUp = scored.slice(1, 4).map((s) => `${s.category}=${s.points}`).join(', ');
      debugLog('multi-category hit, runners-up: ' + runnersUp + ' (panel shows only the top category)');
    }

    // Informational framing ("how does X work") silences even a clean
    // category match -- checked after scoring (so the runner-up log above
    // still fires for tuning visibility) but before anything is returned.
    if (intent.informationalSuppressed) {
      debugLog('informational framing detected, suppressing despite category match:', scored[0].category);
      return null;
    }

    // The intent gate: category score alone is never enough. Silence is
    // the default whenever there is doubt.
    if (intent.signals.length === 0) {
      debugLog('category matched but no purchase-intent signal present, staying silent:', scored[0].category);
      return null;
    }

    const top = scored[0];
    // Budget parsing is scoped to userText only (see taxonomy.js) -- the
    // assistant's response text is excluded here even though it's part of
    // `combined` for category scoring above.
    const { budget_band, inr_band } = window.ScribbleTaxonomy.extractBudgetBand(userText);

    debugLog('classified:', top.category, 'confidence:', top.confidence, 'budget_band:', budget_band, 'inr_band:', inr_band);

    return {
      category: top.category,
      budget_band,
      inr_band,
      confidence: top.confidence
    };
  }

  window.ScribbleClassifier = { classify };
})();
