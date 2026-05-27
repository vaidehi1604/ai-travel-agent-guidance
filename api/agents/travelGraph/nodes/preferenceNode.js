const { llm } = require('../../../../config/llm');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Preference Agent: Extracts user intent and manages conversational context
 */
const preferenceNode = async (state) => {
  console.log("--- PREFERENCE AGENT ---");
  if (state.error) return state;
  
  const { input, userCity, history } = state;

  const systemPrompt = `You are a Conversational Travel Planner.
  Your goal is to extract and maintain travel preferences from the user's input, while considering the conversation history.

  Context from History:
  ${history || "No previous history."}

  User's registered home city: ${userCity || 'Unknown'}

  Instructions:
  1. Analyze the new user input in the context of any previous history.
  2. Extract or update the following details:
     - source (current location. Default to home city if not mentioned)
     - destination (travel target)
     - budget (numeric value)
     - days (number of travel days)
     - persons (number of people traveling)
     - startDate (Start date of travel in DD/MM/YYYY format. If not mentioned, return null)
     - preferences (hobbies, vibes, food interests)
     - sub_areas (prominent neighborhoods)
     - destination_details (An object containing the resolved geographic details of the destination. If the destination is unknown, return null. Otherwise, resolve and return:
       * city: The specific town, city, village, or the closest municipality (e.g., "Sasan Gir" or "Kaza" or "Matheran" or "Denpasar")
       * district: The administrative district or county (e.g., "Junagadh" or "Lahaul and Spiti" or "Raigad")
       * state: The state, province, or union territory (e.g., "Gujarat" or "Himachal Pradesh" or "Maharashtra")
       * country: The country (e.g., "India" or "Indonesia")
       * full_address: A single, fully-qualified search string formatted precisely as "DestinationName, State, Country" (e.g., "Gir National Park, Gujarat, India" or "Spiti Valley, Himachal Pradesh, India" or "Matheran Hill Station, Maharashtra, India" or "Bali, Indonesia"). Do NOT include district or town names in this string unless they are the main destination itself.)
  3. If the user's input is a correction or update (e.g., "actually 5 people" or "let's go to Indore instead"), update the values accordingly.
  4. If the input is ambiguous but history provides context, use the history.

  CRITICAL: Return ONLY a valid JSON object containing the updated intent. Do NOT include any introductory, conversational, or concluding text (e.g., do NOT start with "Based on the...", and do NOT include any trailing notes or explanations). You must output nothing else except the raw JSON structure.`;

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

  //Enforce a default of 2 persons if not specified, invalid, or less than 1
  let persons = parseInt(intent.persons);
  if (isNaN(persons) || persons < 1) {
    intent.persons = 2;
  } else {
    intent.persons = persons;
  }

  return { intent, status: "preferences_extracted" };
};

module.exports = { preferenceNode };
