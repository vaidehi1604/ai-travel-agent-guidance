/**
 * Link Generator Agent: Creates search and booking links
 * Uses web-verified transport availability from the travel node to only
 * generate links for modes that actually exist.
 * Always uses the exact user-entered destination name for all public-facing URLs.
 */
const linkGeneratorNode = async (state) => {
  console.log("--- LINK GENERATOR AGENT ---");
  if (state.error || !state.intent) return state;

  const { intent, travel } = state;
  const { destination, source, persons } = intent;

  // Read verified availability from travel node (defaults to true if not set)
  const availability = travel?.availability || { flight: true, train: true, bus: true };

  // Use nearest airport from travel node (now web-verified)
  const flightDestination = travel && travel.nearest_airport ? travel.nearest_airport : destination;

  const destinationEncoded = encodeURIComponent(destination);
  const flightDestinationEncoded = encodeURIComponent(flightDestination);
  const sourceEncoded = encodeURIComponent(source);
  const numPersons = persons || 2;

  const sourceSlug = (source || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const destSlug = (destination || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

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

  const isIntl = isInternationalDestination(destination);

  const links = {
    google_search: `https://www.google.com/search?q=top+places+to+visit+in+${destinationEncoded}`,
    hotel_search: `https://www.booking.com/searchresults.html?ss=${destinationEncoded}&group_adults=${numPersons}`,
    activities: `https://www.viator.com/searchResults/all?text=${destinationEncoded}`
  };

  // Only add flight link if flights are available
  if (availability.flight) {
    links.flight_search = `https://www.google.com/travel/flights?q=flights+from+${sourceEncoded}+to+${flightDestinationEncoded}`;
  }

  // Only add train/bus links for domestic destinations WITH verified availability
  if (!isIntl && availability.train) {
    links.train_search = `https://www.goibibo.com/trains/${sourceSlug}-to-${destSlug}-trains/#all`;
  }

  if (!isIntl && availability.bus) {
    links.bus_search = `https://www.google.com/search?q=bus+from+${sourceEncoded}+to+${destinationEncoded}`;
  }

  console.log(`🔗 [LinkGenerator] Generated links: ${Object.keys(links).join(', ')}`);

  return { links, status: "links_generated" };
};

module.exports = { linkGeneratorNode };
