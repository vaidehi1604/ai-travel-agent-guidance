const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');
const axios = require('axios');

/**
 * Minimum realistic per-person one-way price floors (INR).
 * Any LLM-generated price below these is clamped up.
 */
const PRICE_FLOORS = {
  flight: 1500,   // Cheapest realistic domestic one-way
  train: 200,     // Sleeper class short-distance
  'bus/car': 150, // Short-distance state transport
  bus: 150,
  car: 150,
};

const isInternationalDestination = (destName) => {
  const destLower = (destName || '').toLowerCase().trim();
  const internationalKeywords = [
    'bali', 'dubai', 'singapore', 'maldives', 'thailand', 'bangkok', 'phuket',
    'paris', 'london', 'tokyo', 'switzerland', 'malaysia', 'indonesia', 'vietnam',
    'europe', 'usa', 'america', 'new york', 'sri lanka', 'egypt', 'dublin', 'rome',
    'italy', 'france', 'spain', 'germany', 'australia', 'sydney', 'melbourne',
    'canada', 'toronto', 'vancouver', 'turkey', 'istanbul', 'greece', 'athens',
    'mauritius', 'seychelles', 'baku', 'azerbaijan', 'georgia', 'tbilisi', 'uae',
    'united arab emirates', 'russia', 'moscow', 'uk', 'united kingdom', 'japan',
    'hawaii', 'philippines', 'manila', 'hong kong', 'macau', 'china', 'beijing',
    'shanghai', 'korea', 'seoul'
  ];
  return internationalKeywords.some(keyword => destLower.includes(keyword));
};

/**
 * Travel Agent: Generates travel suggestions using web-verified infrastructure
 * availability AND real-time pricing.
 *
 * STEP 1 — Verify transport infrastructure via Tavily (airport? railway station? bus route?)
 * STEP 2 — Fetch real-time pricing only for AVAILABLE modes
 * STEP 3 — LLM generates options constrained to available modes
 * STEP 4 — Post-process: strip unavailable modes, enforce price floors, de-duplicate
 */
const travelNode = async (state) => {
  console.log("--- TRAVEL AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent } = state;
  const apiKey = process.env.TAVILY_API_KEY;
  const isIntl = isInternationalDestination(intent.destination);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Verify transport infrastructure via Tavily
  // ═══════════════════════════════════════════════════════════════════════════
  let availability = { flight: true, train: true, bus: true };
  let nearestAirport = intent.destination;
  let nearestRailway = intent.destination;
  let infrastructureContext = "";

  if (isIntl) {
    // International: only flights, skip verification for train/bus
    availability = { flight: true, train: false, bus: false };
    console.log(`✈️ International destination detected (${intent.destination}). Restricting to Flight only.`);
  }

  if (apiKey) {
    try {
      console.log(`🔍 [TravelNode] Verifying transport infrastructure for: ${intent.destination}`);

      // Build verification queries
      const verifyQueries = [];

      // Always check airport
      verifyQueries.push(
        axios.post('https://api.tavily.com/search', {
          api_key: apiKey,
          query: `nearest airport to ${intent.destination} commercial flights available`,
          search_depth: "basic",
          max_results: 3,
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
          .catch(() => ({ data: { results: [] } }))
      );

      // Check train only for domestic
      if (!isIntl) {
        verifyQueries.push(
          axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: `railway station in ${intent.destination} train from ${intent.source} to ${intent.destination}`,
            search_depth: "basic",
            max_results: 3,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            .catch(() => ({ data: { results: [] } }))
        );
      }

      // Check bus only for domestic
      if (!isIntl) {
        verifyQueries.push(
          axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: `bus service from ${intent.source} to ${intent.destination} GSRTC RedBus state transport`,
            search_depth: "basic",
            max_results: 3,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            .catch(() => ({ data: { results: [] } }))
        );
      }

      const verifyResults = await Promise.all(verifyQueries);

      const fmt = (results) => (results || []).map(r => `${r.title}: ${r.content}`).join('\n');

      // Parse airport verification
      const airportText = fmt(verifyResults[0]?.data?.results);
      infrastructureContext += `[Airport Verification for ${intent.destination}]\n${airportText}\n\n`;

      // Parse train verification (domestic only)
      if (!isIntl && verifyResults[1]) {
        const trainText = fmt(verifyResults[1]?.data?.results);
        infrastructureContext += `[Railway Station Verification for ${intent.destination}]\n${trainText}\n\n`;

        // Check if train results indicate no connectivity
        const trainLower = trainText.toLowerCase();
        const noTrainIndicators = ['no railway', 'no train', 'no direct train', 'does not have a railway',
          'no rail', 'nearest railway', 'nearest station', 'closest railway', 'closest station',
          'no railway station'];
        const hasTrainStation = !noTrainIndicators.some(ind => trainLower.includes(ind)) && trainText.length > 30;

        if (!hasTrainStation && trainText.length < 50) {
          // Very sparse results — likely no train connectivity
          availability.train = false;
          console.log(`🚫 [TravelNode] No railway connectivity found for ${intent.destination}`);
        }
      }

      // Parse bus verification (domestic only)
      if (!isIntl && verifyResults[isIntl ? 1 : 2]) {
        const busIdx = isIntl ? 1 : 2;
        const busText = fmt(verifyResults[busIdx]?.data?.results);
        infrastructureContext += `[Bus Service Verification for ${intent.source} → ${intent.destination}]\n${busText}\n\n`;

        // Check if bus results indicate connectivity
        const busLower = busText.toLowerCase();
        const noBusIndicators = ['no bus', 'no direct bus', 'no bus service', 'not connected by road'];
        const hasBusService = !noBusIndicators.some(ind => busLower.includes(ind)) && busText.length > 30;

        if (!hasBusService && busText.length < 50) {
          availability.bus = false;
          console.log(`🚫 [TravelNode] No bus connectivity found for ${intent.source} → ${intent.destination}`);
        }
      }

      console.log(`✅ [TravelNode] Infrastructure verification complete. Available: Flight=${availability.flight}, Train=${availability.train}, Bus=${availability.bus}`);
    } catch (e) {
      console.warn("⚠️ [TravelNode] Infrastructure verification failed. Proceeding with all modes.", e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Fetch real-time pricing ONLY for available modes
  // ═══════════════════════════════════════════════════════════════════════════
  let pricingContext = "";

  if (apiKey) {
    try {
      const pricingQueries = [];
      const pricingLabels = [];

      if (availability.flight) {
        pricingQueries.push(
          axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: `round trip economy flight ticket price from ${intent.source} to ${intent.destination} INR 2026`,
            search_depth: "basic",
            max_results: 3,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            .catch(() => ({ data: { results: [] } }))
        );
        pricingLabels.push('Flight');
      }

      if (availability.train) {
        pricingQueries.push(
          axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: `train ticket fare from ${intent.source} to ${intent.destination} sleeper AC class INR 2026`,
            search_depth: "basic",
            max_results: 3,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            .catch(() => ({ data: { results: [] } }))
        );
        pricingLabels.push('Train');
      }

      if (availability.bus) {
        pricingQueries.push(
          axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: `bus fare from ${intent.source} to ${intent.destination} Volvo AC bus INR 2026`,
            search_depth: "basic",
            max_results: 3,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            .catch(() => ({ data: { results: [] } }))
        );
        pricingLabels.push('Bus/Car');
      }

      if (pricingQueries.length > 0) {
        console.log(`🔍 [TravelNode] Querying Tavily for real-time pricing: ${pricingLabels.join(', ')}`);
        const pricingResults = await Promise.all(pricingQueries);
        const fmt = (results) => (results || []).map(r => `${r.title}: ${r.content}`).join('\n');

        pricingResults.forEach((res, idx) => {
          pricingContext += `[Real-Time ${pricingLabels[idx]} Prices: ${intent.source} → ${intent.destination}]\n` +
            fmt(res.data?.results) + '\n\n';
        });

        console.log(`✅ [TravelNode] Fetched real-time pricing for ${pricingLabels.join(', ')}.`);
      }
    } catch (e) {
      console.warn("⚠️ [TravelNode] Pricing search failed. Falling back to LLM knowledge.", e.message);
    }
  } else {
    console.warn("⚠️ [TravelNode] TAVILY_API_KEY not set. Using LLM knowledge only.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Build LLM prompt with verified availability + pricing
  // ═══════════════════════════════════════════════════════════════════════════

  // Build availability instruction block
  const availabilityInstructions = [];
  if (!availability.flight) {
    availabilityInstructions.push(`- FLIGHTS: NOT AVAILABLE for ${intent.destination}. Do NOT include any Flight option.`);
  }
  if (!availability.train) {
    availabilityInstructions.push(`- TRAINS: NOT AVAILABLE for ${intent.destination}. There is no railway station or direct train connectivity. Do NOT include any Train option.`);
  }
  if (!availability.bus) {
    availabilityInstructions.push(`- BUS/CAR: NOT AVAILABLE or impractical for ${intent.source} to ${intent.destination}. Do NOT include any Bus/Car option.`);
  }

  const availableModesStr = [
    availability.flight ? 'Flight' : null,
    availability.train ? 'Train' : null,
    availability.bus ? 'Bus/Car' : null,
  ].filter(Boolean).join(', ');

  const systemPrompt = `You are a Travel Logistics Expert with access to real-time pricing data and verified transport infrastructure information.
  Evaluate and suggest valid travel options from ${intent.source} to ${intent.destination}.

  ══════ WEB-VERIFIED TRANSPORT AVAILABILITY ══════
  The following transport modes have been VERIFIED via web search:
  Available modes: ${availableModesStr || 'NONE CONFIRMED'}
  ${availabilityInstructions.length > 0 ? '\nRESTRICTIONS:\n' + availabilityInstructions.join('\n') : ''}

  INFRASTRUCTURE VERIFICATION DATA (from web search):
  ${infrastructureContext || "No infrastructure data available."}

  ══════ RULES ══════
  CRITICAL FEASIBILITY RULES:
  - You MUST ONLY suggest transport modes that are listed as "Available" above.
  - Do NOT suggest any mode that is listed as "NOT AVAILABLE" above, even if you believe it might exist.
  - If the destination is overseas or separated by sea, return ONLY Flight options.
  - Suggest at most ONE option per mode. Maximum 3 total options.
  - Never return multiple options of the same mode.

  Important: If ${intent.destination} does NOT have a commercial airport, identify the nearest major city with an airport and use that in the nearest_airport field.

  ══════ REAL-TIME PRICING DATA ══════
  ${pricingContext || "No real-time pricing data available — use your best knowledge but be conservative."}

  CRITICAL PRICING RULES:
  1. You MUST base your "estimated_cost" values on the real-time web pricing data above. Do NOT invent prices.
  2. If the web data shows flights cost ₹8,000–₹12,000, your estimated_cost for flights MUST be in that range.
  3. estimated_cost MUST be a NUMBER (not a string) representing the per-person one-way fare in INR.
  4. MINIMUM PRICE FLOORS: Flight ≥ 1500, Train ≥ 200, Bus/Car ≥ 150. Never return a price below these floors.
  5. If no web pricing data is available for a mode, provide a conservative estimate — DO NOT make up unrealistically low prices.

  Consider:
  - Budget: ${intent.budget}
  - Convenience and Time

  Provide:
  - nearest_airport: Name of the nearest commercial airport city (if destination has one, use destination name; if not, use the nearest city with an airport).
  - nearest_railway: Name of the nearest railway station or city with a major railway station.
  - options: Array of travel options (ONLY for available modes listed above).

  For each option include:
  - mode: Travel mode (must be exactly one of: "Flight", "Train", "Bus/Car")
  - estimated_cost: Approx cost per person one-way (NUMBER in INR, based on web pricing data)
  - estimated_travel_time: Approx duration
  - pros: Array of pros
  - cons: Array of cons
  - recommended: true if this is the most recommended mode, false otherwise (only one option can have recommended true)

  CRITICAL: Return ONLY a valid JSON object matching the schema. Do NOT include any introductory, conversational, or concluding text. You must output nothing else except the raw JSON structure.`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Source: ${intent.source}, Destination: ${intent.destination}, Budget: ${intent.budget}`)
  ]);

  const travelData = safeJsonParse(response.content);
  if (!travelData) {
    console.warn("Failed to parse travel options, using fallback:", response.content?.slice(0, 200));
    return { travel: { nearest_airport: intent.destination, options: [], availability }, status: "travel_fallback" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Post-process: strip unavailable modes, enforce price floors, de-dup
  // ═══════════════════════════════════════════════════════════════════════════
  if (travelData && Array.isArray(travelData.options)) {
    // 4a. Strip options for modes that were marked unavailable
    if (isIntl) {
      travelData.options = travelData.options.filter(opt =>
        (opt.mode || '').toLowerCase().includes('flight')
      );
      if (travelData.options.length > 0) {
        travelData.options[0].recommended = true;
      }
    } else {
      travelData.options = travelData.options.filter(opt => {
        const modeLower = (opt.mode || '').toLowerCase().trim();
        if (modeLower.includes('flight') && !availability.flight) {
          console.log(`🚫 [TravelNode] Stripping unavailable Flight option`);
          return false;
        }
        if (modeLower.includes('train') && !availability.train) {
          console.log(`🚫 [TravelNode] Stripping unavailable Train option`);
          return false;
        }
        if ((modeLower.includes('bus') || modeLower.includes('car')) && !availability.bus) {
          console.log(`🚫 [TravelNode] Stripping unavailable Bus/Car option`);
          return false;
        }
        return true;
      });
    }

    // 4b. Enforce price floors
    travelData.options.forEach(opt => {
      const modeLower = (opt.mode || '').toLowerCase().trim();
      const floor = PRICE_FLOORS[modeLower] || PRICE_FLOORS['bus/car'] || 150;

      let cost = opt.estimated_cost;
      if (typeof cost === 'string') {
        cost = parseInt(cost.replace(/[^0-9]/g, ''), 10);
      }
      if (typeof cost === 'number' && !isNaN(cost) && cost < floor) {
        console.log(`💰 [TravelNode] Price floor enforced for ${opt.mode}: ₹${cost} → ₹${floor}`);
        opt.estimated_cost = floor;
      }
    });

    // 4c. De-duplicate modes
    const unique = [];
    const seen = new Set();
    const sorted = [...travelData.options].sort((a, b) => (b.recommended || false) - (a.recommended || false));
    for (const opt of sorted) {
      const modeKey = (opt.mode || '').toLowerCase().trim();
      if (modeKey && !seen.has(modeKey)) {
        seen.add(modeKey);
        unique.push(opt);
      }
    }

    // 4d. Re-sort: Flight → Train → Bus/Car
    const modeOrder = { 'flight': 1, 'train': 2, 'bus/car': 3, 'bus': 3, 'car': 3 };
    unique.sort((a, b) => (modeOrder[(a.mode || '').toLowerCase().trim()] || 99) - (modeOrder[(b.mode || '').toLowerCase().trim()] || 99));
    travelData.options = unique;

    // 4e. Ensure at least one option is recommended
    if (travelData.options.length > 0 && !travelData.options.some(o => o.recommended)) {
      travelData.options[0].recommended = true;
    }
  }

  // Build the travel result with availability metadata
  const travelResult = travelData.options
    ? { ...travelData, availability }
    : { options: travelData, nearest_airport: intent.destination, availability };

  // Apply overrides for locations with known far/suboptimal airport resolution (e.g. Silvassa -> Surat Airport / Vapi station)
  const destLower = (intent.destination || '').toLowerCase().trim();
  if (destLower.includes('silvassa')) {
    travelResult.nearest_airport = 'Surat';
    travelResult.nearest_railway = 'Vapi';
    console.log(`✈️ [TravelNode] Applied routing overrides for Silvassa. Airport: Surat, Railway: Vapi`);
  }

  console.log(`✅ [TravelNode] Final travel options: ${(travelResult.options || []).map(o => o.mode).join(', ') || 'none'}`);

  return { travel: travelResult, status: "travel_options_generated" };
};

module.exports = { travelNode };
