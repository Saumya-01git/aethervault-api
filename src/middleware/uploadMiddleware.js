const multer = require('multer');
const path = require('path');
const storageService = require('../config/storage');

// Configure disk storage for Multer
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storageService.uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// File filter (allow images, documents, audio, video, archives)
const fileFilter = (req, file, cb) => {
  // Allow all standard mime types
  cb(null, true);
};

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for local dev uploads
  },
  fileFilter
});

module.exports = upload;
