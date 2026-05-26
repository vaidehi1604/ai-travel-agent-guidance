const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Itinerary Agent: Generates the final day-wise plan
 */
const itineraryNode = async (state) => {
  console.log("--- ITINERARY AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, weather, areas, travel, budget, hotels, activities } = state;

  const systemPrompt = `You are a Professional Travel Guide.
  Create a detailed day-wise itinerary for a ${intent.days}-day trip to ${intent.destination}.
  
  Constraints & Context:
  - User Preferences: ${intent.preferences}
  - Weather: ${JSON.stringify(weather)}
  - Best Areas: ${JSON.stringify(areas)}
  - Travel Options: ${JSON.stringify(travel)}
  - Budget Breakdown: ${JSON.stringify(budget)}
  - Recommended Hotels: ${JSON.stringify(hotels)}
  - Real-World Activities (Use these to ground your plan): ${JSON.stringify(activities)}

  For each day, provide exactly these keys in the JSON object:
  - "morning": string
  - "afternoon": string
  - "evening": string
  - "restaurants": array of strings
  - "tips": string (Weather-aware tips based on the provided weather forecast, e.g., "Carry an umbrella as rain is expected in the afternoon")

  Return ONLY a valid JSON object in the following format:
  [
    {
      "title": "Day 1",
      "morning": "...",
      "afternoon": "...",
      "evening": "...",
      "restaurants": ["...", "..."],
      "tips": "..."
    }
  ]`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Destination: ${intent.destination}, Days: ${intent.days}`)
  ]);

  const itinerary = safeJsonParse(response.content);
  if (!itinerary) {
    console.error("Failed to parse itinerary:", response.content);
    return { error: "Failed to generate itinerary from LLM response", status: "error" };
  }

  return { itinerary, status: "itinerary_generated" };
};

module.exports = { itineraryNode };
