const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { createOriginCallback } = require('./utils/corsOrigins');

const app = express();

app.use(cors({
  origin: createOriginCallback(process.env.CORS_ORIGIN),
  credentials: true,
}));

// Middleware
app.set('trust proxy', 1); // Trust first proxy (Nginx)
app.use(express.json({ limit: '2mb' }));

// Request logging
app.use((req, _res, next) => {
  req.requestId = require('crypto').randomUUID();
  logger.info('HTTP request', { method: req.method, path: req.path, requestId: req.requestId });
  next();
});

// Prometheus Metrics
const promBundle = require('express-prom-bundle');
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});
app.use(metricsMiddleware);

// Rate limiting — segmented by sensitivity
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many auth attempts' } });
const tradeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Trade rate limit exceeded' } });
const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, validate: { xForwardedForHeader: false } });

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/trades/execute', tradeLimiter);
app.use('/api/', readLimiter);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'finsocial-core-api' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/stocks', require('./routes/sentiment'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api/tribe', require('./routes/tribe'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/social', require('./routes/social'));
app.use('/api/system', require('./routes/system'));

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
