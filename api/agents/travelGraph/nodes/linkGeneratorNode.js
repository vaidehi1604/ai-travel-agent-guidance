/**
 * Link Generator Agent: Creates search and booking links
 * Always uses the exact user-entered destination name for all public-facing URLs.
 */
const linkGeneratorNode = async (state) => {
  console.log("--- LINK GENERATOR AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, travel } = state;
  // Always use destination as the user typed it (e.g. "Bali", not "Denpasar" or "Bali, Indonesia")
  const { destination, source, persons } = intent;

  // Use nearest airport only for flight searches (transport decision, not destination name)
  const flightDestination = travel && travel.nearest_airport ? travel.nearest_airport : destination;

  const destinationEncoded = encodeURIComponent(destination);
  const flightDestinationEncoded = encodeURIComponent(flightDestination);
  const sourceEncoded = encodeURIComponent(source);
  const numPersons = persons || 2;

  const sourceSlug = (source || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const destSlug = (destination || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  const links = {
    // All search URLs use the exact user-entered destination
    google_search: `https://www.google.com/search?q=top+places+to+visit+in+${destinationEncoded}`,
    flight_search: `https://www.google.com/travel/flights?q=flights+from+${sourceEncoded}+to+${flightDestinationEncoded}`,
    hotel_search: `https://www.booking.com/searchresults.html?ss=${destinationEncoded}&group_adults=${numPersons}`,
    train_search: `https://www.goibibo.com/trains/${sourceSlug}-to-${destSlug}-trains/#all`,
    bus_search: `https://www.google.com/search?q=bus+from+${sourceEncoded}+to+${destinationEncoded}`,
    activities: `https://www.viator.com/searchResults/all?text=${destinationEncoded}`
  };

  return { links, status: "links_generated" };
};

module.exports = { linkGeneratorNode };
