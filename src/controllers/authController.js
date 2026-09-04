const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('crypto');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_aethervault_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register User
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Name, email, and password are required.' }
      });
    }

    // Name Validation: Must contain alphabetic characters and not be purely numeric or short
    const trimmedName = name.trim();
    const hasLetters = /[a-zA-Z]/.test(trimmedName);
    const isPurelyNumeric = /^\d+$/.test(trimmedName);

    if (trimmedName.length < 2 || !hasLetters || isPurelyNumeric) {
      return res.status(400).json({
        error: { code: 'INVALID_NAME', message: 'Invalid name format. Name must contain at least 2 letters and cannot be purely numeric (e.g. 123).' }
      });
    }

    // Check existing user
    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: { code: 'ALREADY_EXISTS', message: 'User with this email already exists.' }
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user object
    const newUser = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      name: trimmedName,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString()
    };

    db.createUser(newUser);

    // Generate JWT
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, name: newUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      token
    });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Internal server error during registration.' }
    });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Email and password are required.' }
      });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Logged in successfully',
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Internal server error during login.' }
    });
  }
};

// Logout User
exports.logout = (req, res) => {
  return res.json({ message: 'Logged out successfully' });
};

// Get Current Logged In User Profile
exports.getMe = (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'User not found.' }
    });
  }

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }
  });
};

// Update Password
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Current password and new password are required.' }
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 6 characters long.' }
      });
    }

    const user = db.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found.' }
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect current password.' }
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    db.updateUser(user.id, { passwordHash: newPasswordHash });

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Update Password Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to update password.' }
    });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Name is required.' }
      });
    }

    const trimmedName = name.trim();
    const hasLetters = /[a-zA-Z]/.test(trimmedName);
    const isPurelyNumeric = /^\d+$/.test(trimmedName);

    if (trimmedName.length < 2 || !hasLetters || isPurelyNumeric) {
      return res.status(400).json({
        error: { code: 'INVALID_NAME', message: 'Invalid name format. Name must contain at least 2 letters and cannot be purely numeric (e.g. 123).' }
      });
    }

    const user = db.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found.' }
      });
    }

    db.updateUser(user.id, { name: trimmedName });

    return res.json({
      message: 'Profile updated successfully.',
      user: { id: user.id, name: trimmedName, email: user.email, createdAt: user.createdAt }
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to update profile.' }
    });
  }
};
