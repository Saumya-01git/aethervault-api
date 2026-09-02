const express = require('express');
const router = express.Router();
const trashController = require('../controllers/trashController');
const authMiddleware = require('../middleware/authMiddleware');

// All trash and versioning routes require authentication
router.use(authMiddleware);

router.get('/trash', trashController.getTrash);
router.post('/trash/restore', trashController.restoreItem);
router.delete('/trash/purge', trashController.purgeItem);

// Version history endpoint
router.get('/files/:id/versions', trashController.getFileVersions);

module.exports = router;
