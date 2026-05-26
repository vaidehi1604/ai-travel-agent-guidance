const { Annotation } = require("@langchain/langgraph");

/**
 * Define the state schema for our TravelGraph
 */
const TravelGraphState = Annotation.Root({
  // User Input
  input: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  userId: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  userCity: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Extracted Intent
  intent: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // External Data
  weather: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Intermediate Selections
  areas: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Travel Options
  travel: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Final Outputs
  itinerary: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  links: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  hotels: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  packages: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  activities: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Status/Errors
  status: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  error: Annotation({
    reducer: (x, y) => y ?? x,
  })
});

module.exports = { TravelGraphState };
