const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const users = [];
const files = [];
const folders = [];
const shares = [];
const linkShares = [];
const stars = [];
const fileVersions = [];
const activityLogs = [];

const STORE_PATH = path.join(__dirname, '../../data/store.json');

// Automatic Local Disk Store Persistence
const loadFromDisk = () => {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      if (raw.trim()) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.users)) users.push(...data.users);
        if (Array.isArray(data.files)) files.push(...data.files);
        if (Array.isArray(data.folders)) folders.push(...data.folders);
        if (Array.isArray(data.shares)) shares.push(...data.shares);
        if (Array.isArray(data.linkShares)) linkShares.push(...data.linkShares);
        if (Array.isArray(data.stars)) stars.push(...data.stars);
        if (Array.isArray(data.fileVersions)) fileVersions.push(...data.fileVersions);
        if (Array.isArray(data.activityLogs)) activityLogs.push(...data.activityLogs);
        console.log(`📦 Data persistent store loaded (${files.length} files, ${folders.length} folders, ${users.length} users)`);
      }
    }
  } catch (err) {
    console.error('Error loading store.json:', err);
  }
};

const saveToDisk = () => {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = { users, files, folders, shares, linkShares, stars, fileVersions, activityLogs };
    fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving store.json:', err);
  }
};

// Initial load from local disk
loadFromDisk();

// Optional Neon PostgreSQL Pool setup
let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('🐘 Neon PostgreSQL connected via DATABASE_URL');

    // Auto-create SQL Tables if missing & sync DB state to memory
    (async () => {
      try {
        const client = await pgPool.connect();
        try {
          await client.query(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT UNIQUE NOT NULL,
              password TEXT NOT NULL,
              role TEXT DEFAULT 'user',
              avatar_url TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS folders (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              parent_id TEXT,
              owner_id TEXT NOT NULL,
              is_deleted BOOLEAN DEFAULT FALSE,
              deleted_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS files (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              size_bytes BIGINT DEFAULT 0,
              mime_type TEXT,
              storage_key TEXT,
              download_url TEXT,
              folder_id TEXT,
              owner_id TEXT NOT NULL,
              is_deleted BOOLEAN DEFAULT FALSE,
              deleted_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS stars (
              id SERIAL PRIMARY KEY,
              user_id TEXT NOT NULL,
              resource_type TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(user_id, resource_type, resource_id)
            );

            CREATE TABLE IF NOT EXISTS activity_logs (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              action TEXT NOT NULL,
              resource_name TEXT,
              details TEXT,
              timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS shares (
              id TEXT PRIMARY KEY,
              resource_type TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              shared_with_email TEXT NOT NULL,
              permission TEXT DEFAULT 'read',
              owner_id TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
          `);
          console.log('🐘 Neon PostgreSQL database tables verified!');

          // Sync database contents into memory
          const uRes = await client.query('SELECT * FROM users');
          if (uRes.rows.length > 0) {
            users.length = 0;
            users.push(...uRes.rows.map(r => ({
              id: r.id, name: r.name, email: r.email, password: r.password, role: r.role, avatarUrl: r.avatar_url, createdAt: r.created_at, updatedAt: r.updated_at
            })));
          }

          const folRes = await client.query('SELECT * FROM folders WHERE is_deleted = false');
          if (folRes.rows.length > 0) {
            folders.length = 0;
            folders.push(...folRes.rows.map(r => ({
              id: r.id, name: r.name, parentId: r.parent_id, ownerId: r.owner_id, isDeleted: r.is_deleted, createdAt: r.created_at, updatedAt: r.updated_at
            })));
          }

          const filRes = await client.query('SELECT * FROM files WHERE is_deleted = false');
          if (filRes.rows.length > 0) {
            files.length = 0;
            files.push(...filRes.rows.map(r => ({
              id: r.id, name: r.name, sizeBytes: parseInt(r.size_bytes || 0), mimeType: r.mime_type, storageKey: r.storage_key, downloadUrl: r.download_url, folderId: r.folder_id, ownerId: r.owner_id, isDeleted: r.is_deleted, createdAt: r.created_at, updatedAt: r.updated_at
            })));
          }

          const starRes = await client.query('SELECT * FROM stars');
          if (starRes.rows.length > 0) {
            stars.length = 0;
            stars.push(...starRes.rows.map(r => ({
              userId: r.user_id, resourceType: r.resource_type, resourceId: r.resource_id, createdAt: r.created_at
            })));
          }

          console.log(`⚡ Neon PostgreSQL sync complete: ${users.length} users, ${folders.length} folders, ${files.length} files loaded!`);
        } finally {
          client.release();
        }
      } catch (tableErr) {
        console.error('Error initializing PostgreSQL tables:', tableErr.message);
      }
    })();
  } catch (err) {
    console.error('Failed to initialize PostgreSQL pool:', err);
  }
}

// SQL Helper Executers
const runPgQuery = async (query, params = []) => {
  if (!pgPool) return null;
  try {
    return await pgPool.query(query, params);
  } catch (err) {
    console.error('PostgreSQL Query Error:', err.message);
    return null;
  }
};

module.exports = {
  users,
  files,
  folders,
  shares,
  linkShares,
  stars,
  fileVersions,
  activityLogs,

  // Audit Activity Logging
  logActivity: (userId, action, resourceName = '', details = '') => {
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      userId,
      action,
      resourceName,
      details,
      timestamp: new Date().toISOString()
    };
    activityLogs.unshift(entry);
    saveToDisk();

    runPgQuery(
      'INSERT INTO activity_logs (id, user_id, action, resource_name, details, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [entry.id, entry.userId, entry.action, entry.resourceName, entry.details, entry.timestamp]
    );

    return entry;
  },

  getActivityLogs: (userId, limit = 50) => {
    return activityLogs.filter(log => log.userId === userId).slice(0, limit);
  },

  // User operations
  findUserByEmail: (email) => users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  findUserById: (id) => users.find(u => u.id === id),
  createUser: (userData) => {
    users.push(userData);
    saveToDisk();

    runPgQuery(
      'INSERT INTO users (id, name, email, password, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING',
      [userData.id, userData.name, userData.email, userData.password, userData.role || 'user', userData.createdAt, userData.updatedAt]
    );

    return userData;
  },
  updateUser: (id, updates) => {
    const user = users.find(u => u.id === id);
    if (user) {
      Object.assign(user, updates, { updatedAt: new Date().toISOString() });
      saveToDisk();

      runPgQuery(
        'UPDATE users SET name = $1, avatar_url = $2, updated_at = $3 WHERE id = $4',
        [user.name, user.avatarUrl, user.updatedAt, id]
      );
    }
    return user;
  },

  // File operations
  createFile: (fileData) => {
    files.push(fileData);
    if (fileData.ownerId) {
      module.exports.logActivity(fileData.ownerId, 'UPLOAD_FILE', fileData.name, `Uploaded file (${(fileData.sizeBytes / 1024).toFixed(1)} KB)`);
    }
    saveToDisk();

    runPgQuery(
      'INSERT INTO files (id, name, size_bytes, mime_type, storage_key, download_url, folder_id, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [fileData.id, fileData.name, fileData.sizeBytes || 0, fileData.mimeType, fileData.storageKey, fileData.downloadUrl, fileData.folderId || null, fileData.ownerId, fileData.createdAt, fileData.updatedAt]
    );

    return fileData;
  },
  findFileById: (id) => files.find(f => f.id === id && !f.isDeleted),
  findFilesByOwner: (ownerId) => files.filter(f => f.ownerId === ownerId && !f.isDeleted),
  findFilesInFolder: (folderId, ownerId) => files.filter(f => f.folderId === folderId && f.ownerId === ownerId && !f.isDeleted),
  updateFile: (id, updates) => {
    const file = files.find(f => f.id === id);
    if (file) {
      Object.assign(file, updates, { updatedAt: new Date().toISOString() });
      saveToDisk();

      runPgQuery(
        'UPDATE files SET name = $1, folder_id = $2, updated_at = $3 WHERE id = $4',
        [file.name, file.folderId || null, file.updatedAt, id]
      );
    }
    return file;
  },
  softDeleteFile: (id) => {
    const file = files.find(f => f.id === id);
    if (file) {
      file.isDeleted = true;
      file.deletedAt = new Date().toISOString();
      module.exports.logActivity(file.ownerId, 'DELETE_FILE', file.name, 'Moved file to Trash');
      saveToDisk();

      runPgQuery(
        'UPDATE files SET is_deleted = TRUE, deleted_at = $1 WHERE id = $2',
        [file.deletedAt, id]
      );
    }
    return file;
  },

  // Folder operations
  createFolder: (folderData) => {
    folders.push(folderData);
    if (folderData.ownerId) {
      module.exports.logActivity(folderData.ownerId, 'CREATE_FOLDER', folderData.name, 'Created new folder');
    }
    saveToDisk();

    runPgQuery(
      'INSERT INTO folders (id, name, parent_id, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [folderData.id, folderData.name, folderData.parentId || null, folderData.ownerId, folderData.createdAt, folderData.updatedAt]
    );

    return folderData;
  },
  findFolderById: (id) => folders.find(f => f.id === id && !f.isDeleted),
  findSubfolders: (parentId, ownerId) => folders.filter(f => f.parentId === parentId && f.ownerId === ownerId && !f.isDeleted),
  findFoldersByOwner: (ownerId) => folders.filter(f => f.ownerId === ownerId && !f.isDeleted),
  updateFolder: (id, updates) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      Object.assign(folder, updates, { updatedAt: new Date().toISOString() });
      saveToDisk();

      runPgQuery(
        'UPDATE folders SET name = $1, parent_id = $2, updated_at = $3 WHERE id = $4',
        [folder.name, folder.parentId || null, folder.updatedAt, id]
      );
    }
    return folder;
  },
  softDeleteFolder: (id) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      folder.isDeleted = true;
      folder.deletedAt = new Date().toISOString();
      module.exports.logActivity(folder.ownerId, 'DELETE_FOLDER', folder.name, 'Moved folder to Trash');

      files.filter(f => f.folderId === id).forEach(f => {
        f.isDeleted = true;
        f.deletedAt = new Date().toISOString();
      });

      folders.filter(f => f.parentId === id).forEach(f => {
        module.exports.softDeleteFolder(f.id);
      });
      saveToDisk();

      runPgQuery(
        'UPDATE folders SET is_deleted = TRUE, deleted_at = $1 WHERE id = $2',
        [folder.deletedAt, id]
      );
      runPgQuery(
        'UPDATE files SET is_deleted = TRUE, deleted_at = $1 WHERE folder_id = $2',
        [folder.deletedAt, id]
      );
    }
    return folder;
  },

  // Breadcrumbs helper
  getBreadcrumbs: (folderId, ownerId) => {
    const path = [];
    let currentId = folderId;

    while (currentId) {
      const folder = folders.find(f => f.id === currentId && f.ownerId === ownerId && !f.isDeleted);
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }

    return path;
  },

  // Per-User Share operations (ACL)
  createShare: (shareData) => {
    shares.push(shareData);
    saveToDisk();

    runPgQuery(
      'INSERT INTO shares (id, resource_type, resource_id, shared_with_email, permission, owner_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [shareData.id, shareData.resourceType, shareData.resourceId, shareData.sharedWithEmail, shareData.permission || 'read', shareData.ownerId, shareData.createdAt]
    );

    return shareData;
  },
  findSharesByResource: (resourceType, resourceId) => shares.filter(s => s.resourceType === resourceType && s.resourceId === resourceId),
  findShareById: (id) => shares.find(s => s.id === id),
  deleteShare: (id) => {
    const index = shares.findIndex(s => s.id === id);
    if (index !== -1) {
      const removed = shares.splice(index, 1)[0];
      saveToDisk();

      runPgQuery('DELETE FROM shares WHERE id = $1', [id]);
      return removed;
    }
    return null;
  },

  // Public Link Share operations
  createLinkShare: (linkData) => {
    linkShares.push(linkData);
    saveToDisk();
    return linkData;
  },
  findLinkShareByToken: (token) => linkShares.find(l => l.token === token),
  findLinkShareById: (id) => linkShares.find(l => l.id === id),
  deleteLinkShare: (id) => {
    const index = linkShares.findIndex(l => l.id === id);
    if (index !== -1) {
      const removed = linkShares.splice(index, 1)[0];
      saveToDisk();
      return removed;
    }
    return null;
  },

  // Star / Favorite operations
  addStar: (userId, resourceType, resourceId) => {
    const exists = stars.some(s => s.userId === userId && s.resourceType === resourceType && s.resourceId === resourceId);
    if (!exists) {
      const entry = { userId, resourceType, resourceId, createdAt: new Date().toISOString() };
      stars.push(entry);
      saveToDisk();

      runPgQuery(
        'INSERT INTO stars (user_id, resource_type, resource_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [userId, resourceType, resourceId, entry.createdAt]
      );

      return entry;
    }
    return null;
  },
  removeStar: (userId, resourceType, resourceId) => {
    const index = stars.findIndex(s => s.userId === userId && s.resourceType === resourceType && s.resourceId === resourceId);
    if (index !== -1) {
      const removed = stars.splice(index, 1)[0];
      saveToDisk();

      runPgQuery(
        'DELETE FROM stars WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3',
        [userId, resourceType, resourceId]
      );

      return removed;
    }
    return null;
  },
  getStarsByUser: (userId) => stars.filter(s => s.userId === userId),

  attachStarState: (userId, files = [], folders = []) => {
    const userStars = stars.filter(s => s.userId === userId);
    const starredIds = new Set(userStars.map(s => s.resourceId));

    const decoratedFiles = files.map(f => ({
      ...f,
      isStarred: starredIds.has(f.id)
    }));

    const decoratedFolders = folders.map(f => ({
      ...f,
      isStarred: starredIds.has(f.id)
    }));

    return { files: decoratedFiles, folders: decoratedFolders };
  },

  // Search & Filter helper with pagination
  searchUserResources: (ownerId, { q, type, starred, limit = 20, offset = 0 }) => {
    const userStarredIds = new Set(stars.filter(s => s.userId === ownerId).map(s => s.resourceId));

    let matchedFiles = files.filter(f => f.ownerId === ownerId && !f.isDeleted);
    let matchedFolders = folders.filter(f => f.ownerId === ownerId && !f.isDeleted);

    if (q && q.trim() !== '') {
      const queryLower = q.trim().toLowerCase();
      matchedFiles = matchedFiles.filter(f => f.name.toLowerCase().includes(queryLower));
      matchedFolders = matchedFolders.filter(f => f.name.toLowerCase().includes(queryLower));
    }

    if (type) {
      const typeLower = type.toLowerCase();
      matchedFiles = matchedFiles.filter(f => f.mimeType && f.mimeType.toLowerCase().includes(typeLower));
      if (typeLower !== 'folder') {
        matchedFolders = [];
      }
    }

    if (starred === 'true' || starred === true) {
      matchedFiles = matchedFiles.filter(f => userStarredIds.has(f.id));
      matchedFolders = matchedFolders.filter(f => userStarredIds.has(f.id));
    }

    const resultsFiles = matchedFiles.map(f => ({ ...f, isStarred: userStarredIds.has(f.id) }));
    const resultsFolders = matchedFolders.map(f => ({ ...f, isStarred: userStarredIds.has(f.id) }));

    return {
      files: resultsFiles.slice(Number(offset), Number(offset) + Number(limit)),
      folders: resultsFolders.slice(Number(offset), Number(offset) + Number(limit)),
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        totalFiles: resultsFiles.length,
        totalFolders: resultsFolders.length
      }
    };
  },

  // Trash & Restore Operations
  getTrashItems: (ownerId) => {
    const deletedFiles = files.filter(f => f.ownerId === ownerId && f.isDeleted);
    const deletedFolders = folders.filter(f => f.ownerId === ownerId && f.isDeleted);
    return { files: deletedFiles, folders: deletedFolders };
  },

  restoreItem: (resourceType, resourceId, ownerId) => {
    if (resourceType === 'file') {
      const file = files.find(f => f.id === resourceId && f.ownerId === ownerId && f.isDeleted);
      if (file) {
        file.isDeleted = false;
        delete file.deletedAt;
        saveToDisk();

        runPgQuery(
          'UPDATE files SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1',
          [resourceId]
        );

        return file;
      }
    } else if (resourceType === 'folder') {
      const folder = folders.find(f => f.id === resourceId && f.ownerId === ownerId && f.isDeleted);
      if (folder) {
        folder.isDeleted = false;
        delete folder.deletedAt;
        files.filter(f => f.folderId === resourceId).forEach(f => {
          f.isDeleted = false;
          delete f.deletedAt;
        });
        folders.filter(f => f.parentId === resourceId).forEach(f => {
          module.exports.restoreItem('folder', f.id, ownerId);
        });
        saveToDisk();

        runPgQuery(
          'UPDATE folders SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1',
          [resourceId]
        );
        runPgQuery(
          'UPDATE files SET is_deleted = FALSE, deleted_at = NULL WHERE folder_id = $1',
          [resourceId]
        );

        return folder;
      }
    }
    return null;
  },

  purgeItem: (resourceType, resourceId, ownerId) => {
    if (resourceType === 'file') {
      const idx = files.findIndex(f => f.id === resourceId && f.ownerId === ownerId && f.isDeleted);
      if (idx !== -1) {
        const deleted = files.splice(idx, 1)[0];
        saveToDisk();

        runPgQuery('DELETE FROM files WHERE id = $1', [resourceId]);
        return deleted;
      }
    } else if (resourceType === 'folder') {
      const idx = folders.findIndex(f => f.id === resourceId && f.ownerId === ownerId && f.isDeleted);
      if (idx !== -1) {
        const deleted = folders.splice(idx, 1)[0];
        for (let i = files.length - 1; i >= 0; i--) {
          if (files[i].folderId === resourceId) files.splice(i, 1);
        }
        saveToDisk();

        runPgQuery('DELETE FROM files WHERE folder_id = $1', [resourceId]);
        runPgQuery('DELETE FROM folders WHERE id = $1', [resourceId]);
        return deleted;
      }
    }
    return null;
  },

  // File Versioning Operations
  getFileVersions: (fileId) => fileVersions.filter(v => v.fileId === fileId),
  addFileVersion: (versionData) => {
    fileVersions.push(versionData);
    saveToDisk();
    return versionData;
  }
};
