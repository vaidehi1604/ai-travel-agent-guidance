const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');
const axios = require('axios');

/**
 * Hotel Agent: Recommends hotels based on destination, budget, and persons.
 * Uses Tavily Search API to fetch real-time hotel pricing before asking the LLM.
 */
const hotelNode = async (state) => {
  console.log("--- HOTEL AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, budget } = state;
  
  // Extract budget for stay if budget breakdown exists, otherwise use a fraction of total budget
  const stayBudget = budget && budget["Stay/Accommodation"] 
    ? budget["Stay/Accommodation"] 
    : (intent.budget * 0.4); // Default to 40% of budget for stay

  // 1. Fetch real-time hotel pricing via Tavily Search (parallel queries)
  const apiKey = process.env.TAVILY_API_KEY;
  let searchContext = "";

  if (apiKey) {
    try {
      const budgetHotelQuery = `budget hotel hostel guesthouse price per night in ${intent.destination} INR 2026`;
      const midHotelQuery = `3 star hotel resort price per night in ${intent.destination} INR 2026`;

      console.log(`🔍 [HotelNode] Querying Tavily for real-time hotel prices in ${intent.destination}`);

      const [budgetRes, midRes] = await Promise.all([
        axios.post('https://api.tavily.com/search', {
          api_key: apiKey, query: budgetHotelQuery, search_depth: "basic", max_results: 3,
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }),
        axios.post('https://api.tavily.com/search', {
          api_key: apiKey, query: midHotelQuery, search_depth: "basic", max_results: 3,
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }),
      ]);

      const fmt = (results) => (results || []).map(r => `${r.title}: ${r.content}`).join('\n');

      searchContext =
        `[Budget Hotel/Hostel Prices in ${intent.destination}]\n` + fmt(budgetRes.data.results) +
        `\n\n[3-Star / Mid-Range Hotel Prices in ${intent.destination}]\n` + fmt(midRes.data.results);

      console.log(`✅ [HotelNode] Fetched real-time hotel pricing context.`);
    } catch (e) {
      console.warn("⚠️ [HotelNode] Tavily search failed. Falling back to LLM knowledge.", e.message);
    }
  } else {
    console.warn("⚠️ [HotelNode] TAVILY_API_KEY not set. Using LLM knowledge only for hotel prices.");
  }

  // 2. Build system prompt with web-searched pricing context
  const systemPrompt = `You are a Hotel Specialist with access to real-time pricing data.
  Recommend 3-5 specific hotels/accommodations in ${intent.destination} for a ${intent.days}-day trip.
  
  Context:
  - Destination: ${intent.destination}
  - Number of Persons: ${intent.persons || 2}
  - Total Stay Budget: ${stayBudget} (This is for all persons for the entire duration)
  - Preferences: ${intent.preferences}

  REAL-TIME WEB PRICING DATA (use this as your PRIMARY source for hotel pricing):
  ${searchContext || "No real-time pricing data available — use your best knowledge but be conservative."}

  CRITICAL PRICING RULES:
  1. You MUST base your "estimated_price" values on the real-time web pricing data above. Do NOT invent prices.
  2. If the web data shows budget hotels cost ₹800–₹1,500/night, your budget hotel recommendations MUST reflect that range.
  3. If the web data shows 3-star hotels cost ₹2,000–₹4,000/night, your mid-range hotel recommendations MUST reflect that range.
  4. All prices must be in INR.

  Requirements:
  - Provide real or highly realistic hotel names.
  - For each hotel, include:
    - name: Hotel name
    - estimated_price: Approx cost for ${intent.days} days for ${intent.persons || 2} people (NUMBER in INR, based on web pricing data)
    - description: Brief description highlighting why it fits the budget and preferences
    - rating: A star rating (e.g., "4.5/5")
    - link: A placeholder link or search link (e.g., "https://www.booking.com/searchresults.html?ss=HotelName")

  CRITICAL: Return ONLY a valid JSON array of objects matching the schema. Do NOT include any introductory, conversational, or concluding text (e.g., do NOT start with "Based on the...", and do NOT include any trailing notes or explanations). You must output nothing else except the raw JSON structure.`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Destination: ${intent.destination}, Persons: ${intent.persons}, Stay Budget: ${stayBudget}`)
  ]);

  const hotels = safeJsonParse(response.content);
  if (!hotels) {
    console.error("Failed to parse hotels:", response.content);
    return { hotels: [], status: "hotel_failed" };
  }

  return { hotels, status: "hotels_recommended" };
};

module.exports = { hotelNode };
