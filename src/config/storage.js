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

  // Get public/signed URL for a file
  getSignedUrl: async (storageKey) => {
    // If Supabase credentials exist, return Supabase signed URL
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      return `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'aethervault'}/${storageKey}`;
    }
    // Fallback: Local file server URL
    return `http://localhost:${process.env.PORT || 8080}/uploads/${storageKey}`;
  }
};

module.exports = storageService;
