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
    db.addActivityLog(req.user.id, 'SHARE_RESOURCE', resource.name, `Shared ${resourceType} "${resource.name}" with ${granteeEmail} (${shareRole})`);

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
    db.addActivityLog(req.user.id, 'REVOKE_SHARE', share.resourceId, `Revoked share access for ${share.granteeEmail || 'user'}`);

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
    db.addActivityLog(req.user.id, 'CREATE_PUBLIC_LINK', resource.name, `Created public share link for ${resourceType} "${resource.name}"`);

    const baseUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 8080}`;
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

// Render HTML Password Prompt Form
function renderPasswordPrompt(token, errorMsg = '') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AetherVault - Password Protected Resource</title>
      <style>
        body { background: #030712; color: #f8fafc; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
        .card { background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 27, 75, 0.85)); border: 1px solid rgba(56, 189, 248, 0.3); padding: 2.5rem; border-radius: 1.5rem; width: 100%; max-width: 420px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); backdrop-filter: blur(20px); }
        .icon { width: 60px; height: 60px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; font-size: 1.75rem; box-shadow: 0 0 20px rgba(56,189,248,0.2); }
        h2 { margin: 0 0 0.5rem; color: #f8fafc; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; }
        p { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.5; }
        .error-badge { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.75rem 1rem; border-radius: 1rem; font-size: 0.825rem; margin-bottom: 1.25rem; display: flex; items-center; justify-content: center; gap: 0.5rem; font-weight: 600; text-align: left; }
        .input-wrapper { position: relative; margin-bottom: 1.25rem; }
        input { width: 100%; padding: 0.875rem 3rem 0.875rem 1rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.15); background: rgba(15, 23, 42, 0.9); color: white; box-sizing: border-box; font-size: 0.95rem; outline: none; transition: all 0.2s ease; }
        input:focus { border-color: #38bdf8; box-shadow: 0 0 20px rgba(56,189,248,0.35); }
        .eye-button { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; border-radius: 0.5rem; transition: all 0.2s ease-in-out; }
        .eye-button:hover { color: #38bdf8; filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.9)); transform: translateY(-50%) scale(1.15); }
        button[type="submit"] { width: 100%; padding: 0.875rem 1rem; border-radius: 1rem; border: none; background: linear-gradient(135deg, #2563eb, #0284c7); color: white; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: all 0.25s ease; box-shadow: 0 4px 25px rgba(37,99,235,0.45); }
        button[type="submit"]:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(56,189,248,0.6); }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🔒</div>
        <h2>Password Protected Link</h2>
        <p>This AetherVault cloud resource is password protected. Enter the password below to unlock access.</p>
        
        ${errorMsg ? `<div class="error-badge"><span>⚠️ ${errorMsg}</span></div>` : ''}
        
        <form method="POST" action="/api/shares/link/${token}">
          <div class="input-wrapper">
            <input type="password" id="passwordInput" name="password" placeholder="Enter link password" required autofocus />
            <button type="button" class="eye-button" onclick="togglePass()" title="Toggle Password Visibility">
              <svg id="eyeSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <button type="submit">Unlock & View Resource</button>
        </form>
      </div>

      <script>
        function togglePass() {
          const inp = document.getElementById('passwordInput');
          const svg = document.getElementById('eyeSvg');
          if (inp.type === 'password') {
            inp.type = 'text';
            svg.innerHTML = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
          } else {
            inp.type = 'password';
            svg.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
          }
        }
      </script>
    </body>
    </html>
  `;
}

// Render HTML Public File Download Landing Page
function renderPublicLandingPage(resource, downloadUrl, ownerInfo) {
  const sizeFormatted = resource.sizeBytes 
    ? (resource.sizeBytes > 1024 * 1024 
        ? (resource.sizeBytes / (1024 * 1024)).toFixed(1) + ' MB'
        : (resource.sizeBytes / 1024).toFixed(1) + ' KB')
    : 'Unknown size';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AetherVault - ${resource.name || 'Shared Resource'}</title>
      <style>
        body { background: #030712; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
        .card { background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 27, 75, 0.85)); border: 1px solid rgba(56, 189, 248, 0.35); padding: 2.5rem; border-radius: 1.75rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.85); backdrop-filter: blur(24px); }
        .brand { font-size: 0.8rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
        .brand span { width: 8px; height: 8px; background: #34d399; border-radius: 50%; display: inline-block; box-shadow: 0 0 10px #34d399; }
        .file-icon { width: 72px; height: 72px; background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2)); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 1.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 2.2rem; box-shadow: 0 0 30px rgba(56,189,248,0.3); }
        h1 { margin: 0 0 0.5rem; font-size: 1.4rem; font-weight: 800; color: #f8fafc; word-break: break-all; }
        .meta { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.75rem; display: flex; items-center; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
        .badge { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; color: #cbd5e1; }
        .owner-box { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); padding: 1rem; border-radius: 1.25rem; margin-bottom: 1.75rem; text-align: left; }
        .owner-label { text-transform: uppercase; font-size: 0.675rem; font-weight: 800; color: #64748b; letter-spacing: 0.08em; margin-bottom: 0.25rem; }
        .owner-name { font-size: 0.95rem; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 0.5rem; }
        .owner-email { font-size: 0.8rem; color: #94a3b8; font-weight: 400; margin-top: 0.15rem; }
        .btn-download { display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; width: 100%; padding: 1rem 1.5rem; border-radius: 1.25rem; border: none; background: linear-gradient(135deg, #0284c7, #2563eb); color: white; font-size: 1rem; font-weight: 700; text-decoration: none; box-sizing: border-box; transition: all 0.25s ease; box-shadow: 0 4px 25px rgba(37,99,235,0.5); }
        .btn-download:hover { transform: translateY(-2px); box-shadow: 0 8px 35px rgba(56,189,248,0.7); }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand"><span></span> AetherVault Cloud Share</div>
        <div class="file-icon">📄</div>
        <h1>${resource.name || 'Shared File'}</h1>
        <div class="meta">
          <span class="badge">${sizeFormatted}</span>
          <span class="badge">AES-256 Encrypted</span>
        </div>

        <div class="owner-box">
          <div class="owner-label">Shared By</div>
          <div class="owner-name">👤 ${ownerInfo.name || 'AetherVault User'}</div>
          <div class="owner-email">${ownerInfo.email || ''}</div>
        </div>

        ${downloadUrl ? `<a href="${downloadUrl}" download="${resource.name || 'file'}" class="btn-download">📥 Download File</a>` : '<p style="color:#f87171">Download link unavailable</p>'}
      </div>
    </body>
    </html>
  `;
}

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
          return res.send(renderPasswordPrompt(token));
        }
        return res.status(401).json({
          error: { code: 'PASSWORD_REQUIRED', message: 'Password is required to access this link.' }
        });
      }

      const isMatch = await bcrypt.compare(password, linkShare.passwordHash);
      if (!isMatch) {
        if (req.method === 'POST' || req.headers['accept']?.includes('text/html')) {
          return res.status(401).send(renderPasswordPrompt(token, 'Incorrect password. Please check the password and try again.'));
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

    // Fetch Owner Information for Audit display
    const owner = db.findUserById(resource.ownerId) || { name: 'AetherVault User', email: '' };

    // Render HTML Landing Page for browser GET requests or form submissions
    if (req.method === 'GET' || req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.send(renderPublicLandingPage(resource, downloadUrl, owner));
    }

    return res.json({
      resourceType: linkShare.resourceType,
      resource,
      downloadUrl,
      owner: { name: owner.name, email: owner.email }
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
