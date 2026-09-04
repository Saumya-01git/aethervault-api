const db = require('../config/db');

// Get User Audit / Activity Logs (GET /api/activity)
exports.getActivityLogs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = db.getActivityLogs(req.user.id, limit);

    return res.json({
      logs
    });
  } catch (error) {
    console.error('Get Activity Logs Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve activity logs.' }
    });
  }
};
