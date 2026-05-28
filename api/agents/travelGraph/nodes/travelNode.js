const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Travel Agent: Generates travel suggestions
 */
const travelNode = async (state) => {
  console.log("--- TRAVEL AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent } = state;

  const systemPrompt = `You are a Travel Logistics Expert.
  Evaluate and suggest valid travel options from ${intent.source} to ${intent.destination}.
  
  FEASIBILITY CHECK:
  - Before recommending any travel option, verify if that mode of transport (Flight, Train, or Bus/Car) is actually physically possible and feasible for the journey.
  - If the destination is overseas or separated by sea from the source (e.g., travelling from India to Dubai, Bali, Singapore, Maldives, Europe, etc.), or if there is no rail/road connectivity, you MUST exclude "Train" and "Bus/Car" completely and return ONLY "Flight" options.
  - Suggest a maximum of 3 total options (at most ONE option per mode: Flight, Train, Bus/Car). Only return options that are physically possible.
  - Never return multiple options of the same mode (for example, do not return three different Flight options; return only the single most recommended flight option).
  
  Important: If ${intent.destination} does NOT have a commercial airport, identify the nearest major city with an airport (e.g., if destination is Ujjain, the nearest airport is Indore).
  
  Consider:
  - Budget: ${intent.budget}
  - Convenience and Time
  
  Provide:
  - nearest_airport: Name of the city with the nearest commercial airport (if destination has one, use destination name).
  - options: Array of travel options.
  
  For each option include:
  - mode: Travel mode (must be exactly one of: "Flight", "Train", "Bus/Car")
  - estimated_cost: Approx cost
  - estimated_travel_time: Approx duration
  - pros: Array of pros
  - cons: Array of cons
  - recommended: true if this is the most recommended mode, false otherwise (only one option in the entire list can have recommended true)

  CRITICAL: Return ONLY a valid JSON object matching the schema. Do NOT include any introductory, conversational, or concluding text (e.g., do NOT start with "Based on the...", and do NOT include any trailing notes or explanations). You must output nothing else except the raw JSON structure.`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Source: ${intent.source}, Destination: ${intent.destination}, Budget: ${intent.budget}`)
  ]);

  const travelData = safeJsonParse(response.content);
  if (!travelData) {
    console.warn("Failed to parse travel options, using fallback:", response.content?.slice(0, 200));
    return { travel: { nearest_airport: intent.destination, options: [] }, status: "travel_fallback" };
  }

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

  // Enforce flight-only for international destinations and de-duplicate
  if (travelData && Array.isArray(travelData.options)) {
    if (isInternationalDestination(intent.destination)) {
      console.log(`✈️ International destination detected (${intent.destination}). Restricting travel options to Flight only.`);
      travelData.options = travelData.options.filter(opt => 
        (opt.mode || '').toLowerCase().includes('flight')
      );
      if (travelData.options.length > 0) {
        travelData.options[0].recommended = true;
      }
    }

    const unique = [];
    const seen = new Set();
    // Sort recommended first
    const sorted = [...travelData.options].sort((a, b) => (b.recommended || false) - (a.recommended || false));
    for (const opt of sorted) {
      const modeKey = (opt.mode || '').toLowerCase().trim();
      if (modeKey && !seen.has(modeKey)) {
        seen.add(modeKey);
        unique.push(opt);
      }
    }
    // Re-sort to Flight -> Train -> Bus/Car
    const modeOrder = { 'flight': 1, 'train': 2, 'bus/car': 3, 'bus': 3, 'car': 3 };
    unique.sort((a, b) => (modeOrder[(a.mode || '').toLowerCase().trim()] || 99) - (modeOrder[(b.mode || '').toLowerCase().trim()] || 99));
    travelData.options = unique;
  }

  // Handle both old structure (just options) and new structure (nearest_airport + options)
  const travelResult = travelData.options ? travelData : { options: travelData, nearest_airport: intent.destination };

  return { travel: travelResult, status: "travel_options_generated" };
};

module.exports = { travelNode };
