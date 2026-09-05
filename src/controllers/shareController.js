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

    db.createLinkShare(newLink);

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

// Get Items Shared With Me (ACL)
exports.getSharedWithMe = async (req, res) => {
  try {
    const userShares = db.findSharesForUser(req.user.email, req.user.id);
    const sharedFiles = [];
    const sharedFolders = [];

    for (const share of userShares) {
      if (share.resourceType === 'file') {
        const file = db.findFileById(share.resourceId);
        if (file && !file.isDeleted) {
          const fileWithUrl = storageService.attachDownloadUrl([file])[0];
          const decorated = db.attachStarState(req.user.id, [fileWithUrl], []);
          sharedFiles.push({ ...decorated.files[0], shareRole: share.role || share.permission });
        }
      } else if (share.resourceType === 'folder') {
        const folder = db.findFolderById(share.resourceId);
        if (folder && !folder.isDeleted) {
          const decorated = db.attachStarState(req.user.id, [], [folder]);
          sharedFolders.push({ ...decorated.folders[0], shareRole: share.role || share.permission });
        }
      }
    }

    return res.json({
      folders: sharedFolders,
      files: sharedFiles
    });
  } catch (error) {
    console.error('Get Shared With Me Error:', error);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch shared items.' }
    });
  }
};

// Resolve Public Share Link (Public Endpoint)
exports.resolvePublicLink = async (req, res) => {
  try {
    const { token } = req.params;
    const password = req.body?.password || req.body?.linkPassword || req.query?.password;

    const linkShare = db.findLinkShareByToken(token);

    if (!linkShare) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>AetherVault - Link Not Found</title>
        <style>body{background:#030712;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
        .card{background:#0f172a;border:1px solid rgba(239,68,68,0.3);padding:2.5rem;border-radius:1.5rem;max-width:400px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.6);}
        h2{color:#f87171;margin-top:0;}p{color:#94a3b8;font-size:0.9rem;}</style></head>
        <body><div class="card"><h2>⚠️ Link Invalid or Expired</h2><p>This public share link is no longer active or does not exist.</p></div></body></html>
      `);
    }

    // Check expiration
    if (linkShare.expiresAt && new Date(linkShare.expiresAt) < new Date()) {
      return res.status(410).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>AetherVault - Link Expired</title>
        <style>body{background:#030712;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
        .card{background:#0f172a;border:1px solid rgba(245,158,11,0.3);padding:2.5rem;border-radius:1.5rem;max-width:400px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.6);}
        h2{color:#fbbf24;margin-top:0;}p{color:#94a3b8;font-size:0.9rem;}</style></head>
        <body><div class="card"><h2>⌛ Link Expired</h2><p>This share link expired on ${new Date(linkShare.expiresAt).toLocaleDateString()}.</p></div></body></html>
      `);
    }

    // Check password protection
    if (linkShare.hasPassword) {
      if (!password) {
        if (req.method === 'GET' || req.headers['accept']?.includes('text/html')) {
          return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>AetherVault - Protected Link</title>
              <style>
                body { background: #030712; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
                .card { background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 27, 75, 0.8)); border: 1px solid rgba(56, 189, 248, 0.3); padding: 2.5rem; border-radius: 1.5rem; width: 100%; max-width: 420px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
                .icon { width: 56px; height: 56px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; font-size: 1.5rem; }
                h2 { margin: 0 0 0.5rem; color: #f8fafc; font-size: 1.5rem; }
                p { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.4; }
                input { width: 100%; padding: 0.875rem 1rem; margin-bottom: 1rem; border-radius: 0.875rem; border: 1px solid rgba(255,255,255,0.15); background: rgba(15, 23, 42, 0.8); color: white; box-sizing: border-box; font-size: 0.95rem; outline: none; }
                input:focus { border-color: #38bdf8; box-shadow: 0 0 15px rgba(56,189,248,0.3); }
                button { width: 100%; padding: 0.875rem 1rem; border-radius: 0.875rem; border: none; background: linear-gradient(135deg, #2563eb, #0284c7); color: white; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(37,99,235,0.4); }
                button:hover { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(56,189,248,0.6); }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">🔒</div>
                <h2>Password Protected File</h2>
                <p>This AetherVault cloud resource is password protected. Enter the password below to unlock.</p>
                <form method="POST" action="/api/shares/link/${token}">
                  <input type="password" name="password" placeholder="Enter link password" required autofocus />
                  <button type="submit">Unlock & View Resource</button>
                </form>
              </div>
            </body>
            </html>
          `);
        }
        return res.status(401).json({
          error: { code: 'PASSWORD_REQUIRED', message: 'Password is required to access this link.' }
        });
      }

      const isMatch = await bcrypt.compare(password, linkShare.passwordHash);
      if (!isMatch) {
        if (req.method === 'POST' && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="en"><head><meta charset="UTF-8"><title>AetherVault - Invalid Password</title>
            <style>body{background:#030712;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
            .card{background:#0f172a;border:1px solid rgba(239,68,68,0.3);padding:2.5rem;border-radius:1.5rem;max-width:400px;text-align:center;}
            h2{color:#f87171;}a{color:#38bdf8;text-decoration:none;font-weight:bold;}</style></head>
            <body><div class="card"><h2>❌ Incorrect Password</h2><p>The password you entered is incorrect.</p><p><a href="/api/shares/link/${token}">← Try Again</a></p></div></body></html>
          `);
        }
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

    // Direct browser redirect for non-password GET links or unlocked form POST links
    if (downloadUrl && (req.method === 'GET' || req.headers['content-type']?.includes('application/x-www-form-urlencoded'))) {
      return res.redirect(downloadUrl);
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
