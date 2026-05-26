const express = require('express');
const router = express.Router();
const travelController = require('../controllers/TravelController');
const chatController = require('../controllers/ChatController');
const authMiddleware = require('../middleware/authMiddleware');

// All travel routes are protected
router.use(authMiddleware);

router.post('/plan', travelController.generatePlan);
router.get('/history', travelController.getHistory);
router.delete('/history/:id', travelController.deleteHistory);

// Chat routes
router.post('/chat', chatController.chat);
router.get('/chat/history', chatController.getChatHistory);

module.exports = router;
