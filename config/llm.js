const { ChatGroq } = require("@langchain/groq");

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  temperature: 0.2,
  maxRetries: 2,
});

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fallback models pool
const fallbackModels = [
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
];

// Instantiate fallback ChatGroq clients
const fallbackClients = fallbackModels.map(modelName => new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: modelName,
  temperature: 0.2,
  maxRetries: 2,
}));

// Original invoke for the main instance
const originalInvoke = llm.invoke.bind(llm);

llm.invoke = async function (messages, options) {
  let lastError;
  
  // Attempt 1: Try the primary model
  try {
    // Spread requests slightly to prevent transient network collisions
    await sleep(200);
    return await originalInvoke(messages, options);
  } catch (error) {
    lastError = error;
    const isRateLimit = 
      error.status === 429 || 
      error.message?.includes('429') || 
      error.message?.includes('rate_limit_exceeded') ||
      (error.error && JSON.stringify(error.error).includes('rate_limit'));

    if (isRateLimit) {
      console.warn(`⚠️ Groq Primary Model (${llm.model || llm.modelName || 'llama-3.1-8b-instant'}) Rate Limit (429) hit. Switching to fallback models to bypass wait time...`);
      
      // Try fallback models in the pool sequentially
      for (let i = 0; i < fallbackClients.length; i++) {
        const fallbackClient = fallbackClients[i];
        const modelName = fallbackModels[i];
        try {
          console.log(`🔄 Retrying with fallback model: ${modelName}...`);
          return await fallbackClient.invoke(messages, options);
        } catch (fallbackError) {
          lastError = fallbackError;
          const isFallbackRateLimit = 
            fallbackError.status === 429 || 
            fallbackError.message?.includes('429') || 
            fallbackError.message?.includes('rate_limit_exceeded') ||
            (fallbackError.error && JSON.stringify(fallbackError.error).includes('rate_limit'));
            
          if (isFallbackRateLimit) {
            console.warn(`⚠️ Fallback model ${modelName} also rate limited (429). Trying next fallback...`);
          } else {
            throw fallbackError; // If not rate limited, throw immediately
          }
        }
      }
    } else {
      throw error; // If not a rate limit error, throw it immediately
    }
  }

  // If both primary and all fallback models are rate limited, perform a short sleep and retry
  console.warn(`⚠️ All models in pool rate limited. Sleeping 8s before final retry...`);
  await sleep(8000);
  try {
    // Try primary model once more
    return await originalInvoke(messages, options);
  } catch (finalError) {
    throw finalError;
  }
};

module.exports = { llm };
