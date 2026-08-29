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
  updateFile: (id, updates) => {
    const file = files.find(f => f.id === id);
    if (file) {
      Object.assign(file, updates, { updatedAt: new Date().toISOString() });
    }
    return file;
  }
};
