const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const authMiddleware = require('../middleware/authMiddleware');

// All search & star routes require authentication
router.use(authMiddleware);

// Search endpoint
router.get('/search', searchController.search);

// Stars / Favorites endpoints
router.post('/stars', searchController.starItem);
router.delete('/stars', searchController.unstarItem);
router.get('/stars', searchController.getStarred);

module.exports = router;
