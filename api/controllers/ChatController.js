const { llm } = require('../../config/llm');
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const Memory = require('../model/Memory');
const { HTTP_STATUS_CODE, uuidv4 } = require('../../config/constants');

/**
 * Builds a rich plain-text summary of the generated travel plan so the LLM
 * has full itinerary context when answering follow-up questions.
 */
const buildPlanContext = (plan) => {
  if (!plan) return '';

  const itinerarySummary = (plan.itinerary || [])
    .map((d, i) => {
      const restaurants = Array.isArray(d.restaurants) && d.restaurants.length
        ? `Restaurants: ${d.restaurants.join(', ')}.`
        : '';
      return `Day ${i + 1} (${d.dayLabel || ''}):\n  Morning: ${d.morning}\n  Afternoon: ${d.afternoon}\n  Evening: ${d.evening}\n  ${d.tips ? `Tips: ${d.tips}` : ''}\n  ${restaurants}`.trim();
    })
    .join('\n\n');

  const hotelsSummary = (plan.hotels || [])
    .map(h => `  - ${h.name} (${h.price || h.estimated_price || 'N/A'}): ${h.description || ''}`)
    .join('\n');

  const travelSummary = (plan.travel?.options || [])
    .map(o => `  - ${o.mode} | Cost: ${o.estimated_cost} | Duration: ${o.estimated_travel_time}`)
    .join('\n');

  const budgetSummary = plan.budgetBreakdown
    ? Object.entries(plan.budgetBreakdown)
      .filter(([k]) => k !== 'Optimization Tips')
      .map(([cat, amt]) => `  - ${cat}: ${amt}`)
      .join('\n')
    : 'Not available';

  return `
=== GENERATED TRAVEL PLAN ===
Route: ${plan.source || 'Origin'} → ${plan.destination}
Duration: ${plan.days || plan.duration} days
Budget: ${plan.budget}
Nearest Airport: ${plan.travel?.nearest_airport || 'N/A'}

--- RECOMMENDATION ---
${plan.recommendation || 'None'}

--- ITINERARY ---
${itinerarySummary || 'Not available'}

--- HOTELS ---
${hotelsSummary || 'No hotel data'}

--- TRAVEL OPTIONS ---
${travelSummary || 'No travel options'}

--- BUDGET BREAKDOWN ---
${budgetSummary}
=== END OF PLAN ===
`.trim();
};

module.exports = {
  /**
   * POST /travel/chat
   * Handles conversational Q&A with full plan + conversation context
   */
  chat: async (req, res) => {
    try {
      const { input, plan } = req.body;
      const userId = req.user.id;

      if (!input) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Input is required',
        });
      }

      // 1. Retrieve last 10 chat messages for conversation continuity
      // If planId is provided, fetch interactions specific to that plan.
      const whereClause = { userId };
      if (plan && plan.id) {
        whereClause.metadata = { planId: plan.id };
      } else if (req.body.planId) {
        whereClause.metadata = { planId: req.body.planId };
      } else {
        // If no plan, we might just fetch the global chat
      }

      const pastInteractions = await Memory.findAll({
        where: whereClause,
        limit: 10,
        order: [['createdAt', 'DESC']]
      });

      // Build LangChain message history (oldest first)
      const conversationMessages = pastInteractions
        .reverse()
        .flatMap(m => [
          new HumanMessage(m.content),
          new AIMessage(m.metadata?.aiResponse || '')
        ]);

      // 2. Build full plan context string
      const planContext = buildPlanContext(plan);

      // 3. System prompt with plan context + instructions
      const systemPrompt = `You are a sophisticated AI Travel Agent and Luxury Concierge named TRAVEL AI.
Your role is to provide expert, context-aware travel advice, answer questions about the generated itinerary,
and engage in helpful general travel conversation.

${planContext ? `The user has an active travel plan. Use it as your primary reference:\n\n${planContext}` : 'No travel plan has been generated yet. Provide general travel advice.'}

Guidelines:
- If the user asks about their plan, refer to the exact details in the plan above.
- If the user asks a general travel question, answer helpfully and concisely.
- Maintain a premium, professional, and friendly tone at all times.
- Do not hallucinate plan details. Only use what's provided in the plan context.

STRICT FORMATTING STANDARDS FOR TRAVEL & TRANSIT INFORMATION:
Whenever you provide travel-related information such as train timings, bus schedules, flight details, itineraries, or transport guidance, ALWAYS return the response in a clean, professional, structured, and user-friendly format by strictly following these formatting rules:
1. Use proper section headings (e.g. #, ##, ###).
2. Add spacing between sections.
3. Convert raw bullet points into readable structured key-value content.
4. Use short paragraphs instead of long continuous text.
5. Format timings in a clean timeline/list style (e.g., "4:00 AM – 5:30 AM → Fast Train").
6. Use emojis only where relevant and minimal (e.g. 🚂, 🚖).
7. Highlight important information (like First Train, Last Train, Duration, Frequency) in bold.
8. Separate travel options clearly.
9. Add a final "Note" section detailing schedule disclaimers or monsoon warnings.
10. Never return messy inline text or repeated bullet symbols.`;

      // 4. Invoke LLM with full conversation history
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        ...conversationMessages,
        new HumanMessage(input)
      ]);

      const aiResponse = response.content;

      // 5. Persist the new exchange to Memory
      await Memory.create({
        id: uuidv4(),         // ← required: UUID primary key
        userId,
        content: input,
        metadata: {
          aiResponse,
          type: 'chat',
          planId: (plan && plan.id) || req.body.planId || null
        },
        createdAt: Math.floor(Date.now() / 1000),
        createdBy: userId
      });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Chat response generated',
        data: { response: aiResponse }
      });
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  /**
   * GET /travel/chat/history
   * Returns full ordered chat history for the current user
   */
  getChatHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const { planId } = req.query;

      const whereClause = { userId };
      if (planId) {
        whereClause.metadata = { planId };
      }

      const history = await Memory.findAll({
        where: whereClause,
        order: [['createdAt', 'ASC']]
      });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Chat history retrieved',
        data: history.map(h => ({
          id: h.id,
          userMessage: h.content,
          aiResponse: h.metadata?.aiResponse,
          createdAt: h.createdAt
        }))
      });
    } catch (error) {
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};
