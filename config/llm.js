const { ChatGroq } = require("@langchain/groq");

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  temperature: 0.2,
  maxRetries: 2,
});

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Store reference to the original invoke method
const originalInvoke = llm.invoke.bind(llm);

// Override invoke on the instance to add automatic throttling and rate-limit retries
llm.invoke = async function (messages, options) {
  let lastError;
  // We will attempt up to 4 times internally on 429 errors
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // Add a small 2-second rate-limiting delay between sequential calls to spread token usage
      await sleep(2000);
      
      return await originalInvoke(messages, options);
    } catch (error) {
      lastError = error;
      const isRateLimit = 
        error.status === 429 || 
        error.message?.includes('429') || 
        error.message?.includes('rate_limit_exceeded') ||
        (error.error && JSON.stringify(error.error).includes('rate_limit'));

      if (isRateLimit && attempt < 4) {
        // Extract retry-after from error headers if present, else default to 8-15 seconds
        let retryAfter = 8000;
        if (error.headers && error.headers['retry-after']) {
          retryAfter = (parseInt(error.headers['retry-after']) * 1000) + 1000; // add a 1s buffer
        } else if (error.message) {
          // Try to parse "try again in X.XXs" from the error message
          const match = error.message.match(/try again in (\d+(\.\d+)?)/i);
          if (match) {
            retryAfter = (parseFloat(match[1]) * 1000) + 1500; // add 1.5s buffer
          }
        }
        console.warn(`⚠️ Groq Rate Limit (429) hit. Waiting ${retryAfter / 1000}s before retrying (Attempt ${attempt}/4)...`);
        await sleep(retryAfter);
      } else {
        // If it's not a rate limit error, throw it immediately
        throw error;
      }
    }
  }
  throw lastError;
};

module.exports = { llm };
