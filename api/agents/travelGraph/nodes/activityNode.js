const axios = require('axios');

/**
 * Activity Agent: Uses Tavily Search API to find accurate, real-world activities
 */
const activityNode = async (state) => {
  console.log("--- ACTIVITY AGENT (TAVILY) ---");
  if (state.error || !state.intent) return state;

  const { intent } = state;
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.warn("TAVILY_API_KEY is not set. Skipping activity search.");
    return { activities: ["No real-time activities fetched (Tavily API key missing)."], status: "activity_skipped" };
  }

  // Always use the exact destination the user typed (e.g. "Bali", not "Bali, Indonesia")
  const searchLocation = intent.destination;

  const query = `Top sightseeing, activities, and things to do in ${searchLocation} focusing on ${intent.preferences || "popular attractions"}`;

  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        max_results: 5,
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
    const activities = results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content
    }));

    if (activities.length === 0) {
      return { activities: ["No activities found."], status: "activity_empty" };
    }

    return { activities, status: "activity_fetched" };

  } catch (error) {
    console.error("Activity agent (Tavily) failed:", error.message);
    return { activities: ["Failed to fetch activities."], status: "activity_failed" };
  }
};

module.exports = { activityNode };
