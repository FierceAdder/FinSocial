const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { notificationQueue } = require('../jobs/index');

const VALID_DIRECTIONS = new Set(['ABOVE', 'BELOW']);
const VALID_FREQUENCIES = new Set(['ONCE', 'EVERY']);

function detectPriceCross(lastPrice, currentPrice, targetPrice, direction) {
  if (
    !Number.isFinite(lastPrice) ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(targetPrice)
  ) {
    return false;
  }

  if (direction === 'ABOVE') {
    return lastPrice < targetPrice && currentPrice >= targetPrice;
  }
  if (direction === 'BELOW') {
    return lastPrice > targetPrice && currentPrice <= targetPrice;
  }
  return false;
}

function formatDirectionLabel(direction) {
  return direction === 'ABOVE' ? 'crossed above' : 'crossed below';
}

function formatInr(price) {
  return `₹${Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * After a stock quote update, evaluate active alerts and notify on crosses.
 */
async function evaluatePriceAlertsForStock(stockId, previousPrice, currentPrice) {
  if (!Number.isFinite(previousPrice) || !Number.isFinite(currentPrice)) {
    return { triggered: 0 };
  }

  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
    select: { id: true, ticker: true, displayTicker: true },
  });
  if (!stock) return { triggered: 0 };

  const alerts = await prisma.priceAlert.findMany({
    where: { stockId, isActive: true },
    include: { user: { select: { id: true } } },
  });

  let triggered = 0;

  for (const alert of alerts) {
    const crossed = detectPriceCross(
      alert.lastPrice,
      currentPrice,
      alert.targetPrice,
      alert.direction,
    );

    await prisma.priceAlert.update({
      where: { id: alert.id },
      data: { lastPrice: currentPrice },
    });

    if (!crossed) continue;

    const display = stock.displayTicker || stock.ticker.replace(/\.NS$/i, '');
    const dirLabel = formatDirectionLabel(alert.direction);
    const title = `${display} ${dirLabel} ${formatInr(alert.targetPrice)}`;
    const body =
      `Price is now ${formatInr(currentPrice)} (was ${formatInr(previousPrice)}). ` +
      `Your alert: notify when price ${dirLabel} ${formatInr(alert.targetPrice)}. ` +
      'Quotes refresh about every 5 minutes during market hours.';

    const notification = await prisma.notification.create({
      data: {
        userId: alert.userId,
        type: 'price_alert',
        title,
        body,
        payload: {
          stockId,
          ticker: stock.ticker,
          targetPrice: alert.targetPrice,
          direction: alert.direction,
          currentPrice,
          previousPrice,
        },
      },
    });

    notificationQueue.add({ notificationId: notification.id });

    if (global.io) {
      global.io.to(`user:${alert.userId}`).emit('notification:new', {
        id: notification.id,
        type: 'price_alert',
        title,
        body,
      });
    }

    if (alert.frequency === 'ONCE') {
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: { isActive: false, triggeredAt: new Date() },
      });
    }

    triggered += 1;
    logger.info('[PriceAlert] Triggered', {
      alertId: alert.id,
      ticker: stock.ticker,
      userId: alert.userId,
      frequency: alert.frequency,
    });
  }

  return { triggered };
}

module.exports = {
  VALID_DIRECTIONS,
  VALID_FREQUENCIES,
  detectPriceCross,
  evaluatePriceAlertsForStock,
};
