// Taxonomy v2.0: shopping categories + research signals + the blocked
// topic list. Loaded as a plain script (no build step), attaches itself
// to `window.ScribbleTaxonomy`.
//
// SCHEMA per category:
//   enabled:       structural flag, kept in the schema per v2.0's own
//                  instruction ("the enabled flag stays"), but as of v2.0
//                  every category ships true except shopping.general's
//                  sibling concerns (there are no blocked-adjacent
//                  category stubs to disable -- see V2.0 NOTE 2 below).
//   patterns:      full-weight (1 point each). Multi-word patterns (those
//                  containing a space) ALSO satisfy the threshold alone
//                  regardless of point total (the "strong phrase" bypass).
//   secondary:     half-weight (0.5), never enough alone.
//   negative:      any match here silences THIS category (not global).
//   budget_scales: ['inr'], ['usd'], or ['inr','usd'] -- metadata only.
//   display_name:  human label, filled in for every slug.
//
// NOTE: no finance categories here on purpose — personal finance is a
// blocked topic (see BLOCKED below), not a shoppable category.
//
// ============================================================================
// V1 SCOPE NOTE (kept for history -- still relevant to why some category
// slugs/patterns look the way they do):
//
// 1. Section 3 vs Section 6 scope disagreements in the v1 doc were
//    resolved in favor of Section 6 ("Rollout priority"). Irrelevant as of
//    v2.0 -- every category is enabled now regardless of tier.
// 2. home.smart_home shipped P0 early because a required test needed it.
// 3. The v1 "near-miss for disabled P1 categories" contradiction doesn't
//    apply anymore -- nothing is disabled-with-empty-patterns as of v2.0.
// 4. Wedding routing: `negative: ['wedding']` on fashion.mens/womens/
//    ethnic_mens/ethnic_womens, so wedding-worded apparel falls through to
//    occasions.wedding's own patterns. Still true, still load-bearing.
// 5. "7 days in Vietnam" fires travel.hotels (single-category rule), not
//    "hotels + flights" plural. Still true.
//
// ============================================================================
// V2.0 SCOPE NOTE -- the philosophy inversion. Read before extending.
//
// OLD MODEL (v1.x): fire only when a taxonomy category clears threshold
// AND a purchase-intent signal is present. This missed whole verticals
// until someone hand-wrote patterns for them (bassinet and payroll each
// needed their own prompt to unlock). The taxonomy was a gatekeeper.
//
// NEW MODEL (v2.0): fire on product research, period. The taxonomy's job
// is now offer-MATCHING, not gatekeeping -- the only thing that keeps
// Scribble silent is the blocked list (unchanged, still checked first,
// still short-circuits everything). Concretely, three mechanical changes:
//
// 1. RESEARCH SIGNALS (renamed from "intent signals", broadened
//    vocabulary) -- a SINGLE signal now suffices, and its presence drops
//    the per-category pattern threshold from 2 hits to 1 (see
//    classifier.js). Informational suppressors narrowed to only the
//    clearly non-commercial framings (how X works, history, homework,
//    market-size/revenue, news) -- "review of X" is explicitly research
//    now, not suppressed.
//
// 2. EVERY CATEGORY ENABLED. All 91 categories that were P1/P2 stubs
//    (enabled:false, empty patterns) as of v1.1 now ship real patterns,
//    written from the source doc's own Section 3 vocabulary lists.
//    A handful of brand names that lived in `secondary` (half-weight) in
//    v1.x were promoted to full-weight `patterns` here -- under the old
//    model a bare brand mention needing a second corroborating hit made
//    sense as a conservative gate; under the new model, a brand name
//    itself IS the product reference, and with a research signal present
//    (1-hit threshold) it should be sufficient alone. This is why, e.g.,
//    footwear.running's patterns list now includes 'hoka', 'brooks', etc.
//    directly instead of only in `secondary`.
//
// 3. shopping.general: a fallback category for real product research that
//    doesn't cleanly match any specific taxonomy category (a product this
//    taxonomy simply hasn't modeled yet, or won't ever model as its own
//    vertical). It never scores through the normal pattern-matching path
//    (see the `if (name === 'shopping.general') continue;` skip in
//    classifier.js) -- it's reached ONLY as an explicit fallback in
//    classify() when: (a) a research signal is present, (b) no specific
//    category cleared threshold, and (c) the query contains a plausible
//    product reference (a capitalized brand-like token, a model-number-
//    looking token, a price mention, or just a concrete content word --
//    deliberately permissive, see hasPlausibleProductReference() below).
//    Reaching this fallback does NOT mean the panel renders: main.js then
//    keyword-matches the extracted product tokens against offers.json
//    titles/merchants/category display names, and the panel shows up
//    ONLY if at least one offer actually matches. No match -> a
//    `no_inventory` DEBUG line (the catalog roadmap) and silence. An
//    irrelevant panel costs more trust than staying quiet, so this
//    fallback is generous about ATTEMPTING a match and strict about
//    actually rendering one.
//
// 4. NOTHING CHANGED IN THE BLOCKED LIST. Health commerce, finance
//    products, gambling/real-money gaming, alcohol/tobacco/vapes, adult
//    products, weapons, surveillance of people, funeral/grief commerce,
//    minors-in-distress -- all identical to v1.1, checked first, still
//    short-circuit everything including shopping.general (the blocked
//    check runs on the full combined text before any category or
//    fallback logic ever executes; shopping.general additionally
//    cross-checks its own matched tokens against BLOCKED as defense in
//    depth via isBlockedToken(), even though in practice nothing reaches
//    that fallback with blocked content still present -- the primary
//    check already caught it). There were never any blocked-adjacent
//    category STUBS to begin with (personal_finance/gambling/etc. were
//    always BLOCKED-list phrase groups, never taxonomy category slugs
//    with their own offers) -- "structurally impossible beats
//    configured-off" from the v1 doc already held, so there is nothing
//    to remove here; this note exists to make that explicit rather than
//    leave it implicit.
// ============================================================================

(function () {
  // ---- Combinators (cross-product pattern generators) --------------------

  const DESIGNER_GARMENT_NOUNS = [
    'shirt', 'shirts', 't-shirt', 'dress shirt', 'jacket', 'jeans', 'trousers',
    'dress', 'hoodie', 'sneakers', 'coat', 'handbag', 'backpack'
  ];
  const DESIGNER_GARMENT_PHRASES = DESIGNER_GARMENT_NOUNS.map((noun) => `designer ${noun}`);

  const BABY_NURSERY_NOUNS = ['bassinet', 'cradle', 'crib', 'cot', 'stroller', 'pram', 'car seat', 'high chair'];
  const BABY_NURSERY_PHRASES = BABY_NURSERY_NOUNS.map((noun) => `baby ${noun}`);

  const BABY_CARE_NOUNS = ['diapers', 'diaper', 'food', 'bottles', 'bottle', 'sterilizer'];
  const BABY_CARE_PHRASES = BABY_CARE_NOUNS.map((noun) => `baby ${noun}`);

  // NOTE: any phrase built from the "pregnancy" qualifier is effectively
  // unreachable -- BLOCKED.health already contains bare "pregnant"/
  // "pregnancy" and runs first. The "maternity" qualifier is unaffected.
  const MATERNITY_QUALIFIERS = ['maternity', 'pregnancy'];
  const MATERNITY_GARMENT_NOUNS = ['dress', 'dresses', 'jeans', 'leggings', 'tops', 'wear', 'clothes', 'clothing'];
  const MATERNITY_PHRASES = MATERNITY_QUALIFIERS.flatMap((q) => MATERNITY_GARMENT_NOUNS.map((noun) => `${q} ${noun}`));

  // Non-festive occasions route to gifting.general; Diwali/Rakhi route to
  // gifting.festive specifically (kept as separate word lists so the two
  // categories don't compete for the same query).
  const GIFT_NOUNS = ['gift', 'gifts', 'hamper', 'hampers', 'present', 'presents'];
  const GENERAL_OCCASION_WORDS = ['birthday', 'anniversary', 'housewarming', "valentine's", 'valentines', 'christmas', 'new year'];
  const GENERAL_OCCASION_GIFT_PHRASES = GENERAL_OCCASION_WORDS.flatMap((occ) => GIFT_NOUNS.map((n) => `${occ} ${n}`));

  const FESTIVE_OCCASION_WORDS = ['diwali', 'rakhi', 'raksha bandhan'];
  const FESTIVE_OCCASION_GIFT_PHRASES = FESTIVE_OCCASION_WORDS.flatMap((occ) => GIFT_NOUNS.map((n) => `${occ} ${n}`));

  // "best <product noun>" combinator -- a single product noun is a
  // single-word pattern; pairing with "best" gives a multi-word compound
  // that satisfies threshold alone via the strong-phrase bypass, and
  // doubles as a research signal for the common "best X" phrasing.
  function bestNounPhrases(nouns) {
    return nouns.map((n) => `best ${n}`);
  }

  // Clinical framing silences beauty categories even when the blocked
  // list's own (more specific) phrases don't happen to match -- defense
  // in depth alongside BLOCKED.health, applied per-category rather than
  // globally since only beauty.* needs it.
  const BEAUTY_CLINICAL_NEGATIVES = ['acne treatment', 'dermatologist', 'prescription', 'hair loss treatment', 'pigmentation treatment'];

  const CATEGORIES = {
    // ================= FOOTWEAR =================
    'footwear.running': {
      enabled: true,
      patterns: [
        'running shoe', 'running shoes', 'trail running shoes', 'marathon shoes', 'jogging shoes', 'shoes for running',
        'nike', 'adidas', 'asics', 'brooks', 'hoka', 'new balance'
      ],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'running shoes'
    },
    'footwear.sneakers': {
      enabled: true,
      patterns: ['sneaker', 'sneakers', 'trainers', 'high top sneakers', 'low top sneakers', 'jordan', 'converse', 'vans', 'puma'],
      secondary: ['nike', 'adidas'],
      negative: ['running'],
      budget_scales: ['inr', 'usd'],
      display_name: 'sneakers'
    },
    'footwear.sports': {
      enabled: true,
      patterns: ['cricket shoes', 'cricket spikes', 'football studs', 'football boots', 'basketball shoes', 'badminton shoes', 'sports shoes'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'sports shoes'
    },
    'footwear.formal': {
      enabled: true,
      patterns: ['formal shoes', 'oxford shoes', 'oxfords', 'derby shoes', 'formal loafers', 'dress shoes'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'formal shoes'
    },
    'footwear.casual': {
      enabled: true,
      patterns: ['loafers', 'casual shoes', 'everyday shoes', 'canvas shoes'],
      secondary: [],
      negative: ['running', 'formal'],
      budget_scales: ['inr', 'usd'],
      display_name: 'casual shoes'
    },
    'footwear.sandals_flipflops': {
      enabled: true,
      patterns: ['sandals', 'flip flops', 'flip-flops', 'chappals', 'slides', 'slippers'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'sandals & flip-flops'
    },
    'footwear.womens_heels_flats': {
      enabled: true,
      patterns: ['heels', 'flats', 'stilettos', 'wedges', 'pumps shoes', 'ballet flats', 'womens shoes', "women's shoes"],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: "women's heels & flats"
    },
    'footwear.kids': {
      enabled: true,
      patterns: ['kids shoes', "kid's shoes", 'kids sneakers', 'toddler shoes'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'kids shoes'
    },
    'footwear.boots_trekking': {
      enabled: true,
      patterns: ['trekking shoes', 'hiking boots', 'trekking boots', 'ankle boots', 'combat boots', 'winter boots'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'boots & trekking shoes'
    },

    // ================= FASHION =================
    'fashion.mens': {
      enabled: true,
      patterns: ['mens shirt', "men's shirt", 'mens jeans', "men's jeans", 'mens jacket', 'mens t-shirt', 'mens clothing', 'mens wear', 'mens trousers', ...DESIGNER_GARMENT_PHRASES],
      secondary: ['designer', 'luxury', 'premium'],
      negative: ['ethnic', 'kurta', 'sherwani', 'wedding'],
      budget_scales: ['inr', 'usd'],
      display_name: "men's fashion"
    },
    'fashion.womens': {
      enabled: true,
      patterns: ['womens dress', "women's dress", 'womens top', 'womens jeans', "women's jeans", 'womens clothing', 'womens wear', 'dress for women'],
      secondary: ['designer', 'luxury', 'premium'],
      negative: ['ethnic', 'saree', 'lehenga', 'wedding'],
      budget_scales: ['inr', 'usd'],
      display_name: "women's fashion"
    },
    'fashion.ethnic_mens': {
      enabled: true,
      patterns: ['kurta', 'sherwani', 'nehru jacket', 'ethnic wear for men', 'mens ethnic wear', 'dhoti kurta'],
      secondary: [],
      negative: ['wedding'],
      budget_scales: ['inr'],
      display_name: "men's ethnic wear"
    },
    'fashion.ethnic_womens': {
      enabled: true,
      patterns: ['saree', 'sarees', 'lehenga', 'salwar', 'kurti', 'dupatta', 'ethnic wear for women', 'womens ethnic wear', 'anarkali'],
      secondary: [],
      negative: ['wedding'],
      budget_scales: ['inr'],
      display_name: "women's ethnic wear"
    },
    'fashion.accessories': {
      enabled: true,
      patterns: ['belt for men', 'leather belt', 'wallet for men', 'wallets', 'baseball cap', 'scarves', 'mens accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fashion accessories'
    },
    'fashion.watches': {
      enabled: true,
      patterns: ['wristwatch', 'watch brand', 'analog watch', 'wrist watch for men', 'wrist watch for women'],
      secondary: [],
      negative: ['smartwatch', 'fitness band'],
      budget_scales: ['inr', 'usd'],
      display_name: 'watches'
    },
    'fashion.eyewear': {
      enabled: true,
      patterns: ['sunglasses', 'spectacle frames', 'eyeglass frames', 'prescription glasses', 'reading glasses'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'eyewear'
    },
    'fashion.activewear': {
      enabled: true,
      patterns: ['activewear', 'gym wear', 'workout clothes', 'yoga pants', 'sports bra', 'track pants', 'joggers'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'activewear'
    },
    'fashion.winterwear': {
      enabled: true,
      patterns: ['winter wear', 'winter jacket', 'sweater', 'sweatshirt', 'thermal wear', 'puffer jacket', 'woolen wear'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'winter wear'
    },
    'fashion.innerwear': {
      enabled: true,
      patterns: ['innerwear', 'undergarments', 'briefs', 'boxers', 'lingerie'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'innerwear'
    },
    'fashion.kids': {
      enabled: true,
      patterns: ['kids party wear', 'kids ethnic wear', 'kids fashion', 'kids designer wear'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: "kids' fashion"
    },
    'fashion.bags_luggage_fashion': {
      enabled: true,
      patterns: ['handbag', 'tote bag', 'fashion backpack', 'sling bag', 'clutch bag', 'crossbody bag'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'bags'
    },
    'fashion.jewelry_fashion': {
      enabled: true,
      patterns: ['fashion jewelry', 'imitation jewelry', 'silver jewelry', 'oxidised jewelry', 'artificial jewelry'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fashion jewelry'
    },
    'fashion.jewelry_fine': {
      enabled: true,
      patterns: ['gold earrings', 'gold necklace', 'gold ring', 'diamond jewelry', 'fine jewelry', 'gold jewelry for wedding'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fine jewelry'
    },

    // ================= ELECTRONICS =================
    'electronics.phones': {
      enabled: true,
      patterns: ['smartphone', 'iphone', 'android phone', 'pixel phone', 'galaxy phone', 'best phone'],
      secondary: ['5g', 'camera phone', 'battery life'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'smartphones'
    },
    'electronics.laptops': {
      enabled: true,
      patterns: ['laptop', 'laptops', 'notebook computer', 'macbook', 'chromebook', 'ultrabook', 'gaming laptop'],
      secondary: ['ram', 'ssd', 'processor'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'laptops'
    },
    'electronics.headphones_audio': {
      enabled: true,
      patterns: ['headphones', 'earbuds', 'earphones', 'airpods', 'wireless earbuds', 'noise cancelling headphones', 'tws earbuds', 'bluetooth speaker', 'soundbar', 'speaker', 'sonos'],
      secondary: ['anc', 'bass'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'headphones & audio'
    },
    'electronics.tv': {
      enabled: true,
      patterns: ['television', 'smart tv', 'oled tv', 'qled tv', 'led tv', '4k tv'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'TVs'
    },
    'electronics.wearables': {
      enabled: true,
      patterns: ['smartwatch', 'fitness tracker', 'fitness band', 'smart ring', 'apple watch', 'garmin watch'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'wearables'
    },
    'electronics.peripherals': {
      enabled: true,
      patterns: ['mechanical keyboard', 'wireless mouse', 'gaming keyboard', 'webcam', 'usb microphone', 'computer mouse', 'keyboard and mouse'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'computer peripherals'
    },
    'electronics.tablets': {
      enabled: true,
      patterns: ['tablet', 'ipad', 'galaxy tab', 'android tablet'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'tablets'
    },
    'electronics.cameras': {
      enabled: true,
      patterns: ['camera', 'dslr', 'mirrorless camera', 'gopro', 'action camera', 'camera lens', 'gimbal', 'drone camera'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'cameras'
    },
    'electronics.gaming_hardware': {
      enabled: true,
      patterns: ['gaming console', 'graphics card', 'gpu', 'gaming laptop', 'game controller', 'ps5', 'xbox', 'nintendo switch'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'gaming hardware'
    },
    'electronics.pc_components': {
      enabled: true,
      patterns: ['cpu processor', 'graphics card', 'ram module', 'ssd drive', 'motherboard', 'pc cabinet', 'power supply unit', 'psu'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'PC components'
    },
    'electronics.chargers_accessories': {
      enabled: true,
      patterns: ['power bank', 'phone charger', 'charging cable', 'phone case', 'screen guard', 'screen protector'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'chargers & accessories'
    },
    'electronics.printers_scanners': {
      enabled: true,
      patterns: ['printer', 'scanner', 'inkjet printer', 'laser printer', 'all in one printer'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'printers & scanners'
    },
    'electronics.storage': {
      enabled: true,
      patterns: ['hard disk', 'external hard drive', 'pen drive', 'usb drive', 'nas storage', 'ssd storage'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'storage devices'
    },
    'electronics.networking': {
      enabled: true,
      patterns: ['router', 'wifi router', 'mesh router', 'wifi extender', 'range extender'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'networking gear'
    },

    // ================= HOME =================
    'home.mattresses': {
      enabled: true,
      patterns: ['mattress', 'mattresses', 'memory foam mattress', 'orthopedic mattress', 'spring mattress'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'mattresses'
    },
    'home.large_appliances': {
      enabled: true,
      patterns: ['air conditioner', 'ac unit', 'refrigerator', 'fridge', 'washing machine', 'geyser', 'water purifier', 'dishwasher', 'microwave oven', 'chimney', 'air purifier', 'wine fridge', 'wine cooler'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'large appliances'
    },
    'home.kitchen_appliances': {
      enabled: true,
      patterns: ['mixer grinder', 'air fryer', 'induction cooktop', 'otg oven', 'electric kettle', 'coffee machine', 'blender', 'toaster'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'kitchen appliances'
    },
    'home.furniture': {
      enabled: true,
      patterns: ['sofa', 'couch', 'bed frame', 'wardrobe', 'study table', 'dining table', 'bookshelf', 'recliner'],
      secondary: [],
      negative: ['office', 'wfh', 'ergonomic'],
      budget_scales: ['inr', 'usd'],
      display_name: 'furniture'
    },
    'home.smart_home': {
      enabled: true,
      patterns: ['smart plug', 'video doorbell', 'smart lock', 'smart bulb', 'alexa device', 'google home device', 'home security camera', 'smart home camera'],
      secondary: [],
      negative: ['nanny', 'partner', 'spouse', 'employee', 'track my', 'spy on'],
      budget_scales: ['inr', 'usd'],
      display_name: 'smart home devices'
    },
    'home.cookware_dining': {
      enabled: true,
      patterns: ['kadai', 'pressure cooker', 'tawa', 'dinner set', 'water bottle', 'tiffin box', 'lunch box set', 'cookware set'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'cookware & dining'
    },
    'home.decor': {
      enabled: true,
      patterns: ['curtains', 'rugs', 'wall art', 'artificial plants', 'planters', 'wall decor', 'home decor'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'home decor'
    },
    'home.bedding_bath': {
      enabled: true,
      patterns: ['bedsheets', 'comforter', 'pillows', 'towels', 'bed sheet set', 'duvet cover'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'bedding & bath'
    },
    'home.lighting': {
      enabled: true,
      patterns: ['table lamp', 'smart bulb', 'festive lights', 'led lights', 'floor lamp', 'ceiling light'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'lighting'
    },
    'home.storage_organization': {
      enabled: true,
      patterns: ['storage boxes', 'closet organizer', 'shoe rack', 'storage containers', 'wardrobe organizer'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'storage & organization'
    },
    'home.cleaning_devices': {
      enabled: true,
      patterns: ['vacuum cleaner', 'robot vacuum', 'steam mop', 'dyson', 'cordless vacuum', 'wet dry vacuum'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'cleaning devices'
    },
    'home.tools_diy': {
      enabled: true,
      patterns: ['drill machine', 'tool kit', 'screwdriver set', 'hammer', 'diy tools'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'tools & DIY'
    },
    'home.gardening': {
      enabled: true,
      patterns: ['garden tools', 'potting soil', 'gardening kit', 'plant fertilizer', 'garden hose'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'gardening'
    },

    // ================= BABY / KIDS =================
    'baby.nursery': {
      enabled: true,
      patterns: [...BABY_NURSERY_PHRASES, 'baby monitor', 'best stroller for'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'baby gear'
    },
    'baby.care': {
      enabled: true,
      patterns: [...BABY_CARE_PHRASES, 'best diapers for'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'baby care'
    },
    'baby.toys': {
      enabled: true,
      patterns: ['baby toys', 'kids toys', 'toys for toddler', 'educational toys for kids'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: "kids' toys"
    },
    'baby.kids_apparel': {
      enabled: true,
      patterns: ['kids clothing', 'kids clothes', 'baby clothes', 'toddler clothing', 'kids winter wear'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: "kids' clothing"
    },
    'baby.school': {
      enabled: true,
      patterns: ['school bag', 'school bag for', 'lunch box', 'kids lunch box', 'school stationery'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'school essentials'
    },

    // ================= MATERNITY =================
    'maternity.apparel': {
      enabled: true,
      patterns: MATERNITY_PHRASES,
      secondary: ['maternity', 'pregnancy'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'maternity wear'
    },
    'maternity.gear': {
      enabled: true,
      patterns: ['pregnancy pillow', 'nursing pillow', 'nursing gear', 'maternity belt', 'breast pump'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'maternity gear'
    },

    // ================= TRAVEL =================
    'travel.hotels': {
      enabled: true,
      patterns: ['hotel', 'hotels', 'resort', 'hotel deals', 'best hotel in', 'book a hotel', 'where to stay in', 'days in'],
      secondary: [],
      negative: ['insurance'],
      budget_scales: ['inr', 'usd'],
      display_name: 'hotels'
    },
    'travel.flights': {
      enabled: true,
      patterns: ['flight', 'flights', 'airfare', 'airline ticket', 'cheap flights', 'book a flight', 'flight deals'],
      secondary: [],
      negative: ['insurance'],
      budget_scales: ['inr', 'usd'],
      display_name: 'flights'
    },
    'travel.luggage': {
      enabled: true,
      patterns: ['suitcase', 'luggage', 'carry-on', 'travel bag', 'cabin bag', 'duffel bag'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'luggage'
    },
    'travel.packages': {
      enabled: true,
      patterns: ['honeymoon package', 'family travel package', 'europe tour package', 'holiday package'],
      secondary: [],
      negative: ['insurance'],
      budget_scales: ['inr', 'usd'],
      display_name: 'travel packages'
    },
    'travel.trains_buses': {
      enabled: true,
      patterns: ['train ticket', 'irctc booking', 'bus ticket', 'redbus', 'train booking'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'trains & buses'
    },
    'travel.car_rental_cabs': {
      enabled: true,
      patterns: ['rental car', 'car rental', 'rent a car', 'cab booking', 'outstation cab'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'car rental & cabs'
    },
    'travel.gear': {
      enabled: true,
      patterns: ['travel pillow', 'travel adapter', 'packing organizers', 'travel accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'travel gear'
    },
    'travel.visa_services': {
      enabled: true,
      patterns: ['visa filing service', 'tourist visa assistance', 'visa application service'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'visa services'
    },
    'travel.experiences': {
      enabled: true,
      patterns: ['guided tour', 'city tour booking', 'safari booking', 'theme park tickets', 'travel experiences'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'travel experiences'
    },

    // ================= SOFTWARE =================
    'software.vpn': {
      enabled: true,
      patterns: ['vpn', 'virtual private network', 'best vpn for', 'vpn deals'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'VPNs'
    },
    'software.productivity_saas': {
      enabled: true,
      patterns: ['crm software', 'best crm for', 'project management tool', 'note taking app', 'productivity app', 'saas subscription', 'notion', 'asana', 'trello', 'monday.com', 'airtable', 'clickup'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'productivity software'
    },
    'software.streaming_ott': {
      enabled: true,
      patterns: ['netflix subscription', 'ott subscription', 'streaming service', 'hotstar subscription', 'disney plus subscription', 'amazon prime video', 'streaming plan'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'streaming & OTT'
    },
    'software.courses_edtech': {
      enabled: true,
      patterns: ['online course', 'coding bootcamp', 'upskilling course', 'language learning app', 'test prep course', 'edtech subscription', 'online certification'],
      secondary: [],
      negative: ['homework', 'homework help'],
      budget_scales: ['inr', 'usd'],
      display_name: 'courses & edtech'
    },
    'software.hr_payroll': {
      enabled: true,
      patterns: [
        'payroll', 'payroll software', 'payroll tool', 'best payroll', 'payroll for',
        'hr software', 'hrms', 'hris', 'attendance tracking', 'leave management',
        'hiring tool', 'ats', 'applicant tracking', 'employee onboarding', 'contractor payments'
      ],
      secondary: ['gusto', 'rippling', 'deel', 'zoho payroll', 'razorpayx', 'keka', 'quickbooks payroll'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'HR & payroll software'
    },
    'software.design_creative': {
      enabled: true,
      patterns: ['design software', 'video editing software', 'photo editing software', 'stock photos subscription', 'creative suite'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'design & creative software'
    },
    'software.cloud_storage': {
      enabled: true,
      patterns: ['cloud storage', 'google drive storage', 'dropbox subscription', 'icloud storage'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'cloud storage'
    },
    'software.security_antivirus': {
      enabled: true,
      patterns: ['antivirus', 'malware protection', 'internet security software'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'security & antivirus'
    },
    'software.hosting_domains': {
      enabled: true,
      patterns: ['web hosting', 'domain registration', 'buy a domain', 'hosting plan'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'hosting & domains'
    },
    'software.ai_tools': {
      enabled: true,
      patterns: ['ai writing tool', 'ai image generator', 'ai coding assistant', 'chatbot subscription'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'AI tools'
    },
    'software.music_streaming': {
      enabled: true,
      patterns: ['spotify subscription', 'music streaming service', 'apple music subscription'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'music streaming'
    },
    'software.gaming_subs': {
      enabled: true,
      patterns: ['game pass subscription', 'gaming subscription service', 'ps plus subscription'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'gaming subscriptions'
    },
    'software.developer_tools': {
      enabled: true,
      patterns: ['developer tool', 'ide subscription', 'api platform', 'ci cd tool'],
      secondary: [],
      negative: [],
      budget_scales: ['usd'],
      display_name: 'developer tools'
    },

    // ================= GIFTING / OCCASIONS =================
    'gifting.general': {
      enabled: true,
      patterns: [...GENERAL_OCCASION_GIFT_PHRASES, 'gift for my', 'gift for a', 'gift ideas for', 'corporate gifting', 'gift for'],
      secondary: [],
      negative: ['wedding', 'diwali', 'rakhi', 'raksha bandhan'],
      budget_scales: ['inr', 'usd'],
      display_name: 'gifts'
    },
    'gifting.flowers_cakes': {
      enabled: true,
      patterns: ['flower delivery', 'same day flower delivery', 'cake delivery', 'send flowers', 'birthday cake delivery', 'bouquet delivery'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'flowers & cakes'
    },
    'gifting.festive': {
      enabled: true,
      patterns: [...FESTIVE_OCCASION_GIFT_PHRASES, 'diwali hamper', 'festive hamper', 'corporate diwali gifting'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'festive gifting'
    },
    'gifting.personalized': {
      enabled: true,
      patterns: ['photo frame gift', 'custom mug', 'personalized gift', 'customized gift', 'engraved gift'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'personalized gifts'
    },
    'occasions.wedding': {
      enabled: true,
      patterns: ['wedding shopping', 'wedding shopping for', 'trousseau', 'wedding outfit', 'bridal wear', 'wedding lehenga', 'sherwani for wedding', 'wedding guest outfit', 'return gifts for wedding', 'wedding gift'],
      secondary: ['wedding'],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'wedding shopping'
    },
    'occasions.party': {
      enabled: true,
      patterns: ['party decorations', 'balloons', 'birthday supplies', 'party supplies', 'birthday decorations'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'party supplies'
    },

    // ================= BEAUTY & GROOMING =================
    'beauty.skincare': {
      enabled: true,
      patterns: [
        'sunscreen', 'spf', 'serum', 'moisturizer', 'face wash', 'niacinamide', 'vitamin c serum',
        ...bestNounPhrases(['sunscreen', 'serum', 'moisturizer', 'face wash']),
        'skincare routine', 'best skincare for'
      ],
      secondary: ['glow', 'hydrating', 'oily skin', 'dry skin'],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr'],
      display_name: 'skincare'
    },
    'beauty.haircare': {
      enabled: true,
      patterns: [
        'shampoo', 'conditioner', 'hair oil', 'hair serum', 'hair dryer',
        ...bestNounPhrases(['shampoo', 'conditioner', 'hair oil', 'hair dryer']),
        'best shampoo for'
      ],
      secondary: ['frizzy hair', 'hair fall control'],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr'],
      display_name: 'haircare'
    },
    'beauty.makeup': {
      enabled: true,
      patterns: [
        'lipstick', 'foundation makeup', 'concealer', 'kajal', 'eyeliner', 'mascara', 'blush', 'compact powder', 'makeup palette',
        ...bestNounPhrases(['lipstick', 'foundation', 'concealer', 'kajal', 'eyeliner', 'mascara', 'blush'])
      ],
      secondary: ['shade', 'matte', 'nude'],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr'],
      display_name: 'makeup'
    },
    'beauty.fragrance': {
      enabled: true,
      patterns: [
        'perfume', 'edt', 'edp', 'body mist', 'eau de parfum', 'eau de toilette',
        ...bestNounPhrases(['perfume', 'body mist'])
      ],
      secondary: [],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr'],
      display_name: 'fragrance'
    },
    'beauty.mens_grooming': {
      enabled: true,
      patterns: [
        'trimmer', 'razor', 'beard oil', 'beard care', 'shaving kit',
        ...bestNounPhrases(['trimmer', 'razor', 'beard oil'])
      ],
      secondary: [],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr'],
      display_name: "men's grooming"
    },
    'beauty.tools': {
      enabled: true,
      patterns: ['hair straightener', 'hair curler', 'curling iron', 'facial steamer', 'derma roller'],
      secondary: [],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr', 'usd'],
      display_name: 'beauty tools'
    },
    'beauty.bath_body': {
      enabled: true,
      patterns: ['body wash', 'body lotion', 'body scrub', 'bath bomb', 'shower gel', 'body butter'],
      secondary: [],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr', 'usd'],
      display_name: 'bath & body'
    },
    'beauty.nails': {
      enabled: true,
      patterns: ['nail polish', 'nail art kit', 'nail extensions', 'manicure kit', 'nail care'],
      secondary: [],
      negative: BEAUTY_CLINICAL_NEGATIVES,
      budget_scales: ['inr', 'usd'],
      display_name: 'nail care'
    },

    // ================= FITNESS & SPORTS =================
    'fitness.equipment': {
      enabled: true,
      patterns: ['dumbbells', 'treadmill', 'weight bench', 'resistance bands', 'yoga mat', 'home gym equipment', 'exercise bike', 'kettlebell'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fitness equipment'
    },
    'fitness.apparel_gear': {
      enabled: true,
      patterns: ['gym bag', 'gym gloves', 'weightlifting gloves', 'gym belt'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fitness apparel & gear'
    },
    'fitness.nutrition': {
      enabled: true,
      patterns: ['protein powder', 'whey protein', 'creatine', 'electrolytes', 'protein bars', 'mass gainer', 'bcaa supplement'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'fitness nutrition'
    },
    'fitness.cycling': {
      enabled: true,
      patterns: ['bicycle', 'cycle', 'bike helmet', 'road bike', 'mountain bike', 'cycling lights', 'cycle accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'cycling'
    },
    'fitness.yoga': {
      enabled: true,
      patterns: ['yoga mat', 'yoga blocks', 'meditation cushion', 'yoga accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'yoga'
    },
    'sports.cricket': {
      enabled: true,
      patterns: ['cricket bat', 'cricket ball', 'cricket pads', 'cricket gloves', 'cricket kit', 'cricket helmet'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'cricket gear'
    },
    'sports.badminton_tennis': {
      enabled: true,
      patterns: ['badminton racquet', 'tennis racquet', 'shuttlecock', 'racquet strings', 'badminton shuttle'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'badminton & tennis'
    },
    'sports.football_basketball': {
      enabled: true,
      patterns: ['football', 'basketball', 'soccer ball', 'football jersey', 'basketball hoop'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'football & basketball'
    },
    'sports.swimming': {
      enabled: true,
      patterns: ['swimming goggles', 'swim cap', 'swimming costume', 'swim fins'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'swimming gear'
    },
    'sports.outdoor_camping': {
      enabled: true,
      patterns: ['tent', 'sleeping bag', 'trekking pole', 'rucksack', 'camping stove', 'backpacking gear', 'camping gear'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'camping & outdoor gear'
    },
    'sports.running_gear': {
      enabled: true,
      patterns: ['running belt', 'hydration pack', 'running watch', 'running accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'running gear'
    },

    // ================= FOOD & GROCERY =================
    'food.delivery': {
      enabled: true,
      patterns: ['food delivery', 'biryani near me', 'late night food delivery', 'restaurant delivery', 'order food online'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'food delivery'
    },
    'food.groceries_quickcommerce': {
      enabled: true,
      patterns: ['grocery delivery', 'online grocery', 'instant grocery delivery', 'monthly grocery order', 'quick commerce grocery'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'groceries'
    },
    'food.coffee_tea': {
      enabled: true,
      patterns: ['coffee beans', 'coffee subscription', 'tea leaves', 'french press'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'coffee & tea'
    },
    'food.snacks_gourmet': {
      enabled: true,
      patterns: ['dry fruits', 'gourmet chocolates', 'snack box', 'gift hamper snacks', 'premium snacks'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'snacks & gourmet'
    },
    'food.meal_plans': {
      enabled: true,
      patterns: ['meal kit subscription', 'tiffin service', 'meal plan subscription', 'diet meal plan delivery'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'meal plans'
    },
    'food.dining_out': {
      enabled: true,
      patterns: ['restaurant reservation', 'buffet deals', 'dining offers', 'restaurant deals'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'dining out'
    },

    // ================= GAMING -- gaming.pc intentionally omitted, canonical = electronics.gaming_hardware =================
    'gaming.consoles': {
      enabled: true,
      patterns: ['ps5 console', 'xbox series x', 'nintendo switch console', 'gaming console'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'gaming consoles'
    },
    'gaming.titles': {
      enabled: true,
      patterns: ['video game', 'game preorder', 'ps5 games', 'xbox games', 'pc game', 'switch games'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'game titles'
    },
    'gaming.accessories': {
      enabled: true,
      patterns: ['gaming headset', 'gaming chair', 'capture card', 'gaming controller'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'gaming accessories'
    },

    // ================= AUTO -- auto.cycles intentionally omitted, canonical = fitness.cycling =================
    'auto.two_wheeler_gear': {
      enabled: true,
      patterns: ['bike helmet', 'riding gloves', 'riding jacket', 'motorcycle helmet', 'two wheeler accessories'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'two-wheeler gear'
    },
    'auto.car_accessories': {
      enabled: true,
      patterns: ['dash cam', 'car seat covers', 'car air purifier', 'car infotainment system', 'car floor mats', 'car charger'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'car accessories'
    },
    'auto.tyres_batteries': {
      enabled: true,
      patterns: ['car tyres', 'car battery', 'bike tyres', 'tubeless tyres'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'tyres & batteries'
    },
    'auto.care': {
      enabled: true,
      patterns: ['car wash kit', 'car polish', 'microfiber cloth for car', 'car cleaning kit'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'car care'
    },
    'auto.ev_accessories': {
      enabled: true,
      patterns: ['ev charger', 'electric vehicle charger', 'ev charging cable'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'EV accessories'
    },

    // ================= PETS =================
    'pets.food': {
      enabled: true,
      patterns: ['dog food', 'cat food', 'pet food', 'puppy food'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'pet food'
    },
    'pets.accessories': {
      enabled: true,
      patterns: ['pet leash', 'pet bed', 'cat litter', 'aquarium', 'pet carrier', 'dog collar'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'pet accessories'
    },
    'pets.grooming': {
      enabled: true,
      patterns: ['pet grooming kit', 'dog shampoo', 'pet nail clipper', 'pet brush'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'pet grooming'
    },
    'pets.toys': {
      enabled: true,
      patterns: ['pet toys', 'dog toys', 'cat toys', 'chew toys for dogs'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'pet toys'
    },

    // ================= BOOKS / MEDIA / STATIONERY =================
    'books.print_ebooks': {
      enabled: true,
      patterns: ['books online', 'ebook', 'buy books', 'bestseller books', 'kindle books'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'books'
    },
    'books.audiobooks': {
      enabled: true,
      patterns: ['audiobook', 'audible subscription', 'audiobook app'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'audiobooks'
    },
    'stationery.office_art': {
      enabled: true,
      patterns: ['pens', 'notebooks stationery', 'art supplies', 'sketch pens', 'drawing kit', 'stationery set'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'stationery & art supplies'
    },
    'music.instruments': {
      enabled: true,
      patterns: ['guitar', 'keyboard instrument', 'ukulele', 'musical instrument', 'digital piano'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'musical instruments'
    },

    // ================= SERVICES (LOCAL) =================
    'services.home': {
      enabled: true,
      patterns: ['deep cleaning service', 'pest control service', 'ac service', 'plumbing service', 'painting service', 'home cleaning service'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'home services'
    },
    'services.salon_at_home': {
      enabled: true,
      patterns: ['salon at home', 'home spa service', 'at home haircut', 'at home facial'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'salon at home'
    },
    'services.appliance_repair': {
      enabled: true,
      patterns: ['appliance repair service', 'ac repair', 'washing machine repair', 'refrigerator repair'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'appliance repair'
    },
    'services.movers_packers': {
      enabled: true,
      patterns: ['movers and packers', 'packers and movers', 'home relocation service', 'moving service'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'movers & packers'
    },
    'services.laundry': {
      enabled: true,
      patterns: ['laundry service', 'dry cleaning service', 'wash and fold service'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'laundry services'
    },

    // ================= TELECOM / UTILITIES =================
    'telecom.mobile_plans': {
      enabled: true,
      patterns: ['mobile recharge', 'prepaid plan', 'postpaid plan', 'sim card', 'port my number'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'mobile plans'
    },
    'telecom.broadband': {
      enabled: true,
      patterns: ['broadband connection', 'wifi broadband plan', 'internet connection'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'broadband'
    },
    'telecom.dth_ott_bundles': {
      enabled: true,
      patterns: ['dth recharge', 'dth plan', 'ott bundle plan'],
      secondary: [],
      negative: [],
      budget_scales: ['inr'],
      display_name: 'DTH & OTT bundles'
    },

    // ================= EVENTS / ENTERTAINMENT =================
    'events.movies': {
      enabled: true,
      patterns: ['movie tickets', 'book movie tickets', 'cinema tickets'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'movie tickets'
    },
    'events.concerts_standup': {
      enabled: true,
      patterns: ['concert tickets', 'standup show tickets', 'live show tickets'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'concerts & shows'
    },
    'events.sports_tickets': {
      enabled: true,
      patterns: ['ipl tickets', 'match tickets', 'sports event tickets', 'cricket match tickets'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'sports tickets'
    },
    'events.theme_parks': {
      enabled: true,
      patterns: ['theme park tickets', 'amusement park tickets', 'water park tickets'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'theme parks'
    },

    // ================= OFFICE / WFH =================
    'office.chairs_desks': {
      enabled: true,
      patterns: ['ergonomic chair', 'standing desk', 'office chair', 'office desk', 'wfh chair'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'office chairs & desks'
    },
    'office.setup': {
      enabled: true,
      patterns: ['monitor arm', 'laptop dock', 'ring light for calls', 'wfh setup', 'home office setup'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'office/WFH setup'
    },
    'office.supplies': {
      enabled: true,
      patterns: ['office supplies', 'printer paper', 'office stationery', 'sticky notes'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'office supplies'
    },

    // ================= REFURBISHED / RESALE =================
    'resale.refurb_electronics': {
      enabled: true,
      patterns: ['renewed phone', 'refurbished laptop', 'open box laptop', 'refurbished electronics', 'certified renewed'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'refurbished electronics'
    },
    'resale.exchange_offers': {
      enabled: true,
      patterns: ['exchange my old phone', 'phone exchange offer', 'trade in my phone', 'exchange offer'],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'exchange offers'
    },

    // ================= FALLBACK (v2.0) =================
    // Never scored through the normal pattern-matching loop (explicitly
    // skipped in classifier.js's scoreCategories). Reached only via the
    // shopping.general fallback path in classify() -- see the V2.0 SCOPE
    // NOTE above and extractProductTokens()/hasPlausibleProductReference()
    // below.
    'shopping.general': {
      enabled: true,
      patterns: [],
      secondary: [],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'shopping picks'
    }
  };

  // --------------------------------------------------------------------------
  // RESEARCH SIGNALS (v2.0, renamed + broadened from v1's "intent
  // signals"). A category only needs ONE of these present to drop its
  // pattern threshold from 2 hits to 1 (see classifier.js). Scoped to
  // userText only -- a shopper's own framing lives in what they typed,
  // not the assistant's response.
  // --------------------------------------------------------------------------
  // Regex, not plain substrings, as of this pass -- \b word boundaries
  // catch a wider range of real phrasing than exact-substring matching
  // could (e.g. "recommend", "recommends", "recommendations" from one
  // pattern) without the false-positive risk of a bare .includes() on a
  // short fragment. All 8 groups from the original build are preserved
  // (a since-reverted proposal dropped recommendation/upgrade_replacement/
  // setup_bundle/occasion entirely, which would have broken every fixture
  // that depends on those specifically -- kept intentionally here).
  const RESEARCH_SIGNALS = {
    // Broadened with per-seat/per-user/free-trial pricing language and
    // purchase/order/promo/offer, on top of the original purchase set --
    // still the one group `dealSeeking` keys off, so this stays the home
    // for "does this query care about cost" rather than splitting into a
    // separate price group (that would change dealSeeking's meaning for
    // every query already tested against it).
    purchase: /\b(best|top|buy|purchase|order|price|pricing|cost|costs|under|deals?|discounts?|coupons?|promo|offers?|cheap(?:est|er)?|affordable|budget|where to buy|in stock|per (?:seat|user|month)|free (?:tier|plan|trial))\b/i,
    comparison: /\b(vs\.?|versus|compare[ds]?|comparison|better than|difference between)\b/i,
    // Bare 'similar' (not just 'similar to') so "similar perfumes to X"
    // still counts -- the noun in between means the literal phrase
    // 'similar to' never appears contiguous in that word order.
    alternatives: /\b(alternatives?(?: to| for)?|competitors?(?: to| of)?|similar(?: to)?|instead of|replac(?:e|ement)(?: for)?|switch(?:ing)? from|like)\b/i,
    evaluation: /\b(worth (?:it|buying)|reviews?(?: of)?|should i (?:get|buy|use)|pros and cons(?: of)?|any good|rated)\b/i,
    recommendation: /\b(recommend(?:ations?)?|suggest(?:ions?)?|which should i|for (?:my|a|beginners))\b/i,
    upgrade_replacement: /\b(upgrade(?:d|s)? from|broke|died|switching from)\b/i,
    setup_bundle: /\b(setup|essentials|checklist|kit)\b/i,
    // Occasion words alone route to gifting -- see gifting.*/occasions.*
    // patterns, which already encode "occasion + gift noun" combinators.
    occasion: /\b(gifts?|diwali|wedding|rakhi|birthday|anniversary)\b/i
  };

  // Narrowed to clearly non-commercial framings only (v2.0) -- "review of
  // X" is explicitly research now (fires), not suppressed. A match here
  // forces silence regardless of category score.
  const INFORMATIONAL_SUPPRESSORS = [
    'how does', 'how do ', 'history of', 'who invented', 'homework', 'essay',
    'company revenue', 'market size', 'news about'
  ];

  function detectResearchSignal(userText) {
    const t = (userText || '').toLowerCase();
    const matched = [];
    for (const [name, pattern] of Object.entries(RESEARCH_SIGNALS)) {
      if (pattern.test(t)) matched.push(name);
    }
    const informational = INFORMATIONAL_SUPPRESSORS.some((p) => t.includes(p));
    return {
      signals: matched,
      hasSignal: matched.length > 0,
      // "purchase" now carries what "deal_seeking" used to (discount,
      // coupon, cheapest, ...) -- still worth a small scoring bonus.
      dealSeeking: matched.includes('purchase'),
      informationalSuppressed: informational
    };
  }

  // --------------------------------------------------------------------------
  // shopping.general support (v2.0): token extraction + a deliberately
  // permissive "is this plausibly about a real product" check. Both are
  // cheap to over-trigger on, because the actual safety net is downstream
  // in main.js -- shopping.general only ever RENDERS if a keyword-matched
  // offer actually exists in the catalog. Over-attempting costs nothing;
  // under-attempting misses real product research.
  // --------------------------------------------------------------------------
  const PRODUCT_TOKEN_STOPWORDS = new Set([
    'best', 'good', 'that', 'with', 'this', 'what', 'which', 'should', 'recommend', 'recommends',
    'recommended', 'suggest', 'suggests', 'review', 'reviews', 'worth', 'than', 'from', 'into',
    'about', 'under', 'over', 'their', 'there', 'where', 'when', 'some', 'such', 'only', 'just',
    'more', 'most', 'very', 'does', 'doing', 'have', 'has', 'had', 'will', 'would', 'could', 'can',
    'buy', 'buying', 'price', 'prices', 'deal', 'deals', 'discount', 'discounts', 'coupon', 'coupons',
    'cheapest', 'cheap', 'compare', 'compared', 'comparing', 'alternative', 'alternatives', 'similar',
    'like', 'instead', 'replacement', 'competitor', 'competitors', 'upgrade', 'upgrading', 'switching',
    'switch', 'setup', 'essentials', 'checklist', 'kit', 'gift', 'gifts', 'any', 'get'
  ]);

  function extractProductTokens(originalText) {
    const words = (originalText || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [];
    const seen = new Set();
    const tokens = [];
    for (const w of words) {
      if (PRODUCT_TOKEN_STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      tokens.push(w);
    }
    return tokens;
  }

  function hasPlausibleProductReference(originalText) {
    const text = originalText || '';
    // A capitalized token not at the very start of the string (sentence-
    // initial capitals don't count as brand-like signal).
    const capMatch = /[a-zA-Z]\s+[A-Z][a-zA-Z]{2,}/.test(text);
    // Model-number-looking token: letters+digits or digits+letters.
    const modelMatch = /\b[a-zA-Z]*\d+[a-zA-Z]*\b/.test(text);
    // A price mention.
    const priceMatch = /(\$|₹|rs\.?|inr)\s*\d|\d+\s*(rs|inr|usd)\b|under\s+\d|below\s+\d/i.test(text);
    // Fallback: any concrete content word survives token extraction.
    const hasContentWord = extractProductTokens(text).length > 0;
    return capMatch || modelMatch || priceMatch || hasContentWord;
  }

  // Defense in depth for the shopping.general fallback: even though
  // checkBlocked() in classifier.js already runs on the full combined
  // text before this fallback is ever reached, each matched product
  // token is independently checked against every BLOCKED phrase (exact
  // match only, to avoid false positives from partial substrings) before
  // being used for catalog keyword-matching in main.js.
  function isBlockedToken(token) {
    const t = (token || '').toLowerCase();
    return Object.values(BLOCKED).some((group) => group.phrases.includes(t));
  }

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
  // Generous pattern lists on purpose -- silence is the safe default. A
  // blocked hit silences the page even when purchase intent is explicit.
  // UNCHANGED from v1.1 -- v2.0 does not touch this list at all.
  const BLOCKED = {
    health: {
      phrases: [
        'symptom', 'symptoms', 'diagnosed', 'diagnosis', 'chronic pain', 'blood pressure',
        'blood sugar', 'my doctor', 'my dr said', 'prescription', 'medication', 'side effects',
        'std ', 'sti ', 'biopsy', 'tumor', 'cancer', 'surgery', 'chemotherapy', 'disease',
        'infection', 'rash', 'std test', 'pregnant', 'pregnancy', 'fertility', 'period cramps',
        'std symptoms',
        'glucometer', 'blood pressure monitor', 'bp monitor', 'thermometer', 'cpap', 'cpap machine',
        'nebulizer', 'ozempic', 'wegovy', 'weight loss pills', 'weight loss injection',
        'appetite suppressant', 'fat burner pills', 'ovulation kit', 'fertility test',
        'fertility treatment', 'ivf', 'supplements for anxiety', 'supplements for sleep',
        'supplements for hair loss', 'supplement for diabetes', 'anxiety supplement',
        'sleep supplement', 'hair loss treatment', 'hair regrowth treatment', 'acne treatment',
        'cystic acne', 'dermatologist prescribed', 'skin condition treatment'
      ]
    },
    mental_health: {
      phrases: [
        'depression', 'depressed', 'anxiety attack', 'anxious', 'panic attack', 'therapist',
        'therapy session', 'bipolar', 'ptsd', 'ocd', 'eating disorder', 'self harm', 'self-harm',
        'suicide', 'suicidal', 'want to die', 'end my life', 'crisis hotline', 'mental breakdown',
        'therapy app', 'counseling service', 'mental wellness app', 'online therapy'
      ]
    },
    personal_finance: {
      phrases: [
        'my debt', 'credit card debt', 'pay off my loan', 'student loan', 'bankruptcy',
        'credit score', 'my mortgage', 'investing my savings', 'retirement savings',
        'life insurance policy', 'health insurance plan', 'file my taxes', 'irs audit',
        'payday loan', 'refinance my', 'my 401k', 'stock portfolio advice',
        'credit card', 'best credit card', 'cashback credit card', 'personal loan', 'home loan',
        'car loan', 'loan against', 'apply for a loan', 'buy now pay later', 'bnpl',
        'insurance policy', 'health insurance', 'life insurance', 'motor insurance',
        'travel insurance', 'car insurance', 'term insurance', 'insurance premium',
        'demat account', 'trading account', 'stock broker', 'brokerage account',
        'bitcoin', 'cryptocurrency', 'crypto exchange', 'buy crypto', 'ethereum',
        'gold investment', 'digital gold', 'sovereign gold bond', 'gold rate',
        'invest in gold', 'gold returns'
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
        'libido', 'sexual performance',
        'dating app', 'dating service', 'adult toys', 'adult content'
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
        'child custody', 'my teenager', 'my daughter is being bullied'
      ]
    },
    crisis: {
      phrases: [
        'grieving', 'my mom died', 'my dad died', 'someone died', 'in crisis', 'overdose',
        'i want to hurt myself', 'i want to hurt someone'
      ]
    },
    gambling: {
      phrases: [
        'real money gaming', 'rummy for cash', 'teen patti cash', 'betting app', 'casino app',
        'online casino', 'sports betting', 'lottery ticket', 'fantasy league cash',
        'win real money', 'play rummy win cash', 'best rummy app to win money'
      ]
    },
    alcohol_tobacco: {
      phrases: [
        'whiskey', 'vodka', 'tequila', 'rum under', 'best rum', 'liquor', 'alcohol delivery',
        'buy wine', 'wine under', 'bottle of wine', 'cigarette', 'cigar',
        'tobacco', 'vape', 'vaping', 'e-cigarette', 'nicotine'
      ]
    },
    weapons: {
      phrases: [
        'firearm', 'handgun', 'rifle', 'pistol', 'ammunition', 'gun store', 'buy a gun',
        'self defense weapon', 'stun gun', 'taser'
      ]
    },
    surveillance: {
      phrases: [
        'nanny cam', 'camera to watch my nanny', 'watch my nanny', 'spy on my', 'spy camera',
        'spy cam', 'hidden camera', 'track my partner', 'track my spouse', 'catch a cheating',
        'phone tracker app', 'phone tracker', 'keylogger', 'monitor my employee',
        'hidden camera to catch'
      ]
    },
    funeral_commerce: {
      phrases: [
        'funeral home', 'funeral services', 'cremation', 'casket', 'burial plot',
        'headstone', 'cemetery plot'
      ]
    }
  };

  window.ScribbleTaxonomy = {
    CATEGORIES, BLOCKED, RESEARCH_SIGNALS, INFORMATIONAL_SUPPRESSORS,
    detectResearchSignal, extractProductTokens, hasPlausibleProductReference, isBlockedToken,
    extractBudgetBand
  };
})();
