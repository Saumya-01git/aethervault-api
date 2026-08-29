# ⚙️ AetherVault Backend API

Backend REST API for **AetherVault** — a cloud-based media file storage and sharing web application (Google Drive clone).

## 🚀 Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (via Supabase)
- **Object Storage**: Supabase Storage / AWS S3
- **Auth**: JWT (JSON Web Tokens) & bcryptjs

## 🛠️ Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run development server
npm run dev
```

The server will start at `http://localhost:8080`.

## 📌 API Health Check
- `GET http://localhost:8080/api/health`
