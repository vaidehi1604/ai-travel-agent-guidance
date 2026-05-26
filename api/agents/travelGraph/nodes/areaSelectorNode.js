const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Area Selector Agent: Analyzes weather and suggests best areas
 */
const areaSelectorNode = async (state) => {
  console.log("--- AREA SELECTOR AGENT ---");
  if (state.error || !state.intent) return state;

  const { weather, intent } = state;

  if (weather && weather.error) {
    return { areas: { error: "Cannot select areas due to weather fetch failure" }, status: "area_selection_failed" };
  }

  const systemPrompt = `You are a Geography and Weather Expert.
  Based on the weather forecast for ${intent.destination}, suggest 3-4 specific areas or neighborhoods to stay in.
  - Identify areas with the best weather.
  - Warn about areas that might be rainy or have bad weather.
  - Recommend the absolute best area based on user preferences: ${intent.preferences}.

  Return ONLY a valid JSON object with:
  {
    "best_areas": ["Area 1", "Area 2"],
    "rainy_areas": ["Area 3"],
    "recommendation": "Why this area is best for the user"
  }`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Weather Forecast: ${JSON.stringify(weather)}`)
  ]);

  const areas = safeJsonParse(response.content);
  if (!areas) {
    console.error("Failed to parse areas:", response.content);
    return { error: "Failed to select areas from LLM response", status: "error" };
  }

  return { areas, status: "areas_selected" };
};

module.exports = { areaSelectorNode };
