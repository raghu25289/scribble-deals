// Rules-based, fully local intent classifier. No network calls, no storage
// of the text it classifies. Attaches to window.ScribbleClassifier.
//
// DEBUG gate: when window.ScribbleConfig.DEBUG is true, this module logs
// category/blocked decisions (never raw conversation text) to help tune
// selectors and patterns. DEBUG defaults to false in config.js.
//
// v2.0 (philosophy inversion): fire on product research, period. A
// category needs a research signal to drop its threshold from 2 pattern
// hits to 1 -- there is no longer a separate hard AND-gate that returns
// null whenever no signal is present ("category matched but no intent
// signal" no longer exists as its own rejection path). The taxonomy's
// job is offer-matching now, not gatekeeping; the blocked list (checked
// first, unchanged) is the only thing that still silences unconditionally.

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

  function scoreCategories(text, hasResearchSignal, dealSeekingBonus) {
    const { CATEGORIES } = window.ScribbleTaxonomy;
    const scored = [];
    const nearMisses = [];

    for (const [name, def] of Object.entries(CATEGORIES)) {
      // shopping.general is a fallback reached only via classify()'s own
      // logic below -- it never scores through the normal pattern loop
      // (its patterns array is intentionally empty).
      if (name === 'shopping.general') continue;
      if (!def.enabled) continue;

      // Negative patterns veto this category outright.
      if (def.negative && def.negative.some((neg) => wordBoundaryMatch(text, neg))) {
        continue;
      }

      // Weighted hit total: pattern hits count as a full point each.
      // Multi-word patterns (containing a space) ALSO satisfy the
      // threshold alone regardless of point total (the strong-phrase
      // bypass). `secondary` signals count as half a point.
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

      // A research signal being present is itself worth a small scoring
      // nudge (was "deal-seeking bonus" in v1.x, now folded into the
      // broader "purchase" signal group) -- can be enough to tip a
      // borderline match over threshold when combined with a real hit.
      if (dealSeekingBonus) points += 0.5;

      if (points === 0) continue;

      // v2.0 threshold: 1 point when a research signal is present
      // anywhere in the query, 2 points otherwise (same conservative bar
      // as v1.x when there's no research framing at all). The
      // strong-phrase bypass remains an always-available alternate path.
      const requiredPoints = hasResearchSignal ? 1 : 2;
      const meetsThreshold = points >= requiredPoints || strongPhraseHit;
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

    // Blocked topics short-circuit everything, even if research/purchase
    // intent is also present. Silence is the default whenever there is
    // doubt. Unchanged from v1.x -- this is the only remaining silencer.
    const blockedHit = checkBlocked(combined);
    if (blockedHit) {
      debugLog('blocked category matched, returning null:', blockedHit);
      return null;
    }

    // Research signals are scoped to userText only, same rationale as
    // budget parsing -- the shopper's own framing lives in what they
    // typed, not the assistant's response.
    const research = window.ScribbleTaxonomy.detectResearchSignal(userText || '');
    const signalLine = research.signals.length ? research.signals.join(', ') : '(none)';
    debugLog('research signals matched: ' + signalLine);

    // Informational framing ("how does X work") still forces silence
    // regardless of category score -- narrowed in v2.0 to clearly
    // non-commercial framings only (see taxonomy.js).
    if (research.informationalSuppressed) {
      debugLog('informational framing detected, staying silent');
      return null;
    }

    const scored = scoreCategories(combined, research.hasSignal, research.dealSeeking);

    if (scored.length > 1) {
      const runnersUp = scored.slice(1, 4).map((s) => `${s.category}=${s.points}`).join(', ');
      debugLog('multi-category hit, runners-up: ' + runnersUp + ' (panel shows only the top category)');
    }

    if (scored.length === 0) {
      // No specific category cleared threshold. Try the shopping.general
      // fallback: only when a research signal is present AND the query
      // plausibly references a real product. This does NOT guarantee a
      // render -- main.js still has to find a keyword-matched offer in
      // the catalog, or it logs no_inventory and stays silent.
      if (research.hasSignal) {
        const originalText = userText || '';
        if (window.ScribbleTaxonomy.hasPlausibleProductReference(originalText)) {
          const rawTokens = window.ScribbleTaxonomy.extractProductTokens(originalText);
          const safeTokens = rawTokens.filter((t) => !window.ScribbleTaxonomy.isBlockedToken(t));
          if (safeTokens.length) {
            debugLog('no specific category matched, trying shopping.general with tokens: ' + safeTokens.join(', '));
            const { budget_band, inr_band } = window.ScribbleTaxonomy.extractBudgetBand(userText);
            return {
              category: 'shopping.general',
              budget_band,
              inr_band,
              confidence: 0.6,
              matchedTokens: safeTokens
            };
          }
        }
      }
      debugLog('no category met threshold and no shopping.general fallback applies, returning null');
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
