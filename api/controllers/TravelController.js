const { travelGraph } = require('../agents/travelGraph');
const { saveToMemory } = require('../agents/travelGraph/nodes/memoryNode');
const TravelPlan = require('../model/TravelPlan');
const { HTTP_STATUS_CODE, uuidv4 } = require('../../config/constants');

module.exports = {
  /**
   * POST /travel/plan
   * Generates a travel plan using LangGraph
   */
  generatePlan: async (req, res) => {
    try {
      const { input } = req.body;
      const userId = req.user.id;

      if (!input) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Input is required',
        });
      }

      // console.log(`Starting travel plan for user: ${userId}`);

      // Run LangGraph
      const initialState = {
        input,
        userId,
        userCity: req.user.city,
        status: 'started',
      };

      const finalState = await travelGraph.invoke(initialState);

      if (finalState.error) {
        return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
          status: HTTP_STATUS_CODE.SERVER_ERROR,
          message: 'Graph execution failed',
          error: finalState.error,
        });
      }

      // Save to Database
      const planId = uuidv4();
      const travelPlan = await TravelPlan.create({
        id: planId,
        userId,
        source: finalState.intent.source || 'Unknown',
        destination: finalState.intent.destination || 'Unknown',
        budget: finalState.intent.budget || 0,
        days: finalState.intent.days || 3,
        weatherSummary: JSON.stringify(finalState.weather),
        itinerary: finalState.itinerary,
        bookingLinks: finalState.links,
        hotels: finalState.hotels,
        travel: finalState.travel,
        budgetBreakdown: finalState.budget,
        packages: finalState.packages,
        createdBy: userId,
      });

      // Save to Memory (for future context)
      const memoryContent = `User planned a trip for ${finalState.intent.persons || 2} persons from ${travelPlan.source} to ${travelPlan.destination} for ${travelPlan.days} days with a budget of ${travelPlan.budget}.`;
      await saveToMemory(userId, memoryContent, { planId });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Travel plan generated successfully',
        data: {
          plan: travelPlan,
          // Including these explicitly in data for the immediate response
          areas: finalState.areas,
          travel: finalState.travel,
          budget: finalState.budget,
          hotels: finalState.hotels,
          packages: finalState.packages,
        },
      });
    } catch (error) {
      console.error('Travel plan error:', error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message,
      });
    }
  },

  /**
   * GET /travel/history
   * Retrieves past travel plans
   */
  getHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const history = await TravelPlan.findAll({
        where: { userId, isDeleted: false },
        order: [['createdAt', 'DESC']],
      });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'History retrieved successfully',
        data: history,
      });
    } catch (error) {
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message,
      });
    }
  },

  /**
   * DELETE /travel/history/:id
   * Soft delete a travel history entry
   */
  deleteHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const planId = req.params.id;

      if (!planId) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'History item id is required',
          data: '',
          error: '',
        });
      }

      const travelPlan = await TravelPlan.findOne({
        where: {
          id: planId,
          userId,
          isDeleted: false,
        },
      });

      if (!travelPlan) {
        return res.status(HTTP_STATUS_CODE.NOT_FOUND).json({
          status: HTTP_STATUS_CODE.NOT_FOUND,
          message: 'History item not found',
          data: '',
          error: '',
        });
      }

      await travelPlan.update({
        isDeleted: true,
        deletedAt: Math.floor(Date.now() / 1000),
        deletedBy: userId,
      });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'History item deleted successfully',
        data: '',
        error: '',
      });
    } catch (error) {
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message,
      });
    }
  },
};
