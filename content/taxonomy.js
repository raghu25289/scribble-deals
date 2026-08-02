// Taxonomy v1 (trigger-taxonomy-v1.md): shopping categories + intent
// signals + the blocked topic list. Loaded as a plain script (no build
// step), attaches itself to `window.ScribbleTaxonomy`.
//
// SCHEMA per category:
//   enabled:       false = P1/P2, structural placeholder only (no patterns
//                  written yet, per the doc's rollout tiers). true = P0,
//                  built and live.
//   patterns:      full-weight (1 point each). Multi-word patterns (those
//                  containing a space) ALSO satisfy the threshold alone,
//                  same as v0.3's keywords/phrases split -- this is a
//                  deliberate schema-mapping choice: the doc specifies one
//                  unified `patterns` array, but "keep the existing
//                  two-hit threshold" (explicit instruction) only works
//                  for previously-tested strong compound phrases like
//                  "designer shirt" if a multi-word match can still clear
//                  threshold alone. Single-word patterns behave like v0.3
//                  keywords: 1 point, need a second hit.
//   secondary:     half-weight (0.5), never enough alone.
//   negative:      any match here silences THIS category (not global).
//   budget_scales: ['inr'], ['usd'], or ['inr','usd'] -- metadata only,
//                  does not change parsing (extractBudgetBand always
//                  computes both bands; this just documents which one is
//                  the meaningful one for that vertical, for future UI/
//                  telemetry use).
//   display_name:  human label. Filled in for every slug, including
//                  disabled ones, so the panel never has to fall back to
//                  slug-humanizing once a P1/P2 category goes live.
//
// NOTE: no finance categories here on purpose — personal finance is a
// blocked topic (see BLOCKED below), not a shoppable category.
//
// ============================================================================
// SCOPE NOTE -- read before extending this file. Several places in the
// source spec (trigger-taxonomy-v1.md) are internally ambiguous or, in a
// few spots, directly contradict either themselves or the build brief that
// pointed at them. Rather than guess silently, here is exactly what was
// decided and why, so the resolution is auditable instead of buried:
//
// 1. SECTION 3 vs SECTION 6 SCOPE: Section 3 tags whole verticals "(P0)"
//    (all of footwear, all of fashion, all of electronics, etc) but
//    Section 6's "Rollout priority" list narrows several of those to a
//    specific subset ("fashion core: mens/womens/ethnic/accessories/
//    watches/eyewear", "electronics core: phones/laptops/audio/tv/
//    wearables/peripherals", "home core: mattresses/large appliances/
//    kitchen appliances/furniture"). The build brief says "implement
//    every P0 category from Section 6" -- Section 6 wins as authoritative
//    wherever the two disagree. Concretely: fashion.activewear/
//    winterwear/innerwear/kids/bags_luggage_fashion/jewelry_fashion/
//    jewelry_fine, and electronics.tablets/cameras/gaming_hardware/
//    pc_components/chargers_accessories/printers_scanners/storage/
//    networking are all P1/P2 stubs under v1, EVEN THOUGH tablets/
//    cameras/gaming were live, working categories in v0.3. This is a
//    deliberate, documented narrowing, not an accidental regression.
//
// 2. HOME.SMART_HOME: absent from Section 6's narrow home list, but the
//    build brief's own required test set explicitly needs "video doorbell"
//    to fire home.smart_home. An explicit test requirement overrides the
//    narrower rollout list, so home.smart_home ships as P0 here.
//
// 3. THE "NEAR-MISS" CONTRADICTION for P1 categories (sunscreen ->
//    beauty.skincare, whey -> fitness.nutrition, gold earrings ->
//    fashion.jewelry_fine): the build brief says these should log as
//    near-misses, but per item 1 above (and the brief's OWN instruction:
//    "Create P1/P2 slugs with enabled:false and EMPTY pattern arrays --
//    do not write their patterns now"), a category with zero patterns can
//    mathematically never score any points, and therefore can never
//    appear in a near-miss log either -- there is nothing to almost-match
//    against. Resolution: these queries return null (observably silent),
//    same as if the category didn't exist yet, and the test harness below
//    asserts that plus an annotation of *why* (disabled P1, not blocked),
//    rather than asserting a literal near-miss log line that the schema
//    makes impossible to produce.
//
// 4. GIFTING WEDDING ROUTING: canonical-ownership says wedding-worded
//    apparel routes to occasions.wedding over fashion.ethnic_*. Implemented
//    via `negative: ['wedding']` on fashion.mens/womens/ethnic_mens/
//    ethnic_womens, so a wedding-worded query structurally cannot fire
//    those and falls through to occasions.wedding's own patterns.
//
// 5. "7 days in Vietnam under 60k" -> doc says "fires travel.hotels +
//    flights" (plural). The build brief's OWN multi-category rule says
//    return the single highest-scoring category, panel never mixes
//    categories. The explicit single-category rule wins; this query fires
//    ONE of travel.hotels/travel.flights (whichever scores higher --
//    travel.hotels, since 'days in' lives there).
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

  // ---- Stub factory for P1/P2 placeholders --------------------------------
  // Structural placeholder only, per the doc: "Do not write their patterns
  // now." Empty patterns mean these can never score (see SCOPE NOTE #3).
  function stub(display_name, budget_scales) {
    return { enabled: false, patterns: [], secondary: [], negative: [], budget_scales: budget_scales || ['inr', 'usd'], display_name };
  }

  const CATEGORIES = {
    // ================= FOOTWEAR (P0, all 9) =================
    'footwear.running': {
      enabled: true,
      patterns: ['running shoe', 'running shoes', 'trail running shoes', 'marathon shoes', 'jogging shoes', 'shoes for running'],
      secondary: ['nike', 'adidas', 'asics', 'brooks', 'hoka', 'new balance'],
      negative: [],
      budget_scales: ['inr', 'usd'],
      display_name: 'running shoes'
    },
    'footwear.sneakers': {
      enabled: true,
      patterns: ['sneaker', 'sneakers', 'trainers', 'high top sneakers', 'low top sneakers'],
      secondary: ['nike', 'adidas', 'jordan', 'converse', 'vans', 'puma'],
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

    // ================= FASHION (P0 core: mens/womens/ethnic/accessories/watches/eyewear) =================
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
    'fashion.activewear': stub('activewear', ['inr', 'usd']),
    'fashion.winterwear': stub('winter wear', ['inr', 'usd']),
    'fashion.innerwear': stub('innerwear', ['inr', 'usd']),
    'fashion.kids': stub("kids' fashion", ['inr', 'usd']),
    'fashion.bags_luggage_fashion': stub('bags', ['inr', 'usd']),
    'fashion.jewelry_fashion': stub('fashion jewelry', ['inr', 'usd']),
    'fashion.jewelry_fine': stub('fine jewelry', ['inr', 'usd']),

    // ================= ELECTRONICS (P0 core: phones/laptops/audio/tv/wearables/peripherals) =================
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
      patterns: ['headphones', 'earbuds', 'earphones', 'airpods', 'wireless earbuds', 'noise cancelling headphones', 'tws earbuds', 'bluetooth speaker', 'soundbar'],
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
    'electronics.tablets': stub('tablets', ['inr', 'usd']),
    'electronics.cameras': stub('cameras', ['inr', 'usd']),
    'electronics.gaming_hardware': stub('gaming hardware', ['inr', 'usd']),
    'electronics.pc_components': stub('PC components', ['inr', 'usd']),
    'electronics.chargers_accessories': stub('chargers & accessories', ['inr', 'usd']),
    'electronics.printers_scanners': stub('printers & scanners', ['inr', 'usd']),
    'electronics.storage': stub('storage devices', ['inr', 'usd']),
    'electronics.networking': stub('networking gear', ['inr', 'usd']),

    // ================= HOME (P0 core: mattresses/large appliances/kitchen appliances/furniture, plus smart_home per test requirement -- see SCOPE NOTE #2) =================
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
    'home.cookware_dining': stub('cookware & dining', ['inr', 'usd']),
    'home.decor': stub('home decor', ['inr', 'usd']),
    'home.bedding_bath': stub('bedding & bath', ['inr', 'usd']),
    'home.lighting': stub('lighting', ['inr', 'usd']),
    'home.storage_organization': stub('storage & organization', ['inr', 'usd']),
    'home.cleaning_devices': stub('cleaning devices', ['inr', 'usd']),
    'home.tools_diy': stub('tools & DIY', ['inr', 'usd']),
    'home.gardening': stub('gardening', ['inr', 'usd']),

    // ================= BABY / KIDS (P0, full section) =================
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

    // ================= MATERNITY (P0, full section) =================
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

    // ================= TRAVEL (P0 core: hotels/flights/luggage) =================
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
    'travel.packages': stub('travel packages', ['inr', 'usd']),
    'travel.trains_buses': stub('trains & buses', ['inr']),
    'travel.car_rental_cabs': stub('car rental & cabs', ['inr', 'usd']),
    'travel.gear': stub('travel gear', ['inr', 'usd']),
    'travel.visa_services': stub('visa services', ['inr', 'usd']),
    'travel.experiences': stub('travel experiences', ['inr', 'usd']),

    // ================= SOFTWARE (P0 core: vpn/saas/ott/edtech) =================
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
      patterns: ['crm software', 'best crm for', 'project management tool', 'note taking app', 'productivity app', 'saas subscription'],
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
    'software.design_creative': stub('design & creative software', ['usd']),
    'software.cloud_storage': stub('cloud storage', ['usd']),
    'software.security_antivirus': stub('security & antivirus', ['usd']),
    'software.hosting_domains': stub('hosting & domains', ['usd']),
    'software.ai_tools': stub('AI tools', ['usd']),
    'software.music_streaming': stub('music streaming', ['inr', 'usd']),
    'software.gaming_subs': stub('gaming subscriptions', ['usd']),
    'software.developer_tools': stub('developer tools', ['usd']),

    // ================= GIFTING / OCCASIONS (P0, gifting.* including wedding) =================
    'gifting.general': {
      enabled: true,
      patterns: [...GENERAL_OCCASION_GIFT_PHRASES, 'gift for my', 'gift for a', 'gift ideas for', 'corporate gifting', 'gift for'],
      secondary: [],
      // Wedding and Diwali/Rakhi route to their own, more specific
      // categories (occasions.wedding, gifting.festive) -- excluded here
      // the same way, so a generic "gift for my" phrase hit here doesn't
      // win a scoring tie against the category that's actually canonical
      // for that occasion.
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
    'occasions.party': stub('party supplies', ['inr', 'usd']),

    // ================= BEAUTY & GROOMING (P1) =================
    'beauty.skincare': stub('skincare', ['inr', 'usd']),
    'beauty.haircare': stub('haircare', ['inr', 'usd']),
    'beauty.makeup': stub('makeup', ['inr', 'usd']),
    'beauty.fragrance': stub('fragrance', ['inr', 'usd']),
    'beauty.mens_grooming': stub("men's grooming", ['inr', 'usd']),
    'beauty.tools': stub('beauty tools', ['inr', 'usd']),
    'beauty.bath_body': stub('bath & body', ['inr', 'usd']),
    'beauty.nails': stub('nail care', ['inr', 'usd']),

    // ================= FITNESS & SPORTS (P1) =================
    'fitness.equipment': stub('fitness equipment', ['inr', 'usd']),
    'fitness.apparel_gear': stub('fitness apparel & gear', ['inr', 'usd']),
    'fitness.nutrition': stub('fitness nutrition', ['inr', 'usd']),
    'fitness.cycling': stub('cycling', ['inr', 'usd']),
    'fitness.yoga': stub('yoga', ['inr', 'usd']),
    'sports.cricket': stub('cricket gear', ['inr']),
    'sports.badminton_tennis': stub('badminton & tennis', ['inr', 'usd']),
    'sports.football_basketball': stub('football & basketball', ['inr', 'usd']),
    'sports.swimming': stub('swimming gear', ['inr', 'usd']),
    'sports.outdoor_camping': stub('camping & outdoor gear', ['inr', 'usd']),
    'sports.running_gear': stub('running gear', ['inr', 'usd']),

    // ================= FOOD & GROCERY (P1) =================
    'food.delivery': stub('food delivery', ['inr', 'usd']),
    'food.groceries_quickcommerce': stub('groceries', ['inr']),
    'food.coffee_tea': stub('coffee & tea', ['inr', 'usd']),
    'food.snacks_gourmet': stub('snacks & gourmet', ['inr', 'usd']),
    'food.meal_plans': stub('meal plans', ['inr', 'usd']),
    'food.dining_out': stub('dining out', ['inr']),

    // ================= GAMING (P1) -- gaming.pc intentionally omitted, canonical = electronics.gaming_hardware =================
    'gaming.consoles': stub('gaming consoles', ['inr', 'usd']),
    'gaming.titles': stub('game titles', ['inr', 'usd']),
    'gaming.accessories': stub('gaming accessories', ['inr', 'usd']),

    // ================= AUTO (P1) -- auto.cycles intentionally omitted, canonical = fitness.cycling =================
    'auto.two_wheeler_gear': stub('two-wheeler gear', ['inr']),
    'auto.car_accessories': stub('car accessories', ['inr', 'usd']),
    'auto.tyres_batteries': stub('tyres & batteries', ['inr']),
    'auto.care': stub('car care', ['inr']),
    'auto.ev_accessories': stub('EV accessories', ['inr', 'usd']),

    // ================= PETS (P1) =================
    'pets.food': stub('pet food', ['inr', 'usd']),
    'pets.accessories': stub('pet accessories', ['inr', 'usd']),
    'pets.grooming': stub('pet grooming', ['inr', 'usd']),
    'pets.toys': stub('pet toys', ['inr', 'usd']),

    // ================= BOOKS / MEDIA / STATIONERY (P2) =================
    'books.print_ebooks': stub('books', ['inr', 'usd']),
    'books.audiobooks': stub('audiobooks', ['inr', 'usd']),
    'stationery.office_art': stub('stationery & art supplies', ['inr', 'usd']),
    'music.instruments': stub('musical instruments', ['inr', 'usd']),

    // ================= SERVICES (LOCAL, P1) =================
    'services.home': stub('home services', ['inr']),
    'services.salon_at_home': stub('salon at home', ['inr']),
    'services.appliance_repair': stub('appliance repair', ['inr']),
    'services.movers_packers': stub('movers & packers', ['inr']),
    'services.laundry': stub('laundry services', ['inr']),

    // ================= TELECOM / UTILITIES (P2) =================
    'telecom.mobile_plans': stub('mobile plans', ['inr']),
    'telecom.broadband': stub('broadband', ['inr']),
    'telecom.dth_ott_bundles': stub('DTH & OTT bundles', ['inr']),

    // ================= EVENTS / ENTERTAINMENT (P1) =================
    'events.movies': stub('movie tickets', ['inr', 'usd']),
    'events.concerts_standup': stub('concerts & shows', ['inr', 'usd']),
    'events.sports_tickets': stub('sports tickets', ['inr', 'usd']),
    'events.theme_parks': stub('theme parks', ['inr', 'usd']),

    // ================= OFFICE / WFH (P1) =================
    'office.chairs_desks': stub('office chairs & desks', ['inr', 'usd']),
    'office.setup': stub('office/WFH setup', ['inr', 'usd']),
    'office.supplies': stub('office supplies', ['inr', 'usd']),

    // ================= REFURBISHED / RESALE (P2) =================
    'resale.refurb_electronics': stub('refurbished electronics', ['inr', 'usd']),
    'resale.exchange_offers': stub('exchange offers', ['inr', 'usd'])
  };

  // --------------------------------------------------------------------------
  // INTENT SIGNALS (Section 2 of the doc): a category only fires when it
  // clears the score threshold AND at least one of these is present. All
  // scoped to userText only, same rationale as budget parsing -- a
  // shopper's own framing lives in what they typed, not the assistant's
  // response.
  // --------------------------------------------------------------------------
  const INTENT_SIGNALS = {
    direct_ask: ['best ', 'top ', 'which should i buy', 'recommend a ', 'recommend an ', 'should i buy', 'suggest a ', 'suggest me a', ' for under'],
    comparison: [' vs ', ' vs.', ' versus ', 'is better than', 'alternatives to', 'alternative to', 'competitors to', 'compared to'],
    // Highest-value signal, fires eagerly -- also adds a scoring bonus,
    // handled separately in classifier.js, not just a gate here.
    deal_seeking: ['discount', 'coupon', 'promo code', 'on sale', 'best deal', 'cheapest', 'lowest price', 'price drop', 'cashback', 'flash sale', 'clearance sale', 'offer', 'deal'],
    persona_recommendation: ['for my dad', 'for my mom', 'for my mother', 'for my father', 'for my wife', 'for my husband', 'for my son', 'for my daughter', 'for my sister', 'for my brother', 'for my girlfriend', 'for my boyfriend', 'for a student', 'for a beginner', 'for beginners', 'for a professional', 'gift for', 'for flat feet'],
    replacement_upgrade: ['broke', 'died', 'stopped working', 'upgrade from', 'switching from', 'worth upgrading', 'replace my', 'my old'],
    where_to_buy: ['where can i buy', 'where to buy', 'is it available', 'available in india', 'delivery in', 'in stock', 'where is it available'],
    setup_bundle: ['wfh setup', 'home gym', 'apartment essentials', 'newborn checklist', 'pc build', 'trekking kit', 'setup under', 'bundle'],
    occasion: ['diwali', 'wedding', 'rakhi', 'raksha bandhan', 'anniversary', 'birthday', 'back to school', 'monsoon essentials', "valentine's", 'valentines', 'housewarming', 'christmas', 'new year'],
    travel_planning: ['itinerary', 'days in ', 'where to stay in', 'budget trip to', 'honeymoon in', 'trip to', 'travel to', 'vacation in'],
    how_to_choose: ['what to look for in', 'how to pick a', 'how to choose a', 'buying guide for', 'how to select a']
  };

  // Informational framing suppresses the intent gate entirely (forces
  // silence) regardless of how strong the category match is -- "how does
  // X work" is not a purchase, no matter how specific X is.
  const INFORMATIONAL_SUPPRESSORS = [
    'how does', 'how do ', 'history of', 'who invented', 'market size', 'company revenue',
    'news about', 'how to repair', 'review of my'
  ];

  function detectIntentSignals(userText) {
    const t = (userText || '').toLowerCase();
    const matched = [];
    for (const [name, phrases] of Object.entries(INTENT_SIGNALS)) {
      if (phrases.some((p) => t.includes(p))) matched.push(name);
    }
    const informational = INFORMATIONAL_SUPPRESSORS.some((p) => t.includes(p));
    return {
      signals: matched,
      dealSeeking: matched.includes('deal_seeking'),
      informationalSuppressed: informational
    };
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
  const BLOCKED = {
    health: {
      phrases: [
        'symptom', 'symptoms', 'diagnosed', 'diagnosis', 'chronic pain', 'blood pressure',
        'blood sugar', 'my doctor', 'my dr said', 'prescription', 'medication', 'side effects',
        'std ', 'sti ', 'biopsy', 'tumor', 'cancer', 'surgery', 'chemotherapy', 'disease',
        'infection', 'rash', 'std test', 'pregnant', 'pregnancy', 'fertility', 'period cramps',
        'std symptoms',
        // v1 expansion: health commerce (Section 4)
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
        // v1 expansion: therapy/mental-wellness commerce
        'therapy app', 'counseling service', 'mental wellness app', 'online therapy'
      ]
    },
    personal_finance: {
      phrases: [
        'my debt', 'credit card debt', 'pay off my loan', 'student loan', 'bankruptcy',
        'credit score', 'my mortgage', 'investing my savings', 'retirement savings',
        'life insurance policy', 'health insurance plan', 'file my taxes', 'irs audit',
        'payday loan', 'refinance my', 'my 401k', 'stock portfolio advice',
        // v1 expansion: finance products (Section 4) -- credit cards, loans,
        // BNPL, insurance of every kind, broking/demat, crypto, gold-as-
        // investment. Gold vocabulary deliberately narrow (rate/invest/
        // returns/bond/digital) so "gold earrings for wedding" is unaffected.
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
        // v1 expansion: adult products and dating services (Section 4)
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
    // v1 new blocked groups (Section 4) --------------------------------
    gambling: {
      phrases: [
        'real money gaming', 'rummy for cash', 'teen patti cash', 'betting app', 'casino app',
        'online casino', 'sports betting', 'lottery ticket', 'fantasy league cash',
        'win real money', 'play rummy win cash', 'best rummy app to win money'
      ]
    },
    alcohol_tobacco: {
      phrases: [
        // Deliberately specific (not bare "wine") so "wine fridge" stays
        // unblocked and fires home.large_appliances per the doc's edge ruling.
        'whiskey', 'vodka', 'tequila', 'rum under', 'best rum', 'liquor', 'alcohol delivery',
        // NOTE: deliberately no bare 'best wine' -- collides with "best
        // wine fridge" (an appliance, home.large_appliances), which the
        // doc's own edge ruling requires to stay unblocked.
        'buy wine', 'wine under', 'bottle of wine', 'cigarette', 'cigar',
        'tobacco', 'vape', 'vaping', 'e-cigarette', 'nicotine'
      ]
    },
    weapons: {
      phrases: [
        'firearm', 'handgun', 'rifle', 'pistol', 'ammunition', 'gun store', 'buy a gun',
        'self defense weapon', 'stun gun', 'taser'
        // pepper spray deliberately NOT blocked -- see doc edge ruling
        // ("gray zone, keep out for v1, revisit with counsel"). No category
        // matches it either, so it's silent by omission, not active block.
      ]
    },
    surveillance: {
      phrases: [
        'nanny cam', 'camera to watch my nanny', 'watch my nanny', 'spy on my', 'spy camera',
        'spy cam', 'hidden camera', 'track my partner', 'track my spouse', 'catch a cheating',
        'phone tracker app', 'phone tracker', 'keylogger', 'monitor my employee',
        'hidden camera to catch'
        // NOTE: does not block generic "home security camera" or "video
        // doorbell" -- those fire home.smart_home per the doc's explicit
        // ruling (consumer convenience framing stays allowed).
      ]
    },
    funeral_commerce: {
      phrases: [
        'funeral home', 'funeral services', 'cremation', 'casket', 'burial plot',
        'headstone', 'cemetery plot'
      ]
    }
  };

  window.ScribbleTaxonomy = { CATEGORIES, BLOCKED, INTENT_SIGNALS, INFORMATIONAL_SUPPRESSORS, detectIntentSignals, extractBudgetBand };
})();
