// Taxonomy: shopping categories + keyword/phrase patterns, and the blocked
// topic list that silences the extension entirely. Loaded as a plain script
// (no build step), so it attaches itself to `window.ScribbleTaxonomy`.
//
// Pattern format: each category has
//   keywords:  single-word/short stems checked as whole-word matches, 1 hit
//   phrases:   stronger multi-word phrases; a single phrase hit is enough
//              on its own regardless of the numeric hit total
//   secondary: weak, generic signals (worth half a hit) -- not confident
//              enough alone to indicate shopping intent, only useful
//              alongside a real keyword/phrase hit
//   negative:  patterns that, if present, suppress a match for this category
//
// NOTE: no finance categories here on purpose — personal finance is a
// blocked topic (see BLOCKED below), not a shoppable category.

(function () {
  // "designer <garment>" reads as a strong, unambiguous shopping signal
  // regardless of which garment noun follows -- generated as a combinator
  // rather than hand-listing every pairing, since it's a literal cross
  // product of one qualifier word against the garment noun list below.
  const DESIGNER_GARMENT_NOUNS = [
    'shirt', 'shirts', 't-shirt', 'dress shirt', 'jacket', 'jeans', 'trousers',
    'dress', 'hoodie', 'sneakers', 'coat', 'handbag', 'backpack'
  ];
  const DESIGNER_GARMENT_PHRASES = DESIGNER_GARMENT_NOUNS.map((noun) => `designer ${noun}`);

  // "baby <thing>" combinator for the nursery/care verticals -- same
  // rationale as designer+garment above. "baby monitor" is listed
  // separately since it already contains the word "baby".
  const BABY_NURSERY_NOUNS = ['bassinet', 'cradle', 'crib', 'cot', 'stroller', 'pram', 'car seat', 'high chair'];
  const BABY_NURSERY_PHRASES = BABY_NURSERY_NOUNS.map((noun) => `baby ${noun}`);

  const BABY_CARE_NOUNS = ['diapers', 'diaper', 'food', 'bottles', 'bottle', 'sterilizer'];
  const BABY_CARE_PHRASES = BABY_CARE_NOUNS.map((noun) => `baby ${noun}`);

  // "maternity <garment>" / "pregnancy <garment>" combinator. NOTE: any
  // phrase built from the "pregnancy" qualifier is effectively unreachable
  // today -- BLOCKED.health (untouched per instructions) already contains
  // the bare words "pregnant"/"pregnancy" and is checked before category
  // scoring ever runs, so those specific phrasings get silenced upstream
  // regardless of shopping intent. The "maternity" qualifier is unaffected
  // and works normally. Flagging this rather than leaving it implicit.
  const MATERNITY_QUALIFIERS = ['maternity', 'pregnancy'];
  const MATERNITY_GARMENT_NOUNS = ['dress', 'dresses', 'jeans', 'leggings', 'tops', 'wear', 'clothes', 'clothing'];
  const MATERNITY_PHRASES = MATERNITY_QUALIFIERS.flatMap((q) => MATERNITY_GARMENT_NOUNS.map((noun) => `${q} ${noun}`));

  const CATEGORIES = {
    'footwear.running': {
      keywords: ['sneaker', 'sneakers', 'running shoe', 'running shoes', 'trainers', 'trail shoe'],
      phrases: ['running shoes', 'best running shoes', 'shoes for running', 'marathon shoes'],
      negative: []
    },
    'footwear.casual': {
      keywords: ['loafers', 'sandals', 'boots', 'sneakers'],
      phrases: ['casual shoes', 'everyday shoes'],
      negative: ['running']
    },
    'electronics.laptops': {
      keywords: ['laptop', 'laptops', 'notebook computer', 'macbook', 'chromebook', 'ultrabook'],
      phrases: ['best laptop', 'laptop for', 'new laptop'],
      negative: []
    },
    'electronics.headphones': {
      keywords: ['headphones', 'earbuds', 'earphones', 'airpods', 'noise cancelling'],
      phrases: ['wireless earbuds', 'noise cancelling headphones'],
      negative: []
    },
    'electronics.tvs': {
      keywords: ['television', 'tv', 'smart tv', 'oled', 'qled'],
      phrases: ['best tv', 'new tv for'],
      negative: []
    },
    'electronics.smartphones': {
      keywords: ['smartphone', 'iphone', 'android phone', 'pixel phone', 'galaxy phone'],
      phrases: ['new phone', 'best smartphone'],
      negative: []
    },
    'electronics.cameras': {
      keywords: ['camera', 'dslr', 'mirrorless camera', 'gopro'],
      phrases: ['best camera for', 'new camera'],
      negative: []
    },
    'electronics.smartwatches': {
      keywords: ['smartwatch', 'apple watch', 'fitness tracker', 'garmin watch'],
      phrases: ['best smartwatch'],
      negative: []
    },
    'electronics.tablets': {
      keywords: ['tablet', 'ipad', 'galaxy tab'],
      phrases: ['best tablet for'],
      negative: []
    },
    'electronics.gaming': {
      keywords: ['gaming pc', 'graphics card', 'gpu', 'gaming laptop', 'console'],
      phrases: ['best gaming pc', 'gaming setup'],
      negative: []
    },
    'travel.flights': {
      keywords: ['flight', 'flights', 'airfare', 'airline ticket'],
      phrases: ['cheap flights', 'book a flight', 'flight deals'],
      negative: []
    },
    'travel.hotels': {
      keywords: ['hotel', 'hotels', 'resort', 'motel'],
      phrases: ['hotel deals', 'best hotel in', 'book a hotel'],
      negative: []
    },
    'travel.luggage': {
      keywords: ['suitcase', 'luggage', 'carry-on', 'travel bag'],
      phrases: ['best luggage for'],
      negative: []
    },
    'travel.carrental': {
      keywords: ['rental car', 'car rental'],
      phrases: ['rent a car', 'cheap car rental'],
      negative: []
    },
    'fitness.equipment': {
      keywords: ['dumbbells', 'treadmill', 'yoga mat', 'kettlebell', 'exercise bike', 'home gym'],
      phrases: ['fitness equipment', 'home gym setup'],
      negative: []
    },
    'fitness.apparel': {
      keywords: ['gym shorts', 'sports bra', 'leggings', 'workout clothes'],
      phrases: ['workout apparel'],
      negative: []
    },
    'home.mattresses': {
      keywords: ['mattress', 'mattresses', 'memory foam mattress'],
      phrases: ['best mattress for', 'mattress deals'],
      negative: []
    },
    'home.furniture': {
      keywords: ['sofa', 'couch', 'desk', 'office chair', 'bed frame', 'dining table'],
      phrases: ['best office chair', 'furniture deals'],
      negative: []
    },
    'home.kitchen': {
      keywords: ['blender', 'air fryer', 'coffee maker', 'espresso machine', 'cookware'],
      phrases: ['best air fryer', 'kitchen appliance'],
      negative: []
    },
    'home.cleaning': {
      keywords: ['vacuum cleaner', 'robot vacuum', 'steam mop'],
      phrases: ['best robot vacuum'],
      negative: []
    },
    'home.bedding': {
      keywords: ['sheets', 'pillow', 'comforter', 'duvet'],
      phrases: ['best pillow for'],
      negative: []
    },
    'fashion.general': {
      keywords: [
        'jacket', 'jeans', 'dress', 'coat', 'handbag', 'backpack',
        'shirt', 'shirts', 't-shirt', 'dress shirt', 'trousers', 'hoodie', 'sneakers'
      ],
      phrases: ['best jacket for', 'outfit for', ...DESIGNER_GARMENT_PHRASES],
      // Brand-adjacent words alone don't confirm shopping intent (e.g.
      // "premium" shows up for electronics too), so they only count for
      // half a hit -- enough to tip a borderline match, never enough on
      // their own to clear the two-hit threshold.
      secondary: ['designer', 'luxury', 'premium'],
      negative: []
    },
    'fashion.watches': {
      keywords: ['wristwatch', 'watch brand'],
      phrases: ['best watch under'],
      negative: ['smartwatch']
    },
    'beauty.skincare': {
      keywords: ['moisturizer', 'sunscreen', 'serum', 'skincare routine', 'cleanser'],
      phrases: ['best skincare for', 'skincare routine'],
      negative: []
    },
    'beauty.haircare': {
      keywords: ['shampoo', 'conditioner', 'hair dryer', 'straightener'],
      phrases: ['best shampoo for'],
      negative: []
    },
    'beauty.makeup': {
      keywords: ['foundation makeup', 'mascara', 'lipstick', 'concealer'],
      phrases: ['best foundation for'],
      negative: []
    },
    'software.vpn': {
      keywords: ['vpn', 'virtual private network'],
      phrases: ['best vpn for', 'vpn deals'],
      negative: []
    },
    'software.crm': {
      keywords: ['crm', 'customer relationship management software'],
      phrases: ['best crm for', 'crm software'],
      negative: []
    },
    'software.antivirus': {
      keywords: ['antivirus', 'malware protection'],
      phrases: ['best antivirus for'],
      negative: []
    },
    'software.productivity': {
      keywords: ['project management tool', 'note taking app', 'productivity app'],
      phrases: ['best project management tool'],
      negative: []
    },
    'software.designtools': {
      keywords: ['design software', 'photo editing software'],
      phrases: ['best design software for'],
      negative: []
    },
    'food.delivery': {
      keywords: ['food delivery', 'meal kit', 'takeout'],
      phrases: ['best meal kit', 'food delivery service'],
      negative: []
    },
    'food.grocery': {
      keywords: ['grocery delivery', 'grocery store online'],
      phrases: ['best grocery delivery'],
      negative: []
    },
    'food.coffee': {
      keywords: ['coffee beans', 'coffee subscription'],
      phrases: ['best coffee subscription'],
      negative: []
    },
    'pets.supplies': {
      keywords: ['dog food', 'cat food', 'pet bed', 'pet carrier'],
      phrases: ['best dog food for'],
      negative: []
    },
    // Replaces the old 'baby.gear' (superseded -- same core keywords, wider
    // coverage, and now has matching catalog offers instead of being an
    // orphan category).
    'baby.nursery': {
      keywords: ['bassinet', 'cradle', 'crib', 'cot', 'stroller', 'pram', 'car seat', 'baby monitor', 'high chair'],
      phrases: [...BABY_NURSERY_PHRASES, 'baby monitor', 'best stroller for'],
      negative: []
    },
    'baby.care': {
      keywords: ['diaper', 'diapers', 'bottle', 'bottles', 'sterilizer'],
      phrases: [...BABY_CARE_PHRASES, 'best diapers for'],
      negative: []
    },
    'maternity.apparel': {
      keywords: [],
      phrases: MATERNITY_PHRASES,
      secondary: ['maternity', 'pregnancy'],
      negative: []
    },
    'outdoors.camping': {
      keywords: ['tent', 'sleeping bag', 'camping stove', 'backpacking gear'],
      phrases: ['best tent for', 'camping gear'],
      negative: []
    },
    'outdoors.cycling': {
      keywords: ['bicycle', 'bike helmet', 'road bike', 'mountain bike'],
      phrases: ['best bike for'],
      negative: []
    },
    'automotive.accessories': {
      keywords: ['dash cam', 'car charger', 'floor mats', 'roof rack'],
      phrases: ['best dash cam'],
      negative: []
    },
    'office.supplies': {
      keywords: ['printer', 'planner', 'notebook stationery', 'standing desk'],
      phrases: ['best standing desk', 'office supplies'],
      negative: []
    },
    'toys.games': {
      keywords: ['board game', 'lego set', 'puzzle', 'video game'],
      phrases: ['best board game for'],
      negative: []
    },
    'garden.outdoor': {
      keywords: ['lawn mower', 'patio furniture', 'grill', 'garden tools'],
      phrases: ['best grill for'],
      negative: []
    }
  };

  function taxonomyDebugLog(...args) {
    if (window.ScribbleConfig && window.ScribbleConfig.DEBUG) {
      console.log('[Scribble/taxonomy]', ...args);
    }
  }

  // Trailing words that disqualify an otherwise-matching number from being a
  // price: "under 500-700 miles" or "below 300 mAh" are specs, not budgets.
  // Checked against the token immediately following the number/number-range.
  const DISQUALIFYING_UNITS = new Set([
    'mile', 'miles', 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres',
    'mah', 'gb', 'gbs', 'mb', 'tb', 'kg', 'kgs', 'lb', 'lbs',
    'hour', 'hours', 'hr', 'hrs', 'minute', 'minutes', 'min', 'mins',
    'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
    'calorie', 'calories', 'cal', 'cals', 'watt', 'watts', 'w',
    'step', 'steps', 'mph', 'fps', 'rpm', 'ml', 'oz', 'g', 'mg',
    'people', 'users', 'reviews', 'stars', 'times', 'x'
  ]);

  function bandFromAmount(amount, currency) {
    // Normalize INR to a rough USD-equivalent band using a static
    // approximate rate so band thresholds stay meaningful without a
    // network call.
    const usdEquivalent = currency === 'inr' ? amount / 83 : amount;
    if (usdEquivalent < 50) return 'under_50';
    if (usdEquivalent < 150) return '50_150';
    if (usdEquivalent < 500) return '150_500';
    return '500_plus';
  }

  // INR gets its own band scale rather than being squeezed into the USD
  // bands above -- "1k_5k" means something to an India-market shopper that
  // "150_500" (USD-equivalent) doesn't. Only populated when the query's
  // currency signal actually resolved to INR; otherwise 'unknown'.
  function inrBandFromAmount(amount, currency) {
    if (currency !== 'inr') return 'unknown';
    if (amount < 1000) return 'under_1k';
    if (amount <= 5000) return '1k_5k';
    if (amount <= 20000) return '5k_20k';
    return '20k_plus';
  }

  function isInrMarker(marker) {
    return !!marker && /rs\.?|inr|₹|rupees/i.test(marker);
  }

  // Budget band parsing: enumerated bands, USD + basic INR handling.
  // budget_band: under_50, 50_150, 150_500, 500_plus, unknown (USD-equivalent)
  // inr_band: under_1k, 1k_5k, 5k_20k, 20k_plus, unknown (raw INR scale)
  //
  // Scoped to userText only -- the assistant's response frequently contains
  // unrelated numbers (spec sheets, mileage, battery life) that read like a
  // price out of context. A shopper's own budget only ever appears in what
  // they typed. Requires an adjacent currency/budget signal ($, USD, Rs,
  // ₹, rupees, "budget", "under", "below") -- a bare number never matches.
  function extractBudgetBand(userText) {
    const t = (userText || '').toLowerCase();
    taxonomyDebugLog('budget: parsing source=userText, length', t.length);

    const NUM = '(\\d[\\d,]*)(?:\\s*(?:-|to)\\s*\\d[\\d,]*)?';
    const K = '(k)?';
    const PREFIX = '(rs\\.?|inr|₹|\\$)';
    const SUFFIX = '(rs\\.?|inr|rupees)';
    const TRAIL = '([a-z]+)?';

    // Trigger groups (under/below/budget-of) allow an OPTIONAL currency
    // marker on either side of the number -- the trigger word itself is
    // signal enough. Bare-currency groups require the marker, since without
    // a trigger word a plain number is never a budget on its own.
    const patternGroups = [
      {
        name: 'under/below/max',
        regex: new RegExp(`(?:under|below|less than|no more than|max(?:imum)?(?: of)?)\\s*${PREFIX}?\\s*${NUM}\\s*${K}\\s*${SUFFIX}?\\s*${TRAIL}`, 'gi'),
        extract: (m) => ({ amountRaw: m[2], kSuffix: m[3], currencyMarker: m[1] || m[4], trailingWord: m[5] })
      },
      {
        name: 'budget of',
        regex: new RegExp(`budget\\s*(?:of|is|:)?\\s*${PREFIX}?\\s*${NUM}\\s*${K}\\s*${SUFFIX}?\\s*${TRAIL}`, 'gi'),
        extract: (m) => ({ amountRaw: m[2], kSuffix: m[3], currencyMarker: m[1] || m[4], trailingWord: m[5] })
      },
      {
        name: 'bare currency prefix',
        regex: new RegExp(`${PREFIX}\\s*${NUM}\\s*${K}\\s*${TRAIL}`, 'gi'),
        extract: (m) => ({ amountRaw: m[2], kSuffix: m[3], currencyMarker: m[1], trailingWord: m[4] })
      },
      {
        name: 'bare currency suffix',
        regex: new RegExp(`${NUM}\\s*${K}\\s*${SUFFIX}\\s*${TRAIL}`, 'gi'),
        extract: (m) => ({ amountRaw: m[1], kSuffix: m[2], currencyMarker: m[3], trailingWord: m[4] })
      }
    ];

    for (const group of patternGroups) {
      group.regex.lastIndex = 0;
      let match;
      while ((match = group.regex.exec(t)) !== null) {
        const { amountRaw, kSuffix, currencyMarker, trailingWord } = group.extract(match);
        const trailing = (trailingWord || '').toLowerCase();
        if (DISQUALIFYING_UNITS.has(trailing)) {
          taxonomyDebugLog('budget: rejected candidate, pattern=', group.name, 'trailing unit=', trailing);
          continue;
        }

        let amount = parseInt(amountRaw.replace(/,/g, ''), 10);
        if (kSuffix) amount *= 1000;

        const currency = isInrMarker(currencyMarker) ? 'inr' : 'usd';
        const budget_band = bandFromAmount(amount, currency);
        const inr_band = inrBandFromAmount(amount, currency);

        taxonomyDebugLog(
          'budget: matched pattern=', group.name, 'amount=', amount, currency,
          '-> budget_band=', budget_band, 'inr_band=', inr_band
        );
        return { budget_band, inr_band };
      }
    }

    taxonomyDebugLog('budget: no valid pattern matched');
    return { budget_band: 'unknown', inr_band: 'unknown' };
  }

  // Blocked categories: checked first, short-circuit everything to null.
  // Generous pattern lists on purpose -- silence is the safe default.
  const BLOCKED = {
    health: {
      phrases: [
        'symptom', 'symptoms', 'diagnosed', 'diagnosis', 'chronic pain', 'blood pressure',
        'blood sugar', 'my doctor', 'my dr said', 'prescription', 'medication', 'side effects',
        'std ', 'sti ', 'biopsy', 'tumor', 'cancer', 'surgery', 'chemotherapy', 'disease',
        'infection', 'rash', 'std test', 'pregnant', 'pregnancy', 'fertility', 'period cramps',
        'std symptoms'
      ]
    },
    mental_health: {
      phrases: [
        'depression', 'depressed', 'anxiety attack', 'anxious', 'panic attack', 'therapist',
        'therapy session', 'bipolar', 'ptsd', 'ocd', 'eating disorder', 'self harm', 'self-harm',
        'suicide', 'suicidal', 'want to die', 'end my life', 'crisis hotline', 'mental breakdown'
      ]
    },
    personal_finance: {
      phrases: [
        'my debt', 'credit card debt', 'pay off my loan', 'student loan', 'bankruptcy',
        'credit score', 'my mortgage', 'investing my savings', 'retirement savings',
        'life insurance policy', 'health insurance plan', 'file my taxes', 'irs audit',
        'payday loan', 'refinance my', 'my 401k', 'stock portfolio advice'
      ]
    },
    legal: {
      phrases: [
        'my lawyer', 'lawsuit', 'sue my', 'get sued', 'custody battle', 'divorce proceedings',
        'restraining order', 'criminal charge', 'arrested for', 'plea deal', 'file for divorce'
      ]
    },
    relationships: {
      phrases: [
        'my boyfriend', 'my girlfriend', 'my husband', 'my wife', 'my ex', 'breakup', 'break up with',
        'cheating on me', 'is cheating', 'my marriage', 'divorcing', 'toxic relationship',
        'my partner is'
      ]
    },
    sexuality: {
      phrases: [
        'coming out as', 'am i gay', 'am i bisexual', 'sexual orientation', 'erectile dysfunction',
        'libido', 'sexual performance'
      ]
    },
    religion: {
      phrases: [
        'losing my faith', 'is god real', 'my religion', 'convert to islam', 'convert to christianity',
        'religious doubts'
      ]
    },
    politics: {
      phrases: [
        'who should i vote for', 'which party', 'political party', 'election candidate',
        'my political views'
      ]
    },
    immigration: {
      phrases: [
        'my visa', 'green card', 'deportation', 'asylum claim', 'immigration status',
        'work permit application', 'my citizenship application'
      ]
    },
    employment: {
      phrases: [
        'wrongfully fired', 'getting fired', 'fired from my job', 'workplace harassment',
        'hostile work environment', 'my boss is', 'file a complaint against my employer'
      ]
    },
    minors: {
      phrases: [
        'my child has', 'my son has', 'my daughter has', 'my kid is being bullied',
        'child custody', 'my teenager'
      ]
    },
    crisis: {
      phrases: [
        'grieving', 'my mom died', 'my dad died', 'someone died', 'in crisis', 'overdose',
        'i want to hurt myself', 'i want to hurt someone'
      ]
    }
  };

  window.ScribbleTaxonomy = { CATEGORIES, BLOCKED, extractBudgetBand };
})();
