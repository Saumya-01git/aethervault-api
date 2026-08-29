const crypto = require('crypto');
const db = require('../config/db');
const storageService = require('../config/storage');

// Initialize File Upload (Presigned URL / Multipart init)
exports.initUpload = async (req, res) => {
  try {
    const { name, mimeType, sizeBytes, folderId } = req.body;

    if (!name || !sizeBytes) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'File name and sizeBytes are required.' }
      });
    }

    const fileId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const storageKey = `tenants/${req.user.id}/files/${fileId}-${name}`;

    const newFile = {
      id: fileId,
      name,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: Number(sizeBytes),
      storageKey,
      ownerId: req.user.id,
      folderId: folderId || null,
      status: 'uploading',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createFile(newFile);

    return res.status(201).json({
      fileId,
      storageKey,
      upload: {
        method: 'POST',
        uploadUrl: `http://localhost:${process.env.PORT || 8080}/api/files/upload`
      }
    });
  } catch (error) {
    console.error('Init Upload Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to initialize file upload.' }
    });
  }
};

// Upload File Direct (Multipart / Multer)
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No file was uploaded.' }
      });
    }

    const fileId = req.body.fileId || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
    const folderId = req.body.folderId || null;

    let fileRecord = db.findFileById(fileId);

    if (fileRecord) {
      db.updateFile(fileId, {
        storageKey: req.file.filename,
        status: 'ready',
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size
      });
    } else {
      fileRecord = {
        id: fileId,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storageKey: req.file.filename,
        ownerId: req.user.id,
        folderId: folderId,
        status: 'ready',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.createFile(fileRecord);
    }

    const downloadUrl = await storageService.getSignedUrl(req.file.filename);

    return res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        ...fileRecord,
        downloadUrl
      }
    });
  } catch (error) {
    console.error('Upload File Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to upload file.' }
    });
  }
};

// Complete Upload (Finalize status after cloud presigned upload)
exports.completeUpload = async (req, res) => {
  try {
    const { fileId } = req.body;
    const file = db.findFileById(fileId);

    if (!file) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'File not found.' }
      });
    }

    db.updateFile(fileId, { status: 'ready' });

    return res.json({
      message: 'File upload finalized successfully',
      fileId
    });
  } catch (error) {
    console.error('Complete Upload Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to complete upload.' }
    });
  }
};

// Get File Details & Download Signed URL
exports.getFile = async (req, res) => {
  try {
    const file = db.findFileById(req.params.id);

    if (!file || file.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'File not found or access denied.' }
      });
    }

    const downloadUrl = await storageService.getSignedUrl(file.storageKey);

    return res.json({
      file: {
        ...file,
        downloadUrl
      }
    });
  } catch (error) {
    console.error('Get File Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve file.' }
    });
  }
};

// List User Files
exports.listFiles = async (req, res) => {
  try {
    const files = db.findFilesByOwner(req.user.id);
    return res.json({ files });
  } catch (error) {
    console.error('List Files Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to list files.' }
    });
  }
};
