/**
 * Smoke tests for core-api. These tests mock Prisma + external deps
 * so they run offline without a real DB or Redis.
 */
process.env.JWT_SECRET = 'test_secret_for_ci_only_not_production';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.NODE_ENV = 'test';

const request = require('supertest');

// Mock heavy deps before importing app
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: { findUnique: jest.fn(), create: jest.fn() },
    stock: { findMany: jest.fn(() => []), findUnique: jest.fn() },
    $disconnect: jest.fn(),
  })),
}));

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  }));
});

// Dynamically require app after env is set
let app;
beforeAll(() => {
  app = require('../src/app');
});

describe('Health Endpoint', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth Endpoints', () => {
  it('POST /api/auth/register — validates required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({}) // missing fields
      .set('Accept', 'application/json');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('POST /api/auth/login — missing credentials returns 400+', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notexist@example.com', password: 'wrong' })
      .set('Accept', 'application/json');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('GET /api/auth/me — requires auth token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });
});

describe('Protected Routes', () => {
  it('GET /api/portfolio — returns 401 without token', async () => {
    const res = await request(app).get('/api/portfolio');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/watchlist — returns 401 without token', async () => {
    const res = await request(app).get('/api/watchlist');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/notifications — returns 401 without token', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/alerts — returns 401 without token', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.statusCode).toBe(401);
  });
});
