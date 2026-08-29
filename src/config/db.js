// Database service (Supports in-memory fallback & PostgreSQL connection)
const users = []; // In-memory fallback for local dev testing

module.exports = {
  users,
  findUserByEmail: (email) => users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  findUserById: (id) => users.find(u => u.id === id),
  createUser: (userData) => {
    users.push(userData);
    return userData;
  }
};
