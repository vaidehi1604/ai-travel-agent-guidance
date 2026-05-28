const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');
const axios = require('axios');

/**
 * Helper to generate a realistic fallback budget object when LLM parsing fails.
 */
const generateFallbackBudget = (destination, source, duration, travelers, limitBudgetVal, travel) => {
  const travelersCount = travelers || 2;
  const days = duration || 3;
  const totalVal = limitBudgetVal || 50000;
  const perPersonVal = Math.round(totalVal / travelersCount);

  // Estimate travel cost from travel options if available
  const travelOpts = travel?.options || [];
  const recOpt = travelOpts.find(o => o.recommended) || travelOpts[0];
  const travelCost = recOpt ? (recOpt.estimated_cost || 0) : Math.round(perPersonVal * 0.25);
  const travelPerPerson = Math.round(travelCost / travelersCount);

  const dailyBudgetLimit = Math.max(1000, perPersonVal - travelPerPerson);
  const hotelCost = Math.round(dailyBudgetLimit * 0.45);
  const foodCost = Math.round(dailyBudgetLimit * 0.25);
  const localTransportCost = Math.round(dailyBudgetLimit * 0.12);
  const sightseeingCost = Math.round(dailyBudgetLimit * 0.12);
  const miscCost = Math.round(dailyBudgetLimit * 0.06);

  const dailyTotal = hotelCost + foodCost + localTransportCost + sightseeingCost + miscCost;

  const dayWiseBudget = [];
  for (let i = 1; i <= days; i++) {
    dayWiseBudget.push({
      day: i,
      theme: `Day ${i} Exploration`,
      hotelCost: i === days ? 0 : hotelCost, // no hotel on departure day
      breakfastCost: Math.round(foodCost * 0.2),
      lunchCost: Math.round(foodCost * 0.4),
      dinnerCost: i === days ? 0 : Math.round(foodCost * 0.4),
      localTransportCost: localTransportCost,
      sightseeingCost: sightseeingCost,
      miscellaneousCost: miscCost,
      dailyTotal: (i === days ? 0 : hotelCost) + Math.round(foodCost * 0.2) + Math.round(foodCost * 0.4) + (i === days ? 0 : Math.round(foodCost * 0.4)) + localTransportCost + sightseeingCost + miscCost
    });
  }

  const dayWiseTotal = dayWiseBudget.reduce((s, d) => s + d.dailyTotal, 0);
  const estimatedTotal = dayWiseTotal + travelPerPerson;

  const comparisonTiers = {
    budget: {
      hotel: { type: "Hostel / Guest House", costPerNight: Math.round(hotelCost * 0.4), totalCost: Math.round(hotelCost * 0.4) * (days - 1) },
      food: { type: "Local / Street Food", costPerDay: Math.round(foodCost * 0.5), totalCost: Math.round(foodCost * 0.5) * days },
      transport: { type: "Bus / Shared Transport", costPerDay: Math.round(localTransportCost * 0.4), totalCost: Math.round(localTransportCost * 0.4) * days },
      activities: { type: "Local Sightseeing", costPerDay: Math.round(sightseeingCost * 0.5), totalCost: Math.round(sightseeingCost * 0.5) * days },
      other: { type: "Shopping / Misc.", costPerDay: Math.round(miscCost * 0.5), totalCost: Math.round(miscCost * 0.5) * days },
      estimatedTotalPerPerson: (Math.round(hotelCost * 0.4) * (days - 1)) + ((Math.round(foodCost * 0.5) + Math.round(localTransportCost * 0.4) + Math.round(sightseeingCost * 0.5) + Math.round(miscCost * 0.5)) * days) + travelPerPerson
    },
    standard: {
      hotel: { type: "3★ Hotel", costPerNight: hotelCost, totalCost: hotelCost * (days - 1) },
      food: { type: "Restaurants", costPerDay: foodCost, totalCost: foodCost * days },
      transport: { type: "Taxi / Local Cab", costPerDay: localTransportCost, totalCost: localTransportCost * days },
      activities: { type: "Popular Attractions", costPerDay: sightseeingCost, totalCost: sightseeingCost * days },
      other: { type: "Shopping / Misc.", costPerDay: miscCost, totalCost: miscCost * days },
      estimatedTotalPerPerson: estimatedTotal
    },
    luxury: {
      hotel: { type: "5★ Resort / Premium Hotel", costPerNight: hotelCost * 2.5, totalCost: hotelCost * 2.5 * (days - 1) },
      food: { type: "Fine Dining", costPerDay: foodCost * 2.5, totalCost: foodCost * 2.5 * days },
      transport: { type: "Private Vehicle", costPerDay: localTransportCost * 2.5, totalCost: localTransportCost * 2.5 * days },
      activities: { type: "Private Tours", costPerDay: sightseeingCost * 2.5, totalCost: sightseeingCost * 2.5 * days },
      other: { type: "Shopping / Premium", costPerDay: miscCost * 2.5, totalCost: miscCost * 2.5 * days },
      estimatedTotalPerPerson: (hotelCost * 2.5 * (days - 1)) + ((foodCost * 2.5 + localTransportCost * 2.5 + sightseeingCost * 2.5 + miscCost * 2.5) * days) + (travelPerPerson * 1.5)
    }
  };

  const travelOptions = [
    {
      mode: "Flight",
      arrivalCost: travelPerPerson,
      returnCost: travelPerPerson,
      totalTravelCost: travelPerPerson * 2 * travelersCount,
      duration: "Approx. 3h",
      pros: ["Fastest mode"],
      cons: ["Higher cost"],
      recommended: true
    }
  ];

  return {
    overview: {
      destination,
      source,
      duration: days,
      travelers: travelersCount,
      currency: "INR",
      budgetTier: "Standard"
    },
    comparisonTiers,
    travelOptions,
    dayWiseBudget,
    budgetSummary: {
      finalTripTotalRange: {
        min: Math.round(estimatedTotal * 0.9),
        max: Math.round(estimatedTotal * 1.1)
      },
      perPersonEstimate: estimatedTotal,
      totalFlightTrip: estimatedTotal,
      totalTrainTrip: 0,
      totalBusTrip: 0
    },
    itemizedDetails: {
      flights: { description: `Flights from ${source} to ${destination}`, estimatedCost: travelCost },
      hotels: { description: `${days - 1} nights in Standard accommodation`, estimatedCost: hotelCost * (days - 1) * travelersCount },
      meals: { description: `Meals for ${travelersCount} travelers over ${days} days`, estimatedCost: foodCost * days * travelersCount },
      transportation: { description: `Local travel for ${travelersCount} travelers`, estimatedCost: localTransportCost * days * travelersCount },
      sightseeing: { description: `Activity fees for ${travelersCount} travelers`, estimatedCost: sightseeingCost * days * travelersCount }
    },
    tips: ["Book early for best prices.", "Carry cash for local vendors."]
  };
};

/**
 * Budget Agent: Generates a detailed, structured day-wise budget breakdown
 * matching the user's exact required JSON schema with realistic INR pricing.
 */
const budgetNode = async (state) => {
  console.log("--- BUDGET AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, travel, hotels, packages, activities } = state;

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
  const travelersCount = intent.persons || 2;

  const systemPrompt = `You are an expert Financial Travel Planner specializing in Indian travel budgets (INR).
  
Generate a detailed, structured travel budget for a ${days}-day trip from ${intent.source || 'the source city'} to ${intent.destination}.
Overall budget context: ${intent.budget} INR.
Number of travelers: ${travelersCount}.

Real-World Data Generated in Previous Steps:
- Recommended Hotels: ${JSON.stringify(hotels || [])}
- Recommended Packages: ${JSON.stringify(packages || [])}
- Feasible Travel Options: ${JSON.stringify(travel?.options || [])}
- Real-world Activities: ${JSON.stringify(activities || [])}

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
    "travelers": ${travelersCount},
    "currency": "INR",
    "budgetTier": "<Budget | Standard | Luxury>"
  },
  "comparisonTiers": {
    "budget": {
      "hotel": { "type": "Hostel / Guest House", "costPerNight": <number>, "totalCost": <number> },
      "food": { "type": "Local / Street Food", "costPerDay": <number>, "totalCost": <number> },
      "transport": { "type": "Bus / Shared Transport", "costPerDay": <number>, "totalCost": <number> },
      "activities": { "type": "Local Sightseeing", "costPerDay": <number>, "totalCost": <number> },
      "other": { "type": "Shopping / Misc.", "costPerDay": <number>, "totalCost": <number> },
      "estimatedTotalPerPerson": <number>
    },
    "standard": {
      "hotel": { "type": "3★ Hotel", "costPerNight": <number>, "totalCost": <number> },
      "food": { "type": "Restaurants", "costPerDay": <number>, "totalCost": <number> },
      "transport": { "type": "Taxi / Local Cab", "costPerDay": <number>, "totalCost": <number> },
      "activities": { "type": "Popular Attractions", "costPerDay": <number>, "totalCost": <number> },
      "other": { "type": "Shopping / Misc.", "costPerDay": <number>, "totalCost": <number> },
      "estimatedTotalPerPerson": <number>
    },
    "luxury": {
      "hotel": { "type": "5★ Resort / Premium Hotel", "costPerNight": <number>, "totalCost": <number> },
      "food": { "type": "Fine Dining", "costPerDay": <number>, "totalCost": <number> },
      "transport": { "type": "Private Vehicle", "costPerDay": <number>, "totalCost": <number> },
      "activities": { "type": "Private Tours", "costPerDay": <number>, "totalCost": <number> },
      "other": { "type": "Shopping / Premium", "costPerDay": <number>, "totalCost": <number> },
      "estimatedTotalPerPerson": <number>
    }
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

  let budgetBreakdown = null;
  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(
        `Trip: ${intent.source || 'Home City'} → ${intent.destination} | Days: ${intent.days} | Budget: ${intent.budget} | Travelers: ${intent.persons || 2}`
      )
    ]);
    budgetBreakdown = safeJsonParse(response.content);
  } catch (err) {
    console.error("⚠️ Groq budget calculation invoke failed. Using fallback.", err.message);
  }

  if (!budgetBreakdown) {
    console.warn("Failed to parse budget or invoke failed, using dynamic fallback.");
    const fallback = generateFallbackBudget(intent.destination, intent.source, days, travelersCount, limitBudgetVal, travel);
    return { budget: fallback, status: 'budget_fallback' };
  }

  // Auto-adjust budget breakdown to fit the user's specified budget limit (safety net)
  if (limitBudgetVal > 0) {
    const travelOpts = budgetBreakdown.travelOptions || [];
    const recOpt = travelOpts.find(o => o.recommended) || travelOpts[0];
    const recommendedTravelCost = recOpt ? (recOpt.totalTravelCost || (recOpt.arrivalCost + recOpt.returnCost) || 0) : 0;
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

  // 4. Scale comparisonTiers if present
  if (budget.comparisonTiers && typeof budget.comparisonTiers === 'object') {
    Object.keys(budget.comparisonTiers).forEach(tierKey => {
      const tier = budget.comparisonTiers[tierKey];
      if (tier && typeof tier === 'object') {
        ['hotel', 'food', 'transport', 'activities', 'other'].forEach(itemKey => {
          const item = tier[itemKey];
          if (item && typeof item === 'object') {
            if (item.costPerNight) item.costPerNight = round(item.costPerNight);
            if (item.costPerDay) item.costPerDay = round(item.costPerDay);
            if (item.totalCost) item.totalCost = round(item.totalCost);
          }
        });
        if (tier.estimatedTotalPerPerson) {
          tier.estimatedTotalPerPerson = round(tier.estimatedTotalPerPerson);
        }
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
