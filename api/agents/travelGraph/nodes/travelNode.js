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
  - Suggest a maximum of 3 total options. Only return options that are physically possible.
  
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

  // Handle both old structure (just options) and new structure (nearest_airport + options)
  const travelResult = travelData.options ? travelData : { options: travelData, nearest_airport: intent.destination };

  return { travel: travelResult, status: "travel_options_generated" };
};

module.exports = { travelNode };
