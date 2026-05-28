const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');
const axios = require('axios');

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

  // 1. Fetch real-time web pricing details for the destination via Tavily Search
  const apiKey = process.env.TAVILY_API_KEY;
  let searchContext = "";
  if (apiKey) {
    try {
      const searchQuery = `average cost of 3 star hotel, 5 star hotel, hostel, daily food cost, taxi fare, sightseeing tickets in ${intent.destination} INR 2026`;
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: apiKey,
          query: searchQuery,
          search_depth: "basic",
          max_results: 3,
          include_answer: false,
          include_images: false,
          include_raw_content: false
        },
        {
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      const results = response.data.results || [];
      searchContext = results.map(r => `${r.title}: ${r.content}`).join('\n\n');
      console.log(`🔍 Fetched budget web pricing context for: ${intent.destination}`);
    } catch (e) {
      console.warn("⚠️ Tavily search for budget pricing failed. Falling back to LLM knowledge.", e.message);
    }
  }

  const limitBudgetVal = parseInt(intent.budget) || 50000;

  const systemPrompt = `You are an expert Financial Travel Planner specializing in Indian travel budgets (INR).
  
Generate a detailed, structured travel budget for a ${days}-day trip from ${intent.source || 'the source city'} to ${intent.destination}.
Overall budget context: ${intent.budget}.
Travel options already analyzed: ${JSON.stringify(travel?.options || [])}.

Real-time Web Pricing Context (use this to ensure highly accurate, current hotel/food/transit rates):
${searchContext || "No real-time web pricing context available."}

CRITICAL CURRENCY & BUDGET CONSTRAINT RULES:
1. All price values in the JSON MUST be in Indian Rupees (INR).
2. If the destination is international (e.g. Bali, Dubai, Singapore, Maldives, Thailand), you MUST convert local rates (such as Indonesian Rupiah IDR, UAE Dirham AED, etc.) to INR using realistic standard conversion rates (e.g., 1 IDR = 0.0055 INR, 1 AED = 23 INR, 1 USD = 83 INR).
3. NEVER output raw local currency values (like 1,800,000 IDR or 500 AED) directly in any cost fields. A typical hotel in Bali must be listed as its INR equivalent (e.g., 2000 to 4000) instead of 800,000.
4. The grand total of all daily costs and travel options per person MUST NOT exceed the user's total budget limit: ${limitBudgetVal} INR. If the budget is low, scale down lodging tiers (e.g., select hostels or budget homestays) and food choices so that the final estimate fits within the limit.

CRITICAL: Return ONLY a valid JSON object matching the structure below. Do NOT include any introductory, conversational, or concluding text (e.g., do NOT start with "Based on the...", and do NOT include any trailing notes or explanations). You must output nothing else except the raw JSON structure.

Format:
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
  "itemizedDetails": {
    "flights": {
      "description": "<string detailing airline transit, e.g., 'Round-trip economy flights from origin to destination for X persons'>",
      "estimatedCost": <number>
    },
    "hotels": {
      "description": "<string detailing accommodations, e.g., 'X nights stay in a recommended 3-star resort for group'>",
      "estimatedCost": <number>
    },
    "meals": {
      "description": "<string detailing food & drinks, e.g., 'Breakfast, lunch, and dinner estimates for group over X days'>",
      "estimatedCost": <number>
    },
    "transportation": {
      "description": "<string detailing local transport, e.g., 'Local scooter rental + fuel or private cabs for sightseeing'>",
      "estimatedCost": <number>
    },
    "sightseeing": {
      "description": "<string detailing entry tickets and tours, e.g., 'Entry fees for primary attractions & local guided activities'>",
      "estimatedCost": <number>
    }
  },
  "tips": [
    "<travel tip 1>",
    "<travel tip 2>",
    "<travel tip 3>",
    "<travel tip 4>"
  ]
}

Rules:
- Use realistic 2026 INR pricing based on the Web Pricing Context.
- hotelCost, breakfastCost, lunchCost, dinnerCost, localTransportCost, sightseeingCost, miscellaneousCost MUST be daily estimates PER PERSON.
- All cost/total values must be numbers (no ₹ symbol, no comma strings).
- dailyTotal MUST BE mathematically exact: dailyTotal = hotelCost + breakfastCost + lunchCost + dinnerCost + localTransportCost + sightseeingCost + miscellaneousCost.
- The grand totals inside "budgetSummary" MUST be mathematically consistent:
  * totalFlightTrip = sum of all dayWiseBudget dailyTotal values + Flight totalTravelCost (divided by travelers number so that everything is per person).
  * totalTrainTrip = sum of all dayWiseBudget dailyTotal values + Train totalTravelCost (divided by travelers number).
  * totalBusTrip = sum of all dayWiseBudget dailyTotal values + Bus/Car totalTravelCost (divided by travelers number).
  * perPersonEstimate = grand total per person of the recommended travel mode option.
  * finalTripTotalRange.min = perPersonEstimate * 0.9 (rounded).
  * finalTripTotalRange.max = perPersonEstimate * 1.1 (rounded).`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Trip: ${intent.source || 'Home City'} → ${intent.destination} | Days: ${intent.days} | Budget: ${intent.budget} | Travelers: ${intent.persons || 2}`
    )
  ]);

  const budgetBreakdown = safeJsonParse(response.content);
  if (!budgetBreakdown) {
    console.warn("Failed to parse budget, using fallback:", response.content?.slice(0, 200));
    // Return a minimal fallback so the graph continues and DB insert succeeds
    return {
      budget: {
        overview: { destination: intent.destination, duration: days, travelers: intent.persons || 2, currency: 'INR', budgetTier: 'Budget' },
        travelOptions: [],
        dayWiseBudget: [],
        budgetSummary: { finalTripTotalRange: { min: 0, max: limitBudgetVal }, perPersonEstimate: limitBudgetVal, totalFlightTrip: 0, totalTrainTrip: 0, totalBusTrip: 0 },
        itemizedDetails: {},
        tips: ['Book early for best prices.', 'Carry cash for local vendors.'],
      },
      status: 'budget_fallback'
    };
  }

  // Auto-adjust budget breakdown to fit the user's specified budget limit (safety net)
  if (limitBudgetVal > 0) {
    const travelOpts = budgetBreakdown.travelOptions || [];
    const recOpt = travelOpts.find(o => o.recommended) || travelOpts[0];
    const recommendedTravelCost = recOpt ? (recOpt.totalTravelCost || (recOpt.arrivalCost + recOpt.returnCost) || 0) : 0;
    const travelersCount = intent.persons || 2;
    const travelPerPerson = Math.round(recommendedTravelCost / travelersCount);

    const daysList = budgetBreakdown.dayWiseBudget || [];
    const totalDailyCost = daysList.reduce((s, d) => s + (d.dailyTotal || 0), 0);
    const grandTotalPerPerson = totalDailyCost + travelPerPerson;

    if (grandTotalPerPerson > limitBudgetVal) {
      console.log(`⚠️ Budget limit exceeded! Generated: ₹${grandTotalPerPerson}, Limit: ₹${limitBudgetVal}. Scaling down...`);
      const scaleFactor = (limitBudgetVal * 0.95) / grandTotalPerPerson;
      scaleBudget(budgetBreakdown, scaleFactor, travelersCount);
    }
  }

  return { budget: budgetBreakdown, status: "budget_calculated" };
};

const scaleBudget = (budget, scaleFactor, travelers) => {
  if (scaleFactor >= 1.0 || scaleFactor <= 0) return budget;

  const round = (val) => Math.round(val * scaleFactor);

  // 1. Scale travel options
  if (Array.isArray(budget.travelOptions)) {
    budget.travelOptions.forEach(opt => {
      if (opt.arrivalCost) opt.arrivalCost = round(opt.arrivalCost);
      if (opt.returnCost) opt.returnCost = round(opt.returnCost);
      if (opt.totalTravelCost) opt.totalTravelCost = round(opt.totalTravelCost);
    });
  }

  // 2. Scale dayWiseBudget and recalculate dailyTotal
  if (Array.isArray(budget.dayWiseBudget)) {
    budget.dayWiseBudget.forEach(d => {
      d.hotelCost = round(d.hotelCost || 0);
      d.breakfastCost = round(d.breakfastCost || 0);
      d.lunchCost = round(d.lunchCost || 0);
      d.dinnerCost = round(d.dinnerCost || 0);
      d.localTransportCost = round(d.localTransportCost || 0);
      d.sightseeingCost = round(d.sightseeingCost || 0);
      d.miscellaneousCost = round(d.miscellaneousCost || 0);

      d.dailyTotal = d.hotelCost + d.breakfastCost + d.lunchCost + d.dinnerCost + d.localTransportCost + d.sightseeingCost + d.miscellaneousCost;
    });
  }

  // 3. Scale itemizedDetails
  if (budget.itemizedDetails && typeof budget.itemizedDetails === 'object') {
    Object.keys(budget.itemizedDetails).forEach(k => {
      if (budget.itemizedDetails[k] && typeof budget.itemizedDetails[k].estimatedCost === 'number') {
        budget.itemizedDetails[k].estimatedCost = round(budget.itemizedDetails[k].estimatedCost);
      }
    });
  }

  // Recalculate summary totals
  const travelOpts = budget.travelOptions || [];
  let flightCost = 0;
  let trainCost = 0;
  let busCost = 0;
  let recommendedCost = 0;

  travelOpts.forEach(opt => {
    const mode = opt.mode || '';
    const cost = opt.totalTravelCost || (opt.arrivalCost + opt.returnCost) || 0;
    if (mode.toLowerCase().includes('flight')) flightCost = cost;
    else if (mode.toLowerCase().includes('train')) trainCost = cost;
    else if (mode.toLowerCase().includes('bus') || mode.toLowerCase().includes('car')) busCost = cost;

    if (opt.recommended) {
      recommendedCost = cost;
    }
  });

  if (recommendedCost === 0 && travelOpts.length > 0) {
    const recOpt = travelOpts.find(o => o.recommended) || travelOpts[0];
    recommendedCost = recOpt.totalTravelCost || (recOpt.arrivalCost + recOpt.returnCost) || 0;
  }

  const numTravelers = travelers || budget.overview?.travelers || 2;
  const travelPerPerson = Math.round(recommendedCost / numTravelers);

  const totalDailyCost = Array.isArray(budget.dayWiseBudget) ? budget.dayWiseBudget.reduce((s, d) => s + d.dailyTotal, 0) : 0;
  const perPersonEstimate = totalDailyCost + travelPerPerson;

  budget.budgetSummary = {
    finalTripTotalRange: {
      min: Math.round(perPersonEstimate * 0.9),
      max: Math.round(perPersonEstimate * 1.1)
    },
    perPersonEstimate,
    totalFlightTrip: totalDailyCost + Math.round(flightCost / numTravelers),
    totalTrainTrip: totalDailyCost + Math.round(trainCost / numTravelers),
    totalBusTrip: totalDailyCost + Math.round(busCost / numTravelers)
  };

  return budget;
};

module.exports = { budgetNode };
