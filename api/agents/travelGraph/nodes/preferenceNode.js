const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Preference Agent: Extracts user intent, corrects place spellings,
 * and detects multi-destination trips.
 */
const preferenceNode = async (state) => {
  console.log("--- PREFERENCE AGENT ---");
  if (state.error) return state;
  
  const { input, userCity, history } = state;

  const systemPrompt = `You are a Conversational Travel Planner with expert knowledge of world geography.
  Your goal is to extract and maintain travel preferences from the user's input, while considering the conversation history.

  Context from History:
  ${history || "No previous history."}

  User's registered home city: ${userCity || 'Unknown'}

  Instructions:
  1. Analyze the new user input in the context of any previous history.
  
  2. CRITICAL — SPELL CORRECTION: You MUST automatically correct any misspelled or phonetically typed place names to their official, canonical English spellings before using them anywhere in your output. Apply corrections to ALL place fields (source, destination, sub_destinations, city, state, full_address, etc.).
     Common corrections (not exhaustive — apply your geographic knowledge broadly):
     - mausuri / mussoori / masuri / mussorie → Mussoorie
     - rishikesh / rishikesh / rsikesh → Rishikesh  
     - dubaii / duabi / duabi → Dubai
     - manalli / manali / manaali → Manali
     - shimlla / shimla / shimla → Shimla
     - gova / goaa / goa → Goa
     - ooti / ootty → Ooty
     - munnar / munar → Munnar
     - kerla / kerela → Kerala
     - rajsthan / rajasthan → Rajasthan
     - kashmir / kasmir / kashmeer → Kashmir
     - ladak / ladakh → Ladakh
     - thailand / tailand → Thailand
     - balli / bali → Bali
     - singapur / singapore → Singapore
     - Apply corrections to ANY place name the user types, not just the above list.

  3. MULTI-DESTINATION DETECTION: If the user mentions more than one destination (e.g., "Rishikesh and Mussoorie", "Dubai + Bali", "Manali then Shimla"), extract ALL destinations (spell-corrected) into sub_destinations array and set is_multi_destination to true.

  4. Extract or update the following details:
     - source (current location. Default to home city if not mentioned)
     - destination (primary travel target — the FIRST mentioned place, spell-corrected)
     - sub_destinations (array of ALL destinations spell-corrected, including the primary. For single destination: [destination])
     - is_multi_destination (true if more than one destination, false otherwise)
     - budget (numeric value)
     - days (number of travel days)
     - persons (number of people traveling)
     - startDate (Start date of travel in DD/MM/YYYY format. If not mentioned, return null)
     - preferences (hobbies, vibes, food interests)
     - sub_areas (prominent neighborhoods)
     - destination_details (An object containing the resolved geographic details of the PRIMARY destination. If the destination is unknown, return null. Otherwise, resolve and return:
       * city: The specific town, city, village, or the closest municipality (e.g., "Sasan Gir" or "Kaza" or "Matheran" or "Denpasar")
       * district: The administrative district or county
       * state: The state, province, or union territory
       * country: The country
       * full_address: A single, fully-qualified search string formatted precisely as "DestinationName, State, Country" (e.g., "Mussoorie, Uttarakhand, India"). Do NOT include district or town names unless they are the main destination itself.)
  
  5. If the user's input is a correction or update (e.g., "actually 5 people" or "let's go to Indore instead"), update the values accordingly.
  6. If the input is ambiguous but history provides context, use the history.

  CRITICAL: Return ONLY a valid JSON object containing the updated intent. Do NOT include any introductory, conversational, or concluding text. You must output nothing else except the raw JSON structure.
  
  Example output for "i want to go mausuri and rishikesh for 5 days budget 40k":
  {
    "source": "Unknown",
    "destination": "Mussoorie",
    "sub_destinations": ["Mussoorie", "Rishikesh"],
    "is_multi_destination": true,
    "budget": 40000,
    "days": 5,
    "persons": 2,
    "startDate": null,
    "preferences": "Sightseeing",
    "sub_areas": [],
    "destination_details": {
      "city": "Mussoorie",
      "district": "Dehradun",
      "state": "Uttarakhand",
      "country": "India",
      "full_address": "Mussoorie, Uttarakhand, India"
    }
  }`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Current Input: ${input}`)
  ]);

  const intent = safeJsonParse(response.content);
  if (!intent) {
    console.error("Failed to parse intent:", response.content);
    return { error: "Failed to extract preferences from LLM response", status: "error" };
  }

  // Enforce a minimum of 3 days if not specified, invalid, or less than 3
  let days = parseInt(intent.days);
  if (isNaN(days) || days < 3) {
    intent.days = 3;
  } else {
    intent.days = days;
  }

  // Enforce a default of 2 persons if not specified, invalid, or less than 1
  let persons = parseInt(intent.persons);
  if (isNaN(persons) || persons < 1) {
    intent.persons = 2;
  } else {
    intent.persons = persons;
  }

  // Normalise sub_destinations: always an array, always includes the primary destination
  if (!Array.isArray(intent.sub_destinations) || intent.sub_destinations.length === 0) {
    intent.sub_destinations = [intent.destination];
  }

  // Normalise is_multi_destination flag
  intent.is_multi_destination = Array.isArray(intent.sub_destinations) && intent.sub_destinations.length > 1;

  console.log(`✅ Destinations resolved: ${intent.sub_destinations.join(', ')} | Multi: ${intent.is_multi_destination}`);

  return { intent, status: "preferences_extracted" };
};

module.exports = { preferenceNode };
