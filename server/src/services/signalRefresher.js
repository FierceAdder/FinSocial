const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { mlBaseUrl } = require('../utils/serviceUrls');
const { notificationQueue } = require('../jobs/index');

const ML_URL = mlBaseUrl();
const PREDICT_TIMEOUT_MS = 10000;
const STOCK_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run ML /predict for every stock, persist Signal rows, emit socket events.
 * Used by the Bull signal worker and POST /feed/signals/refresh.
 */
async function refreshAllSignals() {
  const stocks = await prisma.stock.findMany({ select: { id: true, ticker: true } });
  let updated = 0;
  let failed = 0;

  for (const stock of stocks) {
    try {
      const { data } = await axios.post(
        `${ML_URL}/predict`,
        { ticker: stock.ticker },
        { timeout: PREDICT_TIMEOUT_MS }
      );

      await prisma.signal.deleteMany({ where: { stockId: stock.id } });

      // --- Community consensus (SentimentVote) ---
      const sentRows = await prisma.sentimentVote.groupBy({
        by: ['vote'],
        where: { stockId: stock.id },
        _count: { vote: true },
      });
      const sentCounts = { bullish: 0, neutral: 0, bearish: 0 };
      sentRows.forEach((r) => { sentCounts[r.vote] = r._count.vote; });
      const sentimentTotal = sentCounts.bullish + sentCounts.neutral + sentCounts.bearish;
      // bullish% 0-100; neutral prior (50) when no votes exist
      const communityScore = sentimentTotal > 0
        ? Math.round((sentCounts.bullish / sentimentTotal) * 100)
        : 50;

      // Composite: 70% ML signal, 30% community bullish sentiment
      const mlConfidence  = data.confidence ?? 50;
      const compositeConf = Math.round(mlConfidence * 0.70 + communityScore * 0.30);

      // Append community sentence to ML reasoning
      const sentLabel  = communityScore >= 60 ? 'Bullish' : communityScore <= 40 ? 'Bearish' : 'Neutral';
      const sentSuffix = sentimentTotal > 0
        ? `Community ${sentLabel} (${communityScore}% of ${sentimentTotal} vote${sentimentTotal !== 1 ? 's' : ''})`
        : 'No community votes yet';
      const reasoning = `${(data.reasoning || '').replace(/\.$/, '')}. ${sentSuffix}.`;

      const signal = await prisma.signal.create({
        data: {
          stockId:        stock.id,
          verdict:        data.verdict,
          confidence:     compositeConf,
          reasoning,
          rsi:            data.technicals?.rsi  || null,
          macd:           data.technicals?.macd || null,
          buyProb:        data.buy_prob  != null ? data.buy_prob  : null,
          holdProb:       data.hold_prob != null ? data.hold_prob : null,
          sellProb:       data.sell_prob != null ? data.sell_prob : null,
          communityScore,
          sentimentTotal,
          source:         data.model_used ? 'xgboost' : 'heuristic',
        },
        include: { stock: { select: { ticker: true, displayTicker: true } } },
      });

      if (compositeConf >= 70 && (data.verdict === 'BUY' || data.verdict === 'SELL')) {
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
            notificationQueue.add({ notificationId: notification.id }).catch((err) => {
              logger.warn('[Signals] Notification queue unavailable', { error: err.message });
            });
          }
        } catch (notifErr) {
          logger.warn('[Signals] Watchlist notification failed', { error: notifErr.message });
        }
      }

      updated += 1;
      logger.info('[Signals] Saved', { ticker: stock.ticker, verdict: data.verdict });
      await sleep(STOCK_DELAY_MS);
    } catch (err) {
      failed += 1;
      logger.warn('[Signals] Predict failed', { ticker: stock.ticker, error: err.message });
    }
  }

  if (global.io) {
    global.io.emit('signals:refreshed', { updated, failed, total: stocks.length });
  }

  return { success: true, count: stocks.length, updated, failed };
}

module.exports = { refreshAllSignals };
