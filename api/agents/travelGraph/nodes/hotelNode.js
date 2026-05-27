const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Hotel Agent: Recommends hotels based on destination, budget, and persons
 */
const hotelNode = async (state) => {
  console.log("--- HOTEL AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, budget } = state;
  
  // Extract budget for stay if budget breakdown exists, otherwise use a fraction of total budget
  const stayBudget = budget && budget["Stay/Accommodation"] 
    ? budget["Stay/Accommodation"] 
    : (intent.budget * 0.4); // Default to 40% of budget for stay

  const systemPrompt = `You are a Hotel Specialist.
  Recommend 3-5 specific hotels/accommodations in ${intent.destination} for a ${intent.days}-day trip.
  
  Context:
  - Destination: ${intent.destination}
  - Number of Persons: ${intent.persons || 2}
  - Total Stay Budget: ${stayBudget} (This is for all persons for the entire duration)
  - Preferences: ${intent.preferences}

  Requirements:
  - Provide real or highly realistic hotel names.
  - For each hotel, include:
    - name: Hotel name
    - estimated_price: Approx cost for ${intent.days} days for ${intent.persons || 2} people
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
