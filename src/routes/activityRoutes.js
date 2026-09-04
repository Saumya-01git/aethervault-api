const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/authMiddleware');

// All activity routes require authentication
router.use(authMiddleware);

router.get('/activity', activityController.getActivityLogs);

module.exports = router;
