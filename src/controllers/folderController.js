const crypto = require('crypto');
const db = require('../config/db');
const storageService = require('../config/storage');

// Create Folder
exports.createFolder = async (req, res) => {
  try {
    const { name, parentId } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Folder name is required.' }
      });
    }

    // Verify parent folder if parentId provided
    if (parentId) {
      const parentFolder = db.findFolderById(parentId);
      if (!parentFolder || parentFolder.ownerId !== req.user.id) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Parent folder not found.' }
        });
      }
    }

    const folderId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

    const newFolder = {
      id: folderId,
      name: name.trim(),
      ownerId: req.user.id,
      parentId: parentId || null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createFolder(newFolder);

    return res.status(201).json({
      message: 'Folder created successfully',
      folder: newFolder
    });
  } catch (error) {
    console.error('Create Folder Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to create folder.' }
    });
  }
};

// Get Root Folders & Files or All Folders
exports.getFolders = async (req, res) => {
  try {
    const rawFolders = db.findSubfolders(null, req.user.id);
    const rawFiles = db.findFilesInFolder(null, req.user.id);
    const filesWithUrls = storageService.attachDownloadUrl(rawFiles);
    const decorated = db.attachStarState(req.user.id, filesWithUrls, rawFolders);

    const allUserFiles = db.findFilesByOwner(req.user.id);
    const totalBytes = allUserFiles.reduce((acc, f) => acc + parseInt(f.sizeBytes || 0), 0);

    return res.json({
      folders: decorated.folders,
      files: decorated.files,
      totalBytes
    });
  } catch (error) {
    console.error('Get Folders Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve folders.' }
    });
  }
};

// Get Folder Details + Children + Breadcrumbs
exports.getFolderById = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = db.findFolderById(id);

    if (!folder || folder.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found or access denied.' }
      });
    }

    const rawSubfolders = db.findSubfolders(id, req.user.id);
    const rawFiles = db.findFilesInFolder(id, req.user.id);
    const filesWithUrls = storageService.attachDownloadUrl(rawFiles);
    const decorated = db.attachStarState(req.user.id, filesWithUrls, rawSubfolders);
    const path = db.getBreadcrumbs(id, req.user.id);

    const allUserFiles = db.findFilesByOwner(req.user.id);
    const totalBytes = allUserFiles.reduce((acc, f) => acc + parseInt(f.sizeBytes || 0), 0);

    return res.json({
      folder,
      children: {
        folders: decorated.folders,
        files: decorated.files
      },
      path,
      totalBytes
    });
  } catch (error) {
    console.error('Get Folder By ID Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve folder details.' }
    });
  }
};

// Rename or Move Folder (PATCH)
exports.updateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId } = req.body;

    const folder = db.findFolderById(id);

    if (!folder || folder.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found or access denied.' }
      });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (parentId !== undefined) {
      // Prevent moving folder into itself
      if (parentId === id) {
        return res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'Cannot move folder into itself.' }
        });
      }
      updates.parentId = parentId;
    }

    const updatedFolder = db.updateFolder(id, updates);

    return res.json({
      message: 'Folder updated successfully',
      folder: updatedFolder
    });
  } catch (error) {
    console.error('Update Folder Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to update folder.' }
    });
  }
};

// Soft Delete Folder
exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = db.findFolderById(id);

    if (!folder || folder.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found or access denied.' }
      });
    }

    db.softDeleteFolder(id);

    return res.json({
      message: 'Folder moved to trash successfully',
      folderId: id
    });
  } catch (error) {
    console.error('Delete Folder Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to delete folder.' }
    });
  }
};
