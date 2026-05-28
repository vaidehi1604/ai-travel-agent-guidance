const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Hotel Agent: Recommends hotels per destination.
 * - Single destination → returns flat array (backward compatible)
 * - Multi-destination → returns grouped array: [{ destination, hotels: [...] }, ...]
 */
const hotelNode = async (state) => {
  console.log("--- HOTEL AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, budget } = state;
  const stayBudget = budget && budget["Stay/Accommodation"]
    ? budget["Stay/Accommodation"]
    : (intent.budget * 0.4);

  /**
   * Fetch hotels for a single destination
   */
  const fetchHotelsForDest = async (destName, perDestBudget) => {
    const systemPrompt = `You are a Hotel Specialist.
Recommend 2-3 specific hotels/accommodations in ${destName} for a ${intent.days}-day trip.

Context:
- Destination: ${destName}
- Number of Persons: ${intent.persons || 2}
- Total Stay Budget: ${perDestBudget} (for all persons, entire duration)
- Preferences: ${intent.preferences}

Requirements:
- Provide real or highly realistic hotel names.
- For each hotel include:
  - name: Hotel name
  - estimated_price: Approx cost for ${intent.days} days for ${intent.persons || 2} people (INR)
  - description: Brief description highlighting why it fits the budget and preferences
  - rating: A star rating (e.g., "4.5/5")
  - link: Booking.com search link (e.g., "https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destName)}")

CRITICAL: Return ONLY a valid JSON array. No intro text, no trailing text. Just the raw JSON array.`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Destination: ${destName}, Persons: ${intent.persons || 2}, Stay Budget: ${perDestBudget}`)
    ]);

    const hotels = safeJsonParse(response.content);
    if (!hotels || !Array.isArray(hotels)) {
      console.warn(`Hotel fetch failed for ${destName}, using empty array`);
      return [];
    }
    return hotels;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-DESTINATION: generate hotels per city
  // ─────────────────────────────────────────────────────────────────────────
  if (intent.is_multi_destination && Array.isArray(intent.sub_destinations) && intent.sub_destinations.length > 1) {
    console.log(`🏨 Multi-destination hotels for: ${intent.sub_destinations.join(', ')}`);

    const perDestBudget = Math.round(stayBudget / intent.sub_destinations.length);
    const grouped = [];

    for (const dest of intent.sub_destinations) {
      const hotels = await fetchHotelsForDest(dest, perDestBudget);
      grouped.push({ destination: dest, hotels });
    }

    return { hotels: grouped, status: "hotels_recommended_multi" };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE DESTINATION: flat array (backward compatible)
  // ─────────────────────────────────────────────────────────────────────────
  const hotels = await fetchHotelsForDest(intent.destination, stayBudget);
  return { hotels, status: "hotels_recommended" };
};

module.exports = { hotelNode };
