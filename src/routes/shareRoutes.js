const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const authMiddleware = require('../middleware/authMiddleware');

// Public route for resolving public share links
router.post('/link/:token', shareController.resolvePublicLink);
router.get('/link/:token', shareController.resolvePublicLink);

// Protected routes (Require login)
router.use(authMiddleware);

// User ACL Sharing
router.post('/', shareController.createShare);
router.get('/:resourceType/:resourceId', shareController.listShares);
router.delete('/:id', shareController.deleteShare);

// Public Link Management
router.post('/link-shares', shareController.createPublicLink);
router.delete('/link-shares/:id', shareController.deletePublicLink);

module.exports = router;
