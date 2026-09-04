const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/authRoutes');
const fileRoutes = require('../src/routes/fileRoutes');
const folderRoutes = require('../src/routes/folderRoutes');
const shareRoutes = require('../src/routes/shareRoutes');
const searchRoutes = require('../src/routes/searchRoutes');

const app = express();
app.use(express.json());

// Public Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'AetherVault Backend API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api', searchRoutes);

describe('AetherVault API Test Suite', () => {
  let authToken;
  const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    password: 'Password123!'
  };

  test('GET /api/health - Health check endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /api/auth/register - Register new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(testUser.email.toLowerCase());
    authToken = res.body.token;
  });

  test('POST /api/auth/login - Login user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('POST /api/auth/register - Reject invalid numeric name (e.g. 123)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '123', email: 'numeric@example.com', password: 'Password123!' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_NAME');
  });

  test('GET /api/auth/me - Get user profile with token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.name).toBe(testUser.name);
  });

  test('PUT /api/auth/password - Update user password', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: testUser.password, newPassword: 'NewPassword123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('Password updated successfully');
  });
});
