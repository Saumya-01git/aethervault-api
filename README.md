# ⚙️ AetherVault REST API — Cloud Storage Backend Service

> High-performance RESTful API powering **AetherVault** — an enterprise cloud storage and sharing web client. Built with Node.js, Express, Neon PostgreSQL, JWT Auth, and multi-tier persistence.

---

## 🔗 Live Deployment & Repositories

- ⚡ **Live API Service**: [https://aethervault-api.onrender.com](https://aethervault-api.onrender.com)
- 🌐 **Live Web Application**: [https://aethervault-web.vercel.app](https://aethervault-web.vercel.app)
- ⚙️ **Backend GitHub Repo**: [https://github.com/Saumya-01git/aethervault-api](https://github.com/Saumya-01git/aethervault-api)
- 💻 **Frontend GitHub Repo**: [https://github.com/Saumya-01git/aethervault-web](https://github.com/Saumya-01git/aethervault-web)

---

## 📸 Client Interface Showcase

### 🌌 Main Cloud Drive Dashboard
| 🌍 Grid View (Earth Mode) | 🪐 List View (Stream Mode & Starred Files) |
| :---: | :---: |
| ![Grid View](./screenshots/dashboard-grid-earth.png) | ![List View](./screenshots/dashboard-list-stream.png) |

---

## 🚀 Key Backend Capabilities

- 🔐 **Authentication & Security**: JWT-based stateless authentication, `bcryptjs` password hashing, and protected express middleware.
- 🐘 **Database Architecture**: Neon PostgreSQL serverless cloud database with automatic SQL table generation and fallback local disk persistence.
- 📁 **File & Folder API**: Full CRUD endpoints for creating folders, file uploads, soft-deletion, restoration, breadcrumb generation, and trash purging.
- 🤝 **Granular ACL Sharing**: User-to-user share permissions (`Viewer` / `Editor`) with grantee search and share revocation.
- 🔗 **Public Link Engine**: High-security tokenized public share links with optional `bcrypt` password protection and datetime expiry limits.
- 📄 **HTML Landing Page Rendering**: Server-side rendered HTML prompt pages for password-protected link unlocks (featuring cyan-glowing eye toggles) and file download landing pages.
- 📜 **Audit Activity Log API**: Automated activity tracking logging uploads, deletions, shares, and public link creations.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Neon PostgreSQL (`pg` pool integration)
- **Security**: JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, CORS
- **Storage Service**: Multi-provider storage engine (S3 / Cloud Storage / Local fallback)
- **Deployment**: Render

---

## 📡 Key API Routes

### 🔐 Auth Routes (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user account |
| `POST` | `/api/auth/login` | Authenticate user & receive JWT token |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |

### 📁 File & Folder Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/folders` | List folders & files for current directory |
| `POST` | `/api/folders` | Create a new folder |
| `POST` | `/api/files/upload` | Upload a new file |
| `DELETE` | `/api/files/:id` | Soft-delete a file to Trash |
| `POST` | `/api/trash/restore` | Restore file/folder from Trash |

### 🤝 Share & Public Link Routes (`/api/shares`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/shares` | Share resource with registered user |
| `GET` | `/api/shares/shared-with-me` | List items shared with current user |
| `POST` | `/api/shares/link-shares` | Generate password-protected public link |
| `GET / POST`| `/api/shares/link/:token` | Resolve & render public share link landing page |

---

## ⚡ Quick Start (Local Setup)

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Saumya-01git/aethervault-api.git
cd aethervault-api
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Set Up Environment Variables
Create a `.env` file in the root directory:
```env
PORT=8080
JWT_SECRET=your_super_secret_jwt_key
DATABASE_URL=postgresql://user:pass@ep-cool-cloud.neon.tech/aethervault?sslmode=require
PUBLIC_URL=http://localhost:8080
```

### 4️⃣ Start Development Server
```bash
npm run dev
```
Health Check: `http://localhost:8080/api/health`

---

## 📜 License

This project is licensed under the **MIT License**.
