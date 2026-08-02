# Scribble Trigger Taxonomy v1: Every Shopping Intent Worth Firing On

**Purpose: the master list of intents that should light up the pill, the vocabulary that signals them, the ones that must stay silent, and the order to build them in. Written to translate directly into taxonomy.js patterns and offers.json coverage.**

---

## 1. How to read this

- Slugs follow `vertical.subcategory`. The classifier maps to the subcategory; the panel's display-name map humanizes it.
- Every category needs: positive patterns (nouns + purchase framing), negative patterns (words that flip it informational or blocked), and a budget scale (INR and USD are separate scales per the v0.3 parser).
- Tiering: **P0** = build now, demo-critical, catalog exists. **P1** = high affiliate density, build within weeks. **P2** = long tail, add as catalog grows.
- A trigger needs BOTH a category hit AND purchase intent (Section 2). Category words alone in an informational sentence stay silent.

## 2. Intent patterns: the axis that cuts across every category

Purchase-intent signals (any one of these + a category = fire):

- **Direct ask**: best X, top X, which X should I buy, recommend a X, X under [amount], X for [use case]
- **Comparison**: X vs Y, X or Y, is X better than Y, alternatives to X, X competitors
- **Deal-seeking** (highest value, fire eagerly): discount, coupon, promo code, sale, offer, deal, cheapest, lowest price, price drop, cashback, where is X cheapest
- **Recommendation by persona**: laptop for a design student, shoes for flat feet, phone for my dad, gift for a 10 year old
- **Replacement / upgrade**: my X broke, X died, upgrade from [model], switching from X, is it worth upgrading
- **Where-to-buy / availability**: where can I buy X, is X available in India, X delivery in [city], X in stock
- **Setup / bundle** (multi-category, pick the dominant one): WFH setup, home gym under 50k, new apartment essentials, newborn checklist, PC build under 80k, trekking kit
- **Occasion**: Diwali gifts, wedding shopping, rakhi, anniversary gift, birthday gift, back to school, monsoon essentials, winter wear, Valentine's, housewarming
- **Travel planning** (fires travel.*): itinerary for X, N days in X, where to stay in X, budget trip to X, honeymoon in X
- **How-to-choose**: what to look for in a mattress, how to pick a laptop, buying guide for X

Informational-only signals (suppress even with category words): how does X work, history of X, who invented X, essay/homework framing, X market size, X company revenue, news about X, how to repair X yourself (unless parts/tools are asked for), reviews of a thing the user already owns.

Confidence rule of thumb: explicit deal-seeking or "best X under [budget]" = high, fire. Category + persona or occasion = medium, fire. Category noun with no purchase framing = low, silent. When torn, silence; a missed deal costs nothing, a wrong panel costs trust.

## 3. The taxonomy

### footwear (P0)
- footwear.running, footwear.sneakers, footwear.sports (cricket spikes, football studs, basketball), footwear.formal, footwear.casual, footwear.sandals_flipflops, footwear.womens_heels_flats, footwear.kids, footwear.boots_trekking
- Vocabulary: shoes, sneakers, trainers, running shoes, spikes, studs, loafers, oxfords, heels, flats, sandals, chappals, crocs, trekking shoes
- India note: cricket and badminton footwear are their own demand pools.

### fashion (P0)
- fashion.mens, fashion.womens, fashion.ethnic_mens (kurta, sherwani, nehru jacket), fashion.ethnic_womens (saree, lehenga, salwar, kurti, dupatta), fashion.activewear, fashion.winterwear, fashion.innerwear, fashion.kids, fashion.accessories (belts, wallets, caps, scarves), fashion.bags_luggage_fashion (handbags, totes, backpacks-as-fashion), fashion.watches, fashion.jewelry_fashion (imitation, silver, fashion jewelry), fashion.eyewear (sunglasses, spectacles frames, lenses)
- Vocabulary: shirt, t-shirt, dress, jeans, trousers, hoodie, jacket, blazer, saree, kurta, lehenga, ethnic wear, office wear, gym wear, plus size, linen, designer, luxury, premium
- Edge ruling: fine jewelry as adornment (gold earrings for a wedding) fires fashion.jewelry_fine (P1); gold as investment (gold coins, digital gold, gold price) is FINANCE, silent. The tell is investment vocabulary: rate, invest, returns, sovereign bond.

### electronics (P0)
- electronics.phones, electronics.laptops, electronics.tablets, electronics.headphones_audio (TWS, earbuds, headphones, speakers, soundbars), electronics.tv, electronics.monitors, electronics.cameras (plus lenses, gimbals, action cams, drones), electronics.wearables (smartwatch, fitness band, smart ring), electronics.gaming_hardware (console, GPU, gaming laptop, controller), electronics.pc_components (CPU, GPU, RAM, SSD, motherboard, cabinet, PSU), electronics.peripherals (keyboard, mouse, webcam, mic), electronics.chargers_accessories (power bank, charger, cable, case, screen guard), electronics.printers_scanners, electronics.storage (hard disk, pen drive, NAS), electronics.networking (router, mesh, wifi extender)
- Vocabulary: specs language is a strong signal (RAM, mAh, refresh rate, ANC), "for video editing / gaming / students", model numbers, 5G, iPhone/Samsung/OnePlus etc.
- Edge ruling: "phone for my mom" fires; "is my phone hacked" is silent (security/personal).

### home (P0)
- home.mattresses, home.furniture (sofa, bed, dining, wardrobe, study table, office chair), home.large_appliances (AC, fridge, washing machine, geyser, water purifier, dishwasher, microwave, chimney), home.kitchen_appliances (mixer grinder, air fryer, induction, OTG, kettle, coffee machine), home.cookware_dining (kadai, pressure cooker, tawa, dinner set, bottles, tiffin), home.decor (curtains, rugs, wall art, plants, planters), home.bedding_bath (bedsheets, comforter, pillows, towels), home.lighting (lamps, smart bulbs, festive lights), home.smart_home (smart plug, camera-as-convenience, video doorbell, smart lock, Alexa/Google devices), home.storage_organization, home.cleaning_devices (vacuum, robot vacuum, mop), home.tools_diy (drill, toolkit, paint), home.gardening
- India note: AC + water purifier + geyser are seasonal spikes; festive lights around Diwali.
- Edge ruling: home security cameras fire as home.smart_home only with consumer convenience framing; anything about monitoring a person (partner, employee, nanny surveillance) is silent, surveillance is out of bounds.

### baby_kids (P0, already shipped in v0.3)
- baby.nursery (bassinet, cradle, crib, cot, stroller, pram, car seat, baby monitor, high chair), baby.care (diapers, wipes, baby food, formula-adjacent gear like bottles and sterilizers), baby.toys (also toys.* below), baby.kids_apparel, baby.school (school bag, lunch box, stationery for kids)
- Edge ruling: gear and commerce fire; anything about a child's health, development worries, or behavior is silent (minors + health).

### maternity (P0, shipped)
- maternity.apparel, maternity.gear (pregnancy pillow, nursing gear)
- Edge ruling: apparel and comfort gear fire; symptoms, medication, trimester medical questions are silent (health).

### beauty_grooming (P1)
- beauty.skincare, beauty.haircare, beauty.makeup, beauty.fragrance, beauty.mens_grooming (trimmer, razor, beard care), beauty.tools (dryer, straightener, curler), beauty.bath_body, beauty.nails
- Vocabulary: serum, sunscreen, SPF, moisturizer, shampoo, foundation, lipstick, perfume, EDT/EDP, trimmer
- Edge ruling: cosmetic and routine framing fires ("best sunscreen for oily skin"); clinical framing is silent (acne medication, treating a skin condition, dermatologist-prescribed, hair loss treatment). "Oily skin" is a cosmetic descriptor, fine; "cystic acne treatment" is health, silent.

### fitness_sports (P1)
- fitness.equipment (dumbbells, treadmill, bench, resistance bands, yoga mat), fitness.apparel_gear (covered by fashion.activewear but keep gym-bag/gloves here), fitness.nutrition (protein powder, creatine, electrolytes, protein bars), fitness.cycling (cycles, helmets, lights, accessories), fitness.yoga, sports.cricket (bat, ball, pads, gloves, kit), sports.badminton_tennis (racquets, shuttles, strings), sports.football_basketball, sports.swimming, sports.outdoor_camping (tent, sleeping bag, trekking pole, rucksack), sports.running_gear (watches overlap wearables, hydration, belts)
- Edge ruling on nutrition, important: mainstream fitness supplements with fitness framing fire (whey for muscle gain, electrolytes for a marathon). ANY health-condition framing goes silent: supplements for anxiety, sleep, deficiency, diabetes, weight-loss drugs, or dosage questions. Weight management framed as fitness (home gym, protein) fires; framed as body distress or medical weight loss, silent.

### travel (P0)
- travel.hotels, travel.flights, travel.packages (honeymoon, family package, Europe tour), travel.trains_buses (India: IRCTC-adjacent, RedBus), travel.car_rental_cabs, travel.luggage (suitcase, cabin bag, duffel), travel.gear (travel pillow, adapters, organizers), travel.visa_services (P2, document-assistance commerce only), travel.experiences (tours, activities, theme parks, safaris)
- Trigger note: destination + planning language fires even without the word hotel ("7 days in Bali under 80k" = travel.hotels + travel.flights).
- Edge ruling: travel insurance is insurance, silent (finance rule). Immigration/visa-status questions are silent (immigration is blocked); paid visa-filing services for tourism sit in a gray zone, keep P2 and conservative.

### food_grocery (P1)
- food.delivery (restaurant delivery intents: best biryani near me, late night delivery), food.groceries_quickcommerce (monthly grocery, instant delivery), food.coffee_tea (beans, machines overlap kitchen), food.snacks_gourmet (dry fruits, chocolates, gift hampers overlap gifting), food.meal_plans (subscription tiffin, meal kits), food.dining_out (restaurant reservations, buffet deals)
- Edge ruling: nutrition-for-a-condition is silent (diet for diabetes). General "healthy snacks" with shopping framing fires; disordered-eating adjacent framing (extreme restriction, punishing language) is silent, hard stop.

### software_subscriptions (P0, the taxonomy already has vpn/crm; expand)
- software.vpn, software.productivity_saas (CRM, project tools, note apps), software.design_creative (design suites, video editors, stock assets), software.cloud_storage, software.security_antivirus, software.hosting_domains, software.ai_tools (writing, image, coding assistants), software.streaming_ott (Netflix-type, India: Hotstar/JioCinema-type), software.music_streaming, software.gaming_subs (Game Pass-type), software.courses_edtech (coding bootcamp, upskilling, language learning, test prep commerce), software.developer_tools
- India note: edtech and OTT annual plans are high-volume affiliate.
- Edge ruling: test-prep and course commerce fires; a student asking for homework answers is not a shopping intent, silent.

### gaming (P1)
- gaming.consoles, gaming.titles (game purchases, preorders), gaming.accessories (headsets, chairs, capture cards), gaming.pc (overlaps electronics.gaming_hardware, keep one canonical: electronics wins for hardware, gaming.titles for software)
- Edge ruling: in-game currency and loot boxes: allowed as commerce but P2 and never for minors-coded conversations; real-money gaming and betting are excluded entirely (Section 4).

### auto (P1)
- auto.two_wheeler_gear (helmet, riding gloves, jackets; India-critical), auto.car_accessories (dashcam, seat covers, air purifier, infotainment), auto.tyres_batteries, auto.care (wash, polish, microfiber), auto.ev_accessories (chargers), auto.cycles (overlap fitness.cycling, canonical: fitness)
- Edge ruling: "which car should I buy" is research with real intent but no affiliate inventory; keep P2, fire only if catalog gains test-drive or insurance-free lead partners. Vehicle insurance is insurance, silent.

### pets (P1)
- pets.food, pets.accessories (leash, bed, litter, aquarium), pets.grooming, pets.toys
- Edge ruling: pet illness and vet questions are silent (compassion + adjacent to distress); food and gear fire.

### books_media_stationery (P2)
- books.print_ebooks, books.audiobooks, stationery.office_art (pens, notebooks, art supplies), music.instruments (guitar, keyboard, ukulele, accessories)

### gifts_occasions (P0 for India revenue density)
- gifting.general (gift for X persona), gifting.flowers_cakes (same-day delivery, FNP-style), gifting.festive (Diwali hampers, rakhi, corporate gifting), gifting.personalized (photo frames, custom mugs), occasions.wedding (wedding shopping, trousseau, guest outfits, return gifts; overlaps fashion.ethnic, canonical: wedding when the occasion word is present), occasions.party (decorations, balloons, birthday supplies)
- Edge ruling: religious festival gifting fires as gifting.festive on the gifting frame (hamper, gift, lights); queries about religion itself stay silent per the blocked list. "Diwali gift for my team" fires; theological questions do not.

### services_local (P1, India)
- services.home (deep cleaning, pest control, AC service, plumbing, painting; Urban Company-style), services.salon_at_home, services.appliance_repair, services.movers_packers, services.laundry
- Edge ruling: home services fire on booking intent; legal, medical, financial, or counseling services are silent per blocked categories.

### telecom_utilities (P2)
- telecom.mobile_plans (recharge, prepaid, postpaid, port), telecom.broadband, telecom.dth_ott_bundles
- High-frequency, low-margin; build once catalog has operator or aggregator partners.

### events_entertainment (P1)
- events.movies (tickets), events.concerts_standup, events.sports_tickets (match tickets: IPL-style demand), events.theme_parks
- Edge ruling: ticket commerce fires; sports betting and fantasy leagues do not (Section 4).

### office_wfh (P1)
- office.chairs_desks (ergonomic chair, standing desk), office.setup (monitor arms, docks, lighting for calls), office.supplies
- Overlaps home.furniture and electronics.peripherals; canonical rule: "office/WFH/ergonomic" wording lands here, else the parent vertical.

### refurbished_resale (P2)
- resale.refurb_electronics (renewed phones, open-box laptops), resale.exchange_offers ("exchange my old phone")
- Real deal-density in India; needs partner inventory before enabling.

## 4. Never fires, and why (restating product law with the commerce lens)

These stay silent even with explicit purchase language, because the blocked-category check runs first and short-circuits:

- **Health commerce**: medicines, supplements-for-conditions, medical devices (BP monitor, glucometer, thermometer, CPAP), weight-loss drugs, fertility kits, mental-wellness apps, therapy marketplaces. Yes, glucometers are a big affiliate category; no, we do not want a coupon appearing under someone's diabetes conversation. The trust cost dwarfs the commission.
- **Personal finance products**: credit cards, loans, insurance (health, life, motor, travel), broking and demat, crypto, gold-as-investment, BNPL. This is the single biggest deliberate revenue sacrifice in this document; classic affiliate networks live on cards and loans. Scribble's ambient surface must not profile financial stress. The bank-funded card-linked offers idea lives in a separate, explicitly consented surface someday, never in ambient triggering.
- **Gambling and real-money gaming**: betting, casinos, fantasy sports paid leagues, lottery, teen patti/rummy-for-cash. Regulated, harm-adjacent, and India-legal-gray. Excluded regardless of margin.
- **Alcohol, tobacco, vapes**: age-gated and India-regulated. Excluded.
- **Adult products and dating services**: sexuality is a blocked category; both stay out.
- **Weapons and self-defense-lethal**: knives-as-weapons, airguns, pepper spray is a gray edge, keep out for v1.
- **Surveillance of people**: spy cams, phone trackers, keyloggers, "catch a cheating partner" tools. Never, under any framing.
- **Funeral and grief commerce**: technically shops, absolutely silent (grief is blocked).
- **Anything where the subject is a minor's body, behavior, or health**, even when phrased as shopping.
- **Legal, immigration, medical, counseling services**, even booked like any other service.
- **Real estate**: not blocked for trust reasons, just structurally wrong for an offers panel (no inventory, huge decision). Skip.

The general rule when a new category shows up: if the panel appearing would feel like being watched rather than helped, it does not fire. Revenue never overrides that test.

## 5. Hard edge rulings (the calls Amruth will otherwise have to make at 2am)

| Query shape | Ruling |
|---|---|
| "best sunscreen for oily skin" | fires beauty.skincare (cosmetic framing) |
| "treatment for cystic acne" | silent (health) |
| "whey protein for marathon training" | fires fitness.nutrition |
| "supplements for anxiety / sleep / hair loss" | silent (health) |
| "gold earrings for wedding" | fires fashion.jewelry_fine |
| "should I buy gold this Diwali" (investment frame) | silent (finance) |
| "best travel insurance for Europe" | silent (insurance) |
| "7 days in Vietnam under 60k" | fires travel.hotels + flights |
| "glucometer under 2000" | silent (medical device) |
| "air purifier for Delhi winter" | fires home.large_appliances (comfort appliance, not medical) |
| "BP monitor for my father" | silent (medical device) |
| "camera to watch my nanny" | silent (surveillance of a person) |
| "video doorbell" | fires home.smart_home |
| "best rummy app to win money" | silent (real-money gaming) |
| "PS5 games on sale" | fires gaming.titles |
| "school bag for my daughter" | fires baby.school (commerce about gear, fine) |
| "my daughter is being bullied, gift to cheer her up" | silent (minor + distress context wins over gift frame) |
| "wine fridge" | fires home.kitchen_appliances (appliance, not alcohol itself); "best whiskey under 3000" silent |
| "pepper spray for safety" | silent for v1 (safety-product gray zone; revisit with counsel) |
| "dumbbells under 5000" | fires fitness.equipment |
| "how to lose 10kg fast" | silent (weight-distress framing, no product ask) |
| "home gym setup under 50k" | fires fitness.equipment (bundle intent) |

## 6. Rollout priority

- **P0 (now, catalog already partially exists)**: footwear.*, fashion core (mens/womens/ethnic/accessories/watches/eyewear), electronics core (phones, laptops, audio, TV, wearables, peripherals), home core (mattresses, large appliances, kitchen appliances, furniture), baby.*, maternity.*, travel (hotels, flights, luggage), software (vpn, saas, ott, edtech), gifting.* including wedding
- **P1 (next, high density)**: beauty.*, fitness_sports.*, food.*, gaming.*, auto accessories, pets.*, services_local.*, events.*, office_wfh.*
- **P2 (as catalog and partners land)**: books/media/stationery, telecom, refurbished/resale, travel.visa_services, in-game currency, big-ticket auto research
- Sequencing logic: P0 maximizes demo credibility across the queries people actually type into AI chat (electronics + travel + fashion dominate), P1 follows affiliate commission density, P2 needs partnerships before patterns.

## 7. Implementation notes for taxonomy.js

- Roughly 150 subcategory slugs above. Do not ship 150 pattern sets on day one; ship P0 (~60 slugs) with tight patterns and let the near-miss log (already in v0.3) tell you which P1 categories real usage is knocking on.
- Every category defines: `patterns` (full-weight), `secondary` (half-weight: brand names, spec words, persona words), `negative` (flips to silent: the health/finance/etc. tells from Section 5), `budget_scales` (inr, usd, or both), `display_name`.
- The blocked-category check stays a separate pass that runs FIRST and short-circuits; Section 4 items are blocked-list entries, not categories with zero offers. Structurally impossible beats configured-off.
- Multi-category hits (WFH setup): return the highest-scoring category, log the runners-up; the panel shows one category's offers, never a mixed grab bag.
- Occasion words (Diwali, wedding, rakhi, birthday) act as intent amplifiers for whatever category they co-occur with, and default to gifting.* when no product noun is present.
- Keep the taxonomy in one file with slugs as keys; the near-miss telemetry plus this document is the roadmap for every future addition.
