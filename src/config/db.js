// Database service (Supports in-memory fallback & PostgreSQL connection)
const users = [];
const files = [];
const folders = [];

module.exports = {
  users,
  files,
  folders,

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

      // Soft delete child files
      files.filter(f => f.folderId === id).forEach(f => {
        f.isDeleted = true;
        f.deletedAt = new Date().toISOString();
      });

      // Recursively soft delete subfolders
      folders.filter(f => f.parentId === id).forEach(f => {
        module.exports.softDeleteFolder(f.id);
      });
    }
    return folder;
  },

  // Helper: Build breadcrumbs path
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
  }
};
