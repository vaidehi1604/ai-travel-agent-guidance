const { StateGraph, END } = require("@langchain/langgraph");
const { TravelGraphState } = require("./state");
const { preferenceNode } = require("./nodes/preferenceNode");
const { weatherNode } = require("./nodes/weatherNode");
const { areaSelectorNode } = require("./nodes/areaSelectorNode");
const { travelNode } = require("./nodes/travelNode");
const { budgetNode } = require("./nodes/budgetNode");
const { packageNode } = require("./nodes/packageNode");
const { hotelNode } = require("./nodes/hotelNode");
const { activityNode } = require("./nodes/activityNode");
const { itineraryNode } = require("./nodes/itineraryNode");
const { linkGeneratorNode } = require("./nodes/linkGeneratorNode");
const { memoryNode } = require("./nodes/memoryNode");

/**
 * Build the TravelGraph
 */
const buildGraph = () => {
  const workflow = new StateGraph(TravelGraphState)
    // Add Nodes
    .addNode("memory_node", memoryNode)
    .addNode("preference_node", preferenceNode)
    .addNode("weather_node", weatherNode)
    .addNode("areaSelector_node", areaSelectorNode)
    .addNode("travel_node", travelNode)
    .addNode("budget_node", budgetNode)
    .addNode("package_node", packageNode)
    .addNode("hotel_node", hotelNode)
    .addNode("activity_node", activityNode)
    .addNode("itinerary_node", itineraryNode)
    .addNode("linkGenerator_node", linkGeneratorNode)

    // Define Edges
    .addEdge("__start__", "memory_node")
    .addEdge("memory_node", "preference_node")
    .addEdge("preference_node", "weather_node")
    .addEdge("weather_node", "areaSelector_node")
    .addEdge("areaSelector_node", "travel_node")
    .addEdge("travel_node", "budget_node")
    .addEdge("budget_node", "package_node")
    .addEdge("package_node", "hotel_node")
    .addEdge("hotel_node", "activity_node")
    .addEdge("activity_node", "itinerary_node")
    .addEdge("itinerary_node", "linkGenerator_node")
    .addEdge("linkGenerator_node", END);

  return workflow.compile();
};

const travelGraph = buildGraph();

module.exports = { travelGraph };
