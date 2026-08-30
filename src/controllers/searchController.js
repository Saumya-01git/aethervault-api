const db = require('../config/db');

// Search Endpoint (GET /api/search?q=&type=&owner=&starred=&limit=&offset=)
exports.search = async (req, res) => {
  try {
    const { q, type, starred, limit = 20, offset = 0 } = req.query;

    const searchResults = db.searchUserResources(req.user.id, {
      q,
      type,
      starred,
      limit,
      offset
    });

    return res.json({
      query: q || null,
      filters: { type: type || null, starred: starred || false },
      ...searchResults
    });
  } catch (error) {
    console.error('Search Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Search operation failed.' }
    });
  }
};

// Add Star / Favorite (POST /api/stars)
exports.starItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType and resourceId are required.' }
      });
    }

    const star = db.addStar(req.user.id, resourceType, resourceId);

    return res.status(201).json({
      message: 'Item starred successfully',
      star: star || { userId: req.user.id, resourceType, resourceId }
    });
  } catch (error) {
    console.error('Star Item Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to star item.' }
    });
  }
};

// Remove Star / Favorite (DELETE /api/stars)
exports.unstarItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType and resourceId are required.' }
      });
    }

    db.removeStar(req.user.id, resourceType, resourceId);

    return res.json({
      message: 'Item unstarred successfully',
      resourceId
    });
  } catch (error) {
    console.error('Unstar Item Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to unstar item.' }
    });
  }
};

// Get All Starred Items for Logged-In User (GET /api/stars)
exports.getStarred = async (req, res) => {
  try {
    const starredEntries = db.getStarsByUser(req.user.id);

    const starredFiles = [];
    const starredFolders = [];

    starredEntries.forEach(entry => {
      if (entry.resourceType === 'file') {
        const file = db.findFileById(entry.resourceId);
        if (file) starredFiles.push({ ...file, isStarred: true });
      } else if (entry.resourceType === 'folder') {
        const folder = db.findFolderById(entry.resourceId);
        if (folder) starredFolders.push({ ...folder, isStarred: true });
      }
    });

    return res.json({
      starredFiles,
      starredFolders
    });
  } catch (error) {
    console.error('Get Starred Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve starred items.' }
    });
  }
};
