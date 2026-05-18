const { feedQueue, leaderboardQueue, signalQueue, notificationQueue } = require('./index');
const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const { mlBaseUrl, genAiBaseUrl } = require('../utils/serviceUrls');
const ML_URL = mlBaseUrl();
const GEN_AI_URL = genAiBaseUrl();
const { fetchAndStoreNews } = require('../services/newsFetcher');
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

const startWorkers = () => {
  logger.info('Starting background workers...');

  // ─── Signal Worker: ML predict → persist Signal → emit ──────────────────────
  signalQueue.process(async (job) => {
    logger.info('[Worker] Refreshing ML signals...');
    try {
      const stocks = await prisma.stock.findMany({ select: { id: true, ticker: true } });

      for (const stock of stocks) {
        try {
          const { data } = await axios.post(`${ML_URL}/predict`, { ticker: stock.ticker }, { timeout: 10000 });

          const signal = await prisma.signal.create({
            data: {
              stockId: stock.id,
              verdict: data.verdict,
              confidence: data.confidence,
              reasoning: data.reasoning || '',
              rsi: data.technicals?.rsi || null,
              macd: data.technicals?.macd || null,
              source: 'ml',
            },
            include: { stock: { select: { ticker: true, displayTicker: true } } }
          });

          if (global.io) {
            global.io.emit('signal:new', {
              id: signal.id,
              ticker: signal.stock.displayTicker,
              verdict: signal.verdict,
              confidence: signal.confidence,
              reasoning: signal.reasoning,
            });
          }

          // Notify users who have this stock in their watchlist for high-confidence signals
          if (data.confidence >= 70 && (data.verdict === 'BUY' || data.verdict === 'SELL')) {
            try {
              const watchlistUsers = await prisma.watchlistItem.findMany({
                where: { stockId: stock.id },
                select: { userId: true },
              });
              for (const { userId } of watchlistUsers) {
                const notification = await prisma.notification.create({
                  data: {
                    userId,
                    type: 'signal_alert',
                    title: `${data.verdict} Signal: ${signal.stock.displayTicker}`,
                    body: `ML model signals ${data.verdict} with ${data.confidence}% confidence. ${data.reasoning || ''}`.trim(),
                  },
                });
                notificationQueue.add({ notificationId: notification.id });
              }
            } catch (notifErr) {
              logger.warn('[Worker] Signal notification failed', { error: notifErr.message });
            }
          }

          logger.info('[Worker] Signal saved', { ticker: stock.ticker, verdict: data.verdict });
          await sleep(200);
        } catch (err) {
          logger.warn('[Worker] ML predict failed for stock', { ticker: stock.ticker, error: err.message });
        }
      }

      return { success: true, count: stocks.length };
    } catch (error) {
      logger.error('[Worker] Signal refresh error', { error: error.message });
      throw error;
    }
  });

  // ─── Leaderboard Worker: compute snapshots from live portfolio data ──────────
  leaderboardQueue.process(async (job) => {
    logger.info('[Worker] Reranking leaderboard...');
    try {
      const users = await prisma.user.findMany({
        include: {
          holdings: { include: { stock: { select: { price: true } } } },
          trades: true,
        },
      });

      const computedAt = new Date();
      const now = computedAt.getTime();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const monthMs = 30 * 24 * 60 * 60 * 1000;

      const periods = ['weekly', 'monthly', 'alltime'];

      for (const period of periods) {
        const cutoff = period === 'weekly' ? new Date(now - weekMs) :
          period === 'monthly' ? new Date(now - monthMs) : new Date(0);

        const userStats = [];

        for (const user of users) {
          const portfolioValue = user.holdings.reduce(
            (sum, h) => sum + h.totalQuantity * h.stock.price, 0
          ) + user.virtualBalance;

          const periodTrades = user.trades.filter((t) => new Date(t.timestamp) >= cutoff);
          const tradeCount = periodTrades.length;

          const invested = user.holdings.reduce(
            (sum, h) => sum + h.totalQuantity * h.averageCost, 0
          );
          const unrealizedPnl = user.holdings.reduce(
            (sum, h) => sum + (h.stock.price - h.averageCost) * h.totalQuantity, 0
          );
          const returnsPct = invested > 0 ? (unrealizedPnl / invested) * 100 : 0;

          // Win rate: SELL trades where execution price > average cost
          const sellTrades = periodTrades.filter((t) => t.side === 'SELL');
          const winCount = sellTrades.length > 0
            ? sellTrades.filter((t) => t.executionPrice > t.totalValue / t.quantity * 0.9).length
            : 0;
          const winRate = sellTrades.length > 0 ? winCount / sellTrades.length : 0;

          userStats.push({ userId: user.id, portfolioValue, returnsPct, tradeCount, winRate });
        }

        // Sort by returns
        userStats.sort((a, b) => b.returnsPct - a.returnsPct);

        // Delete old snapshots for this period and replace
        await prisma.leaderboardSnapshot.deleteMany({ where: { period } });

        for (let i = 0; i < Math.min(userStats.length, 50); i++) {
          const s = userStats[i];
          await prisma.leaderboardSnapshot.create({
            data: { ...s, period, rank: i + 1, computedAt },
          });
        }

        logger.info('[Worker] Leaderboard updated', { period, users: userStats.length });
      }

      return { success: true };
    } catch (error) {
      logger.error('[Worker] Leaderboard error', { error: error.message });
      throw error;
    }
  });

  // ─── Feed Worker: NewsAPI + Daily AI Pick ───────────────────────────────────
  feedQueue.process(async (job) => {
    const jobType = job.data.type;

    if (jobType === 'daily_pick') {
      return await processDailyPick();
    }

    if (jobType !== 'fetch_news') {
      logger.warn('[Worker] Unknown feed job type', { type: jobType });
      return;
    }

    logger.info('[Worker] Fetching market news...');
    const result = await fetchAndStoreNews();
    if (result.error) {
      logger.warn('[Worker] News fetch issue', result);
    }
    return { success: !result.error || result.saved > 0, ...result };
  });

  // ─── Notification Worker: fan out push + email ───────────────────────────────
  notificationQueue.process(async (job) => {
    const { notificationId } = job.data;
    if (!notificationId) return;

    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: { select: { email: true, firstName: true } } },
      });

      if (!notification) return;

      // Send via Socket.IO
      if (global.io) {
        global.io.to(`user:${notification.userId}`).emit('notification:new', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
        });
      }

      // Send email via SendGrid if key available
      if (SENDGRID_API_KEY) {
        try {
          await axios.post('https://api.sendgrid.com/v3/mail/send', {
            personalizations: [{
              to: [{ email: notification.user.email, name: notification.user.firstName }],
            }],
            from: { email: 'noreply@finsocial.app', name: 'FinSocial' },
            subject: notification.title,
            content: [{ type: 'text/plain', value: notification.body }],
          }, {
            headers: { Authorization: `Bearer ${SENDGRID_API_KEY}` },
            timeout: 10000,
          });
          logger.info('[Worker] Email sent', { userId: notification.userId, type: notification.type });
        } catch (emailErr) {
          logger.warn('[Worker] SendGrid email failed', { error: emailErr.message });
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('[Worker] Notification worker error', { error: error.message });
    }
  });
};

async function processDailyPick() {
  logger.info('[Worker] Generating daily AI stock pick...');
  try {
    const stocks = await prisma.stock.findMany({ select: { id: true, ticker: true, displayTicker: true } });
    if (stocks.length === 0) return { success: false, reason: 'no stocks' };

    let bestSignal = null;

    for (const stock of stocks) {
      try {
        const { data } = await axios.post(`${ML_URL}/predict`, { ticker: stock.ticker }, { timeout: 10000 });
        if (data.verdict === 'BUY' && data.confidence > (bestSignal?.confidence || 0)) {
          bestSignal = { stock, ...data };
        }
      } catch { /* skip stocks that fail */ }
      await sleep(100);
    }

    if (!bestSignal) {
      logger.info('[Worker] No strong BUY signal found for daily pick');
      return { success: true, pick: null };
    }

    const signal = await prisma.signal.create({
      data: {
        stockId: bestSignal.stock.id,
        verdict: 'BUY',
        confidence: bestSignal.confidence,
        reasoning: `Daily AI Pick: ${bestSignal.reasoning || 'Strong technical setup detected'}`,
        rsi: bestSignal.technicals?.rsi || null,
        macd: bestSignal.technicals?.macd || null,
        source: 'daily_pick',
      },
    });

    if (global.io) {
      global.io.emit('signal:new', {
        id: signal.id,
        ticker: bestSignal.stock.displayTicker,
        verdict: signal.verdict,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        isDailyPick: true,
      });
    }

    logger.info('[Worker] Daily AI pick generated', { ticker: bestSignal.stock.ticker, confidence: bestSignal.confidence });
    return { success: true, pick: bestSignal.stock.ticker };
  } catch (error) {
    logger.error('[Worker] Daily pick error', { error: error.message });
    throw error;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { startWorkers };
