require('dotenv').config();
const { loadEnv } = require('./src/utils/env');
loadEnv();

const app = require('./src/app');
const http = require('http');
const setupSocket = require('./src/socket');

const { setupJobs } = require('./src/jobs/index');
const { startWorkers } = require('./src/jobs/workers');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = setupSocket(server);

// Expose io globally so controllers and workers can emit events
global.io = io;

// Initialize background jobs
setupJobs().catch((err) => logger.error('Failed to setup background jobs', { error: err.message }));
startWorkers();

const { ensureTribeChannelsIfNeeded } = require('./src/utils/ensureTribeChannels');

async function start() {
  try {
    await ensureTribeChannelsIfNeeded();
  } catch (err) {
    logger.warn('Could not ensure tribe channels at startup', { error: err.message });
  }
  server.listen(PORT, () => {
    logger.info(`Core API Server running on port ${PORT}`, { env: process.env.NODE_ENV });
  });
}

start();

