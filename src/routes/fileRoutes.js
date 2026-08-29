const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// All file routes require authentication
router.use(authMiddleware);

router.post('/init', fileController.initUpload);
router.post('/upload', upload.single('file'), fileController.uploadFile);
router.post('/complete', fileController.completeUpload);
router.get('/', fileController.listFiles);
router.get('/:id', fileController.getFile);
router.patch('/:id', fileController.updateFile);
router.delete('/:id', fileController.deleteFile);

module.exports = router;
