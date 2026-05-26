const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Budget Agent: Generates a detailed, structured day-wise budget breakdown
 * matching the user's exact required JSON schema with realistic INR pricing.
 */
const budgetNode = async (state) => {
  console.log("--- BUDGET AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, travel } = state;

  // Enforce a minimum of 3 days if days are not specified, invalid, or less than 3
  let days = parseInt(intent.days);
  if (isNaN(days) || days < 3) {
    days = 3;
    intent.days = 3; // Update state object as well
  }

  const systemPrompt = `You are an expert Financial Travel Planner specializing in Indian travel budgets (INR).

Generate a detailed, structured travel budget for a ${days}-day trip from ${intent.source || 'the source city'} to ${intent.destination}.
Overall budget context: ${intent.budget}.
Travel options already analyzed: ${JSON.stringify(travel?.options || [])}.

Return ONLY a valid JSON object matching EXACTLY this structure — no markdown, no conversational text, no backticks:

{
  "overview": {
    "destination": "${intent.destination}",
    "source": "${intent.source || 'Unknown'}",
    "duration": ${days},
    "travelers": ${intent.persons || 2},
    "currency": "INR",
    "budgetTier": "3-Star Hotel"
  },
  "travelOptions": [
    {
      "mode": "Flight",
      "arrivalCost": <number>,
      "returnCost": <number>,
      "totalTravelCost": <number>,
      "duration": "<string>",
      "pros": ["<string>"],
      "cons": ["<string>"],
      "recommended": <boolean>
    },
    {
      "mode": "Train",
      "arrivalCost": <number>,
      "returnCost": <number>,
      "totalTravelCost": <number>,
      "duration": "<string>",
      "pros": ["<string>"],
      "cons": ["<string>"],
      "recommended": <boolean>
    },
    {
      "mode": "Bus/Car",
      "arrivalCost": <number>,
      "returnCost": <number>,
      "totalTravelCost": <number>,
      "duration": "<string>",
      "pros": ["<string>"],
      "cons": ["<string>"],
      "recommended": <boolean>
    }
  ],
  "dayWiseBudget": [
    {
      "day": 1,
      "theme": "<short day theme/title>",
      "hotelCost": <number>,
      "breakfastCost": <number>,
      "lunchCost": <number>,
      "dinnerCost": <number>,
      "localTransportCost": <number>,
      "sightseeingCost": <number>,
      "miscellaneousCost": <number>,
      "dailyTotal": <number>
    }
  ],
  "budgetSummary": {
    "finalTripTotalRange": {
      "min": <number>,
      "max": <number>
    },
    "perPersonEstimate": <number>,
    "totalFlightTrip": <number>,
    "totalTrainTrip": <number>,
    "totalBusTrip": <number>
  },
  "tips": [
    "<travel tip 1>",
    "<travel tip 2>",
    "<travel tip 3>",
    "<travel tip 4>"
  ]
}

Rules:
- Use realistic 2026 INR pricing.
- hotelCost: base on average 3-star hotel pricing for ${intent.destination}.
- Meals: breakfastCost ~₹150-250, lunchCost ~₹300-600, dinnerCost ~₹400-900 per person (~${intent.persons || 2}x for ${intent.persons || 2} travelers).
- localTransportCost: average per day scooter/auto/cab.
- sightseeingCost: entry fees + activities.
- miscellaneousCost: optional buffer expenses per day (no shopping).
- dayWiseBudget array must have exactly ${days} entries.
- All cost/total values must be numbers (no ₹ symbol, no comma strings).
- dailyTotal = hotelCost + breakfastCost + lunchCost + dinnerCost + localTransportCost + sightseeingCost + miscellaneousCost.
- grand totals (e.g. totalFlightTrip) should equal sum of all dayWiseBudget dailyTotals + respective travelOptions totalTravelCost.`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Trip: ${intent.source || 'Home City'} → ${intent.destination} | Days: ${intent.days} | Budget: ${intent.budget} | Travelers: ${intent.persons || 2}`
    )
  ]);

  const budgetBreakdown = safeJsonParse(response.content);
  if (!budgetBreakdown) {
    console.error("Failed to parse budget:", response.content);
    return { error: "Failed to generate travel budget from LLM response", status: "error" };
  }

  return { budget: budgetBreakdown, status: "budget_calculated" };
};

module.exports = { budgetNode };
