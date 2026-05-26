const Memory = require('../../../model/Memory');
const { sequelize } = require('../../../../config/db');

/**
 * Memory Agent: Handles retrieval and storage of user travel history
 */
const memoryNode = async (state) => {
  console.log("--- MEMORY AGENT ---");
  const { userId, input } = state;

  if (!userId) {
    return { status: "memory_skipped" };
  }

  // 1. Retrieve past relevant trips (Simplified: last 3 trips)
  try {
    const pastTrips = await Memory.findAll({
      where: { userId },
      limit: 3,
      order: [['createdAt', 'DESC']]
    });

    const historySummary = pastTrips.map(t => t.content).join("\n---\n");

    return { 
      history: historySummary, 
      status: "memory_retrieved" 
    };
  } catch (error) {
    console.error("Memory retrieval failed:", error.message);
    return { status: "memory_failed" };
  }
};

/**
 * Helper to save state to memory after graph completion
 */
const saveToMemory = async (userId, content, metadata = {}) => {
  try {
    // In a real app, you'd generate embeddings here using OpenAI/HuggingFace
    // const embedding = await getEmbedding(content); 
    
    await Memory.create({
      userId,
      content,
      metadata,
      createdBy: userId,
      // embedding: embedding // pgvector column
    });
    console.log("Saved to memory");
  } catch (error) {
    console.error("Failed to save to memory:", error.message);
  }
};

module.exports = { memoryNode, saveToMemory };
