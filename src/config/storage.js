const path = require('path');
const fs = require('fs');

// Local upload storage directory fallback
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage service helper (Supports Local Storage + Cloud Storage Hooks)
const storageService = {
  uploadDir: UPLOAD_DIR,

  // Get public/signed URL for a file (Async)
  getSignedUrl: async (storageKey) => {
    if (!storageKey) return null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      return `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'aethervault'}/${storageKey}`;
    }
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`;
    return `${baseUrl}/uploads/${storageKey}`;
  },

  // Get public/signed URL for a file (Synchronous helper)
  getSignedUrlSync: (storageKey) => {
    if (!storageKey) return null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      return `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'aethervault'}/${storageKey}`;
    }
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`;
    return `${baseUrl}/uploads/${storageKey}`;
  },

  // Decorate a single file object or array of file objects with downloadUrl
  attachDownloadUrl: (fileOrFiles) => {
    if (!fileOrFiles) return fileOrFiles;
    if (Array.isArray(fileOrFiles)) {
      return fileOrFiles.map(f => ({
        ...f,
        downloadUrl: f.downloadUrl || storageService.getSignedUrlSync(f.storageKey)
      }));
    }
    return {
      ...fileOrFiles,
      downloadUrl: fileOrFiles.downloadUrl || storageService.getSignedUrlSync(fileOrFiles.storageKey)
    };
  }
};

module.exports = storageService;
