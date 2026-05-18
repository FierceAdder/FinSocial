const Queue = require('bull');
const { getRedisUrl } = require('../utils/redisUrl');

const redisUrl = getRedisUrl();

const feedQueue = new Queue('feed-updates', redisUrl);
const leaderboardQueue = new Queue('leaderboard-updates', redisUrl);
const signalQueue = new Queue('signal-updates', redisUrl);
const notificationQueue = new Queue('notifications', redisUrl);

const setupJobs = () => {
  // Refresh ML signals every 15 minutes
  signalQueue.add({}, { repeat: { cron: '*/15 * * * *' } });

  // Refresh leaderboard every 1 hour
  leaderboardQueue.add({}, { repeat: { cron: '0 * * * *' } });

  // Fetch news every 30 minutes + once shortly after startup
  feedQueue.add({ type: 'fetch_news' }, { repeat: { cron: '*/30 * * * *' } });
  feedQueue.add({ type: 'fetch_news' }, { delay: 8000 });

  // Daily AI Stock Pick at 9 AM IST (3:30 AM UTC)
  feedQueue.add({ type: 'daily_pick' }, { repeat: { cron: '30 3 * * *' } });

  console.log('Background jobs initialized.');
};

module.exports = {
  feedQueue,
  leaderboardQueue,
  signalQueue,
  notificationQueue,
  setupJobs,
};
