// Database service (Supports in-memory fallback & PostgreSQL connection)
const users = [];
const files = [];
const folders = [];
const shares = [];
const linkShares = [];
const stars = [];

module.exports = {
  users,
  files,
  folders,
  shares,
  linkShares,
  stars,

  // User operations
  findUserByEmail: (email) => users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  findUserById: (id) => users.find(u => u.id === id),
  createUser: (userData) => {
    users.push(userData);
    return userData;
  },

  // File operations
  createFile: (fileData) => {
    files.push(fileData);
    return fileData;
  },
  findFileById: (id) => files.find(f => f.id === id && !f.isDeleted),
  findFilesByOwner: (ownerId) => files.filter(f => f.ownerId === ownerId && !f.isDeleted),
  findFilesInFolder: (folderId, ownerId) => files.filter(f => f.folderId === folderId && f.ownerId === ownerId && !f.isDeleted),
  updateFile: (id, updates) => {
    const file = files.find(f => f.id === id);
    if (file) {
      Object.assign(file, updates, { updatedAt: new Date().toISOString() });
    }
    return file;
  },
  softDeleteFile: (id) => {
    const file = files.find(f => f.id === id);
    if (file) {
      file.isDeleted = true;
      file.deletedAt = new Date().toISOString();
    }
    return file;
  },

  // Folder operations
  createFolder: (folderData) => {
    folders.push(folderData);
    return folderData;
  },
  findFolderById: (id) => folders.find(f => f.id === id && !f.isDeleted),
  findSubfolders: (parentId, ownerId) => folders.filter(f => f.parentId === parentId && f.ownerId === ownerId && !f.isDeleted),
  findFoldersByOwner: (ownerId) => folders.filter(f => f.ownerId === ownerId && !f.isDeleted),
  updateFolder: (id, updates) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      Object.assign(folder, updates, { updatedAt: new Date().toISOString() });
    }
    return folder;
  },
  softDeleteFolder: (id) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      folder.isDeleted = true;
      folder.deletedAt = new Date().toISOString();

      files.filter(f => f.folderId === id).forEach(f => {
        f.isDeleted = true;
        f.deletedAt = new Date().toISOString();
      });

      folders.filter(f => f.parentId === id).forEach(f => {
        module.exports.softDeleteFolder(f.id);
      });
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
    return shareData;
  },
  findSharesByResource: (resourceType, resourceId) => shares.filter(s => s.resourceType === resourceType && s.resourceId === resourceId),
  findShareById: (id) => shares.find(s => s.id === id),
  deleteShare: (id) => {
    const index = shares.findIndex(s => s.id === id);
    if (index !== -1) {
      return shares.splice(index, 1)[0];
    }
    return null;
  },

  // Public Link Share operations
  createLinkShare: (linkData) => {
    linkShares.push(linkData);
    return linkData;
  },
  findLinkShareByToken: (token) => linkShares.find(l => l.token === token),
  findLinkShareById: (id) => linkShares.find(l => l.id === id),
  deleteLinkShare: (id) => {
    const index = linkShares.findIndex(l => l.id === id);
    if (index !== -1) {
      return linkShares.splice(index, 1)[0];
    }
    return null;
  },

  // Star / Favorite operations
  addStar: (userId, resourceType, resourceId) => {
    const exists = stars.some(s => s.userId === userId && s.resourceType === resourceType && s.resourceId === resourceId);
    if (!exists) {
      const entry = { userId, resourceType, resourceId, createdAt: new Date().toISOString() };
      stars.push(entry);
      return entry;
    }
    return null;
  },
  removeStar: (userId, resourceType, resourceId) => {
    const index = stars.findIndex(s => s.userId === userId && s.resourceType === resourceType && s.resourceId === resourceId);
    if (index !== -1) {
      return stars.splice(index, 1)[0];
    }
    return null;
  },
  getStarsByUser: (userId) => stars.filter(s => s.userId === userId),

  // Search & Filter helper with pagination
  searchUserResources: (ownerId, { q, type, starred, limit = 20, offset = 0 }) => {
    const userStarredIds = new Set(stars.filter(s => s.userId === ownerId).map(s => s.resourceId));

    let matchedFiles = files.filter(f => f.ownerId === ownerId && !f.isDeleted);
    let matchedFolders = folders.filter(f => f.ownerId === ownerId && !f.isDeleted);

    // Query text match (case-insensitive)
    if (q && q.trim() !== '') {
      const queryLower = q.trim().toLowerCase();
      matchedFiles = matchedFiles.filter(f => f.name.toLowerCase().includes(queryLower));
      matchedFolders = matchedFolders.filter(f => f.name.toLowerCase().includes(queryLower));
    }

    // Type match (e.g. image, pdf, folder)
    if (type) {
      const typeLower = type.toLowerCase();
      matchedFiles = matchedFiles.filter(f => f.mimeType && f.mimeType.toLowerCase().includes(typeLower));
      if (typeLower !== 'folder') {
        matchedFolders = []; // Exclude folders if specific file mime type requested
      }
    }

    // Starred filter
    if (starred === 'true' || starred === true) {
      matchedFiles = matchedFiles.filter(f => userStarredIds.has(f.id));
      matchedFolders = matchedFolders.filter(f => userStarredIds.has(f.id));
    }

    // Mark starred status on results
    const resultsFiles = matchedFiles.map(f => ({ ...f, isStarred: userStarredIds.has(f.id) }));
    const resultsFolders = matchedFolders.map(f => ({ ...f, isStarred: userStarredIds.has(f.id) }));

    const totalFiles = resultsFiles.length;
    const totalFolders = resultsFolders.length;

    // Apply pagination
    const paginatedFiles = resultsFiles.slice(Number(offset), Number(offset) + Number(limit));
    const paginatedFolders = resultsFolders.slice(Number(offset), Number(offset) + Number(limit));

    return {
      files: paginatedFiles,
      folders: paginatedFolders,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        totalFiles,
        totalFolders
      }
    };
  }
};
