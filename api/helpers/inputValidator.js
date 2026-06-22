const { llm } = require('../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../utils/jsonParser');
const axios = require('axios');

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

const getAbsoluteMinimumBudget = (intent) => {
  const days = parseInt(intent.days) || 3;
  const travelers = parseInt(intent.persons) || 2;
  const isIntl = isInternationalDestination(intent.destination);

  if (isIntl) {
    const travelCost = 30000 * travelers; // min round-trip flights
    const hotelCost = 2000 * Math.max(1, days - 1); // min budget accommodation
    const foodLocalCost = 1500 * travelers * days; // basic meals & transport
    return {
      total: travelCost + hotelCost + foodLocalCost,
      breakdown: {
        transport: `Estimated round-trip flights for ${travelers} traveler(s): ~₹${travelCost.toLocaleString('en-IN')}`,
        accommodation: `Budget lodging for ${days - 1} night(s): ~₹${hotelCost.toLocaleString('en-IN')}`,
        foodAndLocal: `Basic daily expenses (meals, sightseeing) for ${days} day(s): ~₹${foodLocalCost.toLocaleString('en-IN')}`
      }
    };
  } else {
    const travelCost = 400 * travelers; // min round-trip trains/buses
    const hotelCost = 800 * Math.max(1, days - 1); // min budget accommodation
    const foodLocalCost = 500 * travelers * days; // basic meals & transport
    return {
      total: travelCost + hotelCost + foodLocalCost,
      breakdown: {
        transport: `Estimated round-trip train/bus fare for ${travelers} traveler(s): ~₹${travelCost.toLocaleString('en-IN')}`,
        accommodation: `Budget lodging for ${days - 1} night(s): ~₹${hotelCost.toLocaleString('en-IN')}`,
        foodAndLocal: `Basic daily expenses (meals, local travel) for ${days} day(s): ~₹${foodLocalCost.toLocaleString('en-IN')}`
      }
    };
  }
};

/**
 * Validates if the user's travel request (budget, days, destination) is realistic.
 * Uses Tavily Search API to estimate current travel/hotel costs if available,
 * then queries the LLM to make the final feasibility assessment.
 */
const validateTravelFeasibility = async (intent) => {
  const destination = intent.destination;
  const days = intent.days || 3;
  const budget = parseInt(intent.budget) || 0;
  const travelers = intent.persons || 2;
  const source = intent.source || 'Unknown';

  // If budget is not specified, it is always considered "realistic"
  // because the user is not placing a constraint on the cost.
  const rawBudget = intent.budget;
  if (
    rawBudget === null ||
    rawBudget === undefined ||
    rawBudget === '' ||
    String(rawBudget).toLowerCase() === 'null' ||
    String(rawBudget).toLowerCase() === 'none' ||
    String(rawBudget).toLowerCase() === 'unknown'
  ) {
    return {
      isRealistic: true,
      reason: "No budget constraint specified.",
      suggestedBudgetMin: 0,
      suggestedBudgetMax: 0,
      suggestedBudget: 0,
    };
  }

  // Programmatic budget check for absolute minimum floors to prevent low budgets (like 1000 INR)
  const minBudgetInfo = getAbsoluteMinimumBudget(intent);
  if (budget < minBudgetInfo.total) {
    const suggestedMin = minBudgetInfo.total;
    const suggestedMax = Math.round(suggestedMin * 1.8);
    const suggested = Math.round(suggestedMin * 1.3);
    return {
      isRealistic: false,
      reason: `The proposed budget of ₹${budget.toLocaleString('en-IN')} is a bit tight for a ${days}-day trip to ${destination} for ${travelers} traveler(s). Based on standard rates, we recommend adjusting your budget to ensure a feasible trip.`,
      suggestedBudgetMin: suggestedMin,
      suggestedBudgetMax: suggestedMax,
      suggestedBudget: suggested,
      breakdown: minBudgetInfo.breakdown
    };
  }

  // 1. Fetch real-world estimated costs using parallel Tavily Searches if API key is available
  const apiKey = process.env.TAVILY_API_KEY;
  let searchContext = "";

  if (apiKey) {
    try {
      const flightSearchQuery = `round trip flight ticket price from ${source} to ${destination} INR 2026`;
      const trainSearchQuery = `train availability, route, and round trip ticket price from ${source} to ${destination} INR 2026`;
      const localSearchQuery = `average hotel cost per night, food price, local travel in ${destination} INR 2026`;

      console.log(`🔍 Querying Tavily for Flight, Train, and Local costs...`);
      const [flightRes, trainRes, localRes] = await Promise.all([
        axios.post(
          'https://api.tavily.com/search',
          {
            api_key: apiKey,
            query: flightSearchQuery,
            search_depth: "basic",
            max_results: 3,
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        ),
        axios.post(
          'https://api.tavily.com/search',
          {
            api_key: apiKey,
            query: trainSearchQuery,
            search_depth: "basic",
            max_results: 3,
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        ),
        axios.post(
          'https://api.tavily.com/search',
          {
            api_key: apiKey,
            query: localSearchQuery,
            search_depth: "basic",
            max_results: 3,
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        )
      ]);

      const flightResults = flightRes.data.results || [];
      const trainResults = trainRes.data.results || [];
      const localResults = localRes.data.results || [];

      searchContext = `[Flight Costs from ${source} to ${destination}]:\n` + 
        flightResults.map(r => `${r.title}: ${r.content}`).join('\n\n') + 
        `\n\n[Train Costs/Connectivity from ${source} to ${destination}]:\n` + 
        trainResults.map(r => `${r.title}: ${r.content}`).join('\n\n') + 
        `\n\n[Local Costs in ${destination}]:\n` + 
        localResults.map(r => `${r.title}: ${r.content}`).join('\n\n');

      console.log(`🔍 Fetched travel validation pricing context for: ${destination} from ${source}`);
    } catch (e) {
      console.warn("⚠️ Tavily search for travel validation failed. Falling back to LLM knowledge.", e.message);
    }
  }

  // 2. Perform the LLM validation check
  const systemPrompt = `You are a strict, expert Travel Budget Feasibility Validator specializing in global travel budgets calculated in Indian Rupees (INR).
Analyze the user's travel intent and determine if their budget is realistic and feasible for the requested trip.

Input Details:
- Destination: ${destination}
- Source: ${source}
- Duration: ${days} days
- Budget: ${budget} INR
- Travelers: ${travelers}

Web Search context for real-world estimated costs in 2026:
${searchContext || "No search context available."}

Guidelines for assessment:
1. Estimate costs in INR (Indian Rupees) for:
   - Transportation: Round-trip from source to destination for all travelers.
     * Check if a Train option is physically available and feasible for this route based on the Train search context.
     * If train travel is possible (mostly for domestic routes within the same landmass, e.g., Delhi to Shimla), check the costs. Train travel is usually significantly cheaper than flying.
     * If the user's budget is too low for a flight but sufficient for a train, evaluate the feasibility for a train-based trip and explain this to the user in your reason (e.g., "The budget is realistic if you travel by train instead of flying...").
     * If it is an intercontinental trip separated by oceans (e.g. USA to India), train travel is NOT available and flights are the only option.
   - Accommodation: Standard budget stay (like budget hotel, hostel, or homestay) for all travelers for ${days - 1} nights.
   - Food: Basic meals for all travelers for ${days} days.
   - Local transit and sightseeing/activity fees.
2. CRITICAL - FLIGHT & INTERNATIONAL TRAVEL COSTING:
   - Carefully evaluate the distance between the source (${source}) and destination (${destination}).
   - If the source is in the USA (e.g., Dallas) and the destination is in India (e.g., Shimla), this is an INTERCONTINENTAL trip.
   - Round-trip economy flights between the USA and India NEVER cost ₹4,000–₹6,000. They cost at least ₹80,000 to ₹1,50,000 ($1,000 - $1,800 USD) per person!
   - You MUST ensure the transportation estimate matches realistic flight costs returned in the Web Search context. If the search context shows flights cost ₹85,000 to ₹1,60,000, you MUST use that range!
3. Sum the absolute minimum required costs for this trip for all travelers.
4. If the user's budget is lower than this minimum required amount, mark isRealistic as false.
5. If the user's budget is sufficient (equal to or greater than the estimated minimum), mark isRealistic as true.
6. If isRealistic is false, provide:
   - "reason": A polite, detailed, and user-friendly explanation of why the budget is low/insufficient (e.g. "The proposed budget of ₹5,000 may be a bit tight for a 4-day trip to Shimla. Based on estimated transportation, lodging, and daily meals/local travel costs, a more feasible budget would be approximately ₹8,000–₹15,000."). Specify estimated costs of transport (mention train vs flight if train is available) and hotel to make it clear.
   - "suggestedBudgetMin": Minimum realistic budget for the entire group (e.g. 8000).
   - "suggestedBudgetMax": Maximum realistic budget for the entire group (e.g. 15000).
   - "suggestedBudget": A recommended single budget value for the entire group (e.g. 12000).
   Make sure the suggested budgets are for the *entire group* (budget * travelers).

CRITICAL: Return ONLY a valid JSON object. Do not include markdown codeblocks (such as triple backticks) or conversational text. Output nothing but the raw JSON.

Output Format:
{
  "isRealistic": true/false,
  "reason": "Detailed user explanation here",
  "suggestedBudgetMin": <number>,
  "suggestedBudgetMax": <number>,
  "suggestedBudget": <number>,
  "breakdown": {
    "accommodation": "<string description of estimated cost>",
    "transport": "<string description of estimated cost>",
    "foodAndLocal": "<string description of estimated cost>"
  }
}
`;

  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Evaluate feasibility for: ${days} days in ${destination} for ${travelers} people with budget of ${budget} INR from ${source}`)
    ]);

    const result = safeJsonParse(response.content);
    if (result && typeof result.isRealistic === 'boolean') {
      return result;
    }
  } catch (err) {
    console.error("⚠️ LLM travel validation invoke failed:", err.message);
  }

  // Safe fallback if LLM or parsing fails
  return {
    isRealistic: true,
    reason: "Validation check bypassed due to a temporary service error.",
    suggestedBudgetMin: budget,
    suggestedBudgetMax: budget,
    suggestedBudget: budget,
  };
};

module.exports = { validateTravelFeasibility };
