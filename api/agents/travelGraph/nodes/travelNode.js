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
  Suggest travel options from ${intent.source} to ${intent.destination}.
  
  Important: If ${intent.destination} does NOT have a commercial airport, identify the nearest major city with an airport (e.g., if destination is Ujjain, the nearest airport is Indore).
  
  Consider:
  - Budget: ${intent.budget}
  - Convenience and Time
  
  Provide:
  - nearest_airport: Name of the city with the nearest commercial airport (if destination has one, use destination name).
  - options: Array of travel options (Flights, Trains, Bus/Car).
  
  For each option include:
  - mode: Travel mode
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
    console.error("Failed to parse travel options:", response.content);
    return { error: "Failed to generate travel options from LLM response", status: "error" };
  }

  // Handle both old structure (just options) and new structure (nearest_airport + options)
  const travelResult = travelData.options ? travelData : { options: travelData, nearest_airport: intent.destination };

  return { travel: travelResult, status: "travel_options_generated" };
};

module.exports = { travelNode };
