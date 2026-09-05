const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const storageService = require('../config/storage');

// Create User Share (ACL)
exports.createShare = async (req, res) => {
  try {
    const { resourceType, resourceId, granteeEmail, role } = req.body;

    if (!resourceType || !resourceId || !granteeEmail) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType, resourceId, and granteeEmail are required.' }
      });
    }

    const shareRole = role === 'editor' ? 'editor' : 'viewer';

    // Verify resource exists and belongs to user
    let resource;
    if (resourceType === 'file') {
      resource = db.findFileById(resourceId);
    } else if (resourceType === 'folder') {
      resource = db.findFolderById(resourceId);
    } else {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType must be file or folder.' }
      });
    }

    if (!resource || resource.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Resource not found or access denied.' }
      });
    }

    // Find grantee user
    const grantee = db.findUserByEmail(granteeEmail);
    if (!grantee) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'No registered user found with that email.' }
      });
    }

    if (grantee.id === req.user.id) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'You cannot share a resource with yourself.' }
      });
    }

    const shareId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

    const newShare = {
      id: shareId,
      resourceType,
      resourceId,
      granteeUserId: grantee.id,
      granteeEmail: grantee.email,
      granteeName: grantee.name,
      role: shareRole,
      createdBy: req.user.id,
      createdAt: new Date().toISOString()
    };

    db.createShare(newShare);

    return res.status(201).json({
      message: 'Resource shared successfully',
      share: newShare
    });
  } catch (error) {
    console.error('Create Share Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to share resource.' }
    });
  }
};

// List Shares for a Resource
exports.listShares = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const shares = db.findSharesByResource(resourceType, resourceId);

    return res.json({ shares });
  } catch (error) {
    console.error('List Shares Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to list shares.' }
    });
  }
};

// Revoke Share (Delete)
exports.deleteShare = async (req, res) => {
  try {
    const { id } = req.params;
    const share = db.findShareById(id);

    if (!share || share.createdBy !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Share entry not found or access denied.' }
      });
    }

    db.deleteShare(id);

    return res.json({
      message: 'Share access revoked successfully',
      shareId: id
    });
  } catch (error) {
    console.error('Delete Share Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to revoke share access.' }
    });
  }
};

// Create Public Share Link
exports.createPublicLink = async (req, res) => {
  try {
    const { resourceType, resourceId, expiresAt, password } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'resourceType and resourceId are required.' }
      });
    }

    // Verify resource ownership
    let resource;
    if (resourceType === 'file') {
      resource = db.findFileById(resourceId);
    } else if (resourceType === 'folder') {
      resource = db.findFolderById(resourceId);
    }

    if (!resource || resource.ownerId !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Resource not found or access denied.' }
      });
    }

    const token = crypto.randomBytes(16).toString('hex');
    let passwordHash = null;

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    const linkId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

    const newLink = {
      id: linkId,
      resourceType,
      resourceId,
      token,
      role: 'viewer',
      hasPassword: !!passwordHash,
      passwordHash,
      expiresAt: expiresAt || null,
      createdBy: req.user.id,
      createdAt: new Date().toISOString()
    };

    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`;
    const shareUrl = `${baseUrl}/api/shares/link/${token}`;

    return res.status(201).json({
      message: 'Public share link created successfully',
      shareLink: {
        id: newLink.id,
        token: newLink.token,
        shareUrl,
        expiresAt: newLink.expiresAt,
        hasPassword: newLink.hasPassword
      }
    });
  } catch (error) {
    console.error('Create Public Link Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to create public share link.' }
    });
  }
};

// Resolve Public Share Link (Public Endpoint)
exports.resolvePublicLink = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body || {};

    const linkShare = db.findLinkShareByToken(token);

    if (!linkShare) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Invalid or expired share link.' }
      });
    }

    // Check expiration
    if (linkShare.expiresAt && new Date(linkShare.expiresAt) < new Date()) {
      return res.status(410).json({
        error: { code: 'EXPIRED', message: 'This share link has expired.' }
      });
    }

    // Check password protection
    if (linkShare.hasPassword) {
      if (!password) {
        return res.status(401).json({
          error: { code: 'PASSWORD_REQUIRED', message: 'Password is required to access this link.' }
        });
      }

      const isMatch = await bcrypt.compare(password, linkShare.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          error: { code: 'INVALID_PASSWORD', message: 'Incorrect password for share link.' }
        });
      }
    }

    // Fetch resource
    let resource;
    let downloadUrl = null;

    if (linkShare.resourceType === 'file') {
      resource = db.findFileById(linkShare.resourceId);
      if (resource) {
        downloadUrl = await storageService.getSignedUrl(resource.storageKey);
      }
    } else {
      resource = db.findFolderById(linkShare.resourceId);
    }

    if (!resource) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Shared resource is no longer available.' }
      });
    }

    return res.json({
      resourceType: linkShare.resourceType,
      resource,
      downloadUrl
    });
  } catch (error) {
    console.error('Resolve Public Link Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to resolve share link.' }
    });
  }
};

// Delete Public Link Share
exports.deletePublicLink = async (req, res) => {
  try {
    const { id } = req.params;
    const linkShare = db.findLinkShareById(id);

    if (!linkShare || linkShare.createdBy !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Public share link not found or access denied.' }
      });
    }

    db.deleteLinkShare(id);

    return res.json({
      message: 'Public share link deleted successfully',
      linkId: id
    });
  } catch (error) {
    console.error('Delete Public Link Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to delete public share link.' }
    });
  }
};
