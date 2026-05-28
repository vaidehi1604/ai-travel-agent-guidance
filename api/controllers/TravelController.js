const { travelGraph } = require('../agents/travelGraph');
const { saveToMemory } = require('../agents/travelGraph/nodes/memoryNode');
const TravelPlan = require('../model/TravelPlan');
const { HTTP_STATUS_CODE, uuidv4 } = require('../../config/constants');
const { Op } = require('sequelize');
const { preferenceNode } = require('../agents/travelGraph/nodes/preferenceNode');

const normalizeStringField = (value, fallback = 'Unknown') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return (
      value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'number') return String(item);
          if (item && typeof item === 'object') {
            return item.name || item.city || JSON.stringify(item);
          }
          return '';
        })
        .filter(Boolean)
        .join(', ') || fallback
    );
  }
  if (value && typeof value === 'object') {
    return (
      value.name || value.city || value.destination || JSON.stringify(value)
    );
  }
  return fallback;
};

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

      // 1. Run Preference Agent first to extract intent details (destination, days, budget)
      const initialPrefState = {
        input,
        userId,
        userCity: req.user.city,
        status: 'started',
      };
      
      const prefState = await preferenceNode(initialPrefState);
      
      if (prefState.error || !prefState.intent || !prefState.intent.destination) {
        console.warn('Preference node failed to extract intent, falling back to full graph invoke');
      } else {
        const intent = prefState.intent;
        
        // 2. Search database for an existing cached plan matching place, days, and budget
        const cachedPlan = await TravelPlan.findOne({
          where: {
            destination: { [Op.iLike]: intent.destination },
            days: intent.days || 3,
            budget: intent.budget || 0,
            isDeleted: false
          },
          order: [['createdAt', 'DESC']]
        });
        
        if (cachedPlan) {
          console.log(`✨ Cache HIT! Reusing plan: ${cachedPlan.id} for user: ${userId}`);
          const planId = uuidv4();
          
          const travelPlan = await TravelPlan.create({
            id: planId,
            userId,
            source: cachedPlan.source,
            destination: cachedPlan.destination,
            budget: cachedPlan.budget,
            days: cachedPlan.days,
            persons: intent.persons || 2,
            weatherSummary: cachedPlan.weatherSummary,
            itinerary: cachedPlan.itinerary,
            bookingLinks: cachedPlan.bookingLinks,
            hotels: cachedPlan.hotels,
            travel: cachedPlan.travel,
            budgetBreakdown: cachedPlan.budgetBreakdown,
            packages: cachedPlan.packages,
            areas: cachedPlan.areas,
            createdBy: userId,
          });

          // Save to Memory (for future context)
          const memoryContent = `User planned a trip for ${intent.persons || 2} persons from ${travelPlan.source} to ${travelPlan.destination} for ${travelPlan.days} days with a budget of ${travelPlan.budget}. (Restored from cache)`;
          await saveToMemory(userId, memoryContent, { planId });

          return res.status(HTTP_STATUS_CODE.OK).json({
            status: HTTP_STATUS_CODE.OK,
            message: 'Travel plan generated successfully (Restored from Cache)',
            data: {
              plan: travelPlan,
              areas: travelPlan.areas,
              travel: travelPlan.travel,
              budget: travelPlan.budgetBreakdown,
              hotels: travelPlan.hotels,
              packages: travelPlan.packages,
            },
          });
        }
      }

      // 3. Cache Miss: Run entire LangGraph workflow
      const finalState = await travelGraph.invoke(initialPrefState);

      if (finalState.error) {
        return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
          status: HTTP_STATUS_CODE.SERVER_ERROR,
          message: 'Graph execution failed',
          error: finalState.error,
        });
      }

      // Guard: itinerary must exist (allowNull: false in DB schema)
      if (!finalState.itinerary || (Array.isArray(finalState.itinerary) && finalState.itinerary.length === 0)) {
        console.error('Graph completed but itinerary is missing:', JSON.stringify(finalState.status));
        return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
          status: HTTP_STATUS_CODE.SERVER_ERROR,
          message: 'Travel plan generation incomplete — please try again.',
          error: 'Itinerary was not generated. The AI may have timed out or returned an invalid response.',
        });
      }

      // Save to Database
      const planId = uuidv4();
      const source = normalizeStringField(finalState.intent.source, 'Unknown');
      const destination = normalizeStringField(
        finalState.intent.destination,
        'Unknown'
      );

      const travelPlan = await TravelPlan.create({
        id: planId,
        userId,
        source: normalizeStringField(finalState.intent?.source, req.user?.city || 'Unknown'),
        destination: normalizeStringField(finalState.intent?.destination, 'Unknown'),
        budget: finalState.intent?.budget || 0,
        days: finalState.intent?.days || 3,
        persons: finalState.intent?.persons || 2,
        weatherSummary: finalState.weather ? JSON.stringify(finalState.weather) : null,
        itinerary: finalState.itinerary || [],
        bookingLinks: finalState.links || null,
        hotels: finalState.hotels || null,
        travel: finalState.travel || null,
        budgetBreakdown: finalState.budget || null,
        packages: finalState.packages || null,
        areas: finalState.areas || null,
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
          areas: finalState.areas,
          travel: finalState.travel,
          budget: finalState.budget,
          hotels: finalState.hotels,
          packages: finalState.packages,
        },
      });
    } catch (error) {
      console.error('Travel plan error:', error);

      if (error.name === 'SequelizeValidationError') {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Validation failed while saving travel plan',
          error: error.message,
          details: error.errors?.map((e) => ({
            path: e.path,
            message: e.message,
          })),
        });
      }

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
      const userEmail = req.user.email;

      const history = await TravelPlan.findAll({
        where: {
          [Op.or]: [
            { userId },
            { sharedWith: { [Op.contains]: [userId] } },
            { sharedWith: { [Op.contains]: [userEmail] } }
          ],
          isDeleted: false,
        },
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

  /**
   * PUT /travel/plan/:id
   * Updates itinerary, comments, or sharedWith for a travel plan
   */
  updatePlan: async (req, res) => {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;
      const planId = req.params.id;
      const { itinerary, comments, sharedWith } = req.body;

      if (!planId) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Plan id is required',
        });
      }

      // Check if the user is owner or collaborator
      const travelPlan = await TravelPlan.findOne({
        where: {
          id: planId,
          [Op.or]: [
            { userId },
            { sharedWith: { [Op.contains]: [userId] } },
            { sharedWith: { [Op.contains]: [userEmail] } }
          ],
          isDeleted: false,
        },
      });

      if (!travelPlan) {
        return res.status(HTTP_STATUS_CODE.NOT_FOUND).json({
          status: HTTP_STATUS_CODE.NOT_FOUND,
          message: 'Travel plan not found or access denied',
        });
      }

      const updates = {};
      if (itinerary !== undefined) updates.itinerary = itinerary;
      if (comments !== undefined) updates.comments = comments;
      
      // Only the owner can share with others
      if (sharedWith !== undefined && travelPlan.userId === userId) {
        updates.sharedWith = sharedWith;
      }

      updates.updatedAt = Math.floor(Date.now() / 1000);
      updates.updatedBy = userId;

      await travelPlan.update(updates);

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Travel plan updated successfully',
        data: travelPlan,
      });
    } catch (error) {
      console.error('Update travel plan error:', error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: 'Internal server error',
        error: error.message,
      });
    }
  },
};
