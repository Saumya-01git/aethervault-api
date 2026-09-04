const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const folderRoutes = require('./routes/folderRoutes');
const shareRoutes = require('./routes/shareRoutes');
const searchRoutes = require('./routes/searchRoutes');
const trashRoutes = require('./routes/trashRoutes');
const activityRoutes = require('./routes/activityRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin or any origin in production
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// Serve uploaded files statically in local dev
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check (Public route)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AetherVault Backend API',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api', searchRoutes);
app.use('/api', trashRoutes);
app.use('/api', activityRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 AetherVault Backend API running on port ${PORT}`);
});
