const db = require('../config/db');

// List Trash Items (GET /api/trash)
exports.getTrash = async (req, res) => {
  try {
    const trashItems = db.getTrashItems(req.user.id);
    return res.json(trashItems);
  } catch (error) {
    console.error('Get Trash Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve trash items.' }
    });
  }
};

// Restore Item from Trash (POST /api/trash/restore)
exports.restoreItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType and resourceId are required.' }
      });
    }

    const restored = db.restoreItem(resourceType, resourceId, req.user.id);

    if (!restored) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Item not found in trash or access denied.' }
      });
    }

    return res.json({
      message: 'Item restored successfully',
      restored
    });
  } catch (error) {
    console.error('Restore Item Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to restore item.' }
    });
  }
};

// Permanently Delete / Purge Item from Trash (DELETE /api/trash/purge)
exports.purgeItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType and resourceId are required.' }
      });
    }

    const purged = db.purgeItem(resourceType, resourceId, req.user.id);

    if (!purged) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Item not found in trash or access denied.' }
      });
    }

    return res.json({
      message: 'Item permanently deleted successfully',
      resourceId
    });
  } catch (error) {
    console.error('Purge Item Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to permanently delete item.' }
    });
  }
};

// Get File Version History (GET /api/files/:id/versions)
exports.getFileVersions = async (req, res) => {
  try {
    const { id } = req.params;
    const file = db.findFileById(id);

    if (!file || file.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'File not found or access denied.' }
      });
    }

    const versions = db.getFileVersions(id);
    return res.json({
      fileId: id,
      versions: versions.length > 0 ? versions : [
        {
          id: file.id,
          versionNumber: 1,
          storageKey: file.storageKey,
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt
        }
      ]
    });
  } catch (error) {
    console.error('Get Versions Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve file version history.' }
    });
  }
};
