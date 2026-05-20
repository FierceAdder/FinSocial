const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { VALID_DIRECTIONS, VALID_FREQUENCIES } = require('../services/priceAlertService');

const STOCK_INCLUDE = {
  stock: {
    select: {
      id: true,
      ticker: true,
      displayTicker: true,
      name: true,
      price: true,
    },
  },
};

function serializeAlert(row) {
  return {
    id: row.id,
    stockId: row.stockId,
    targetPrice: row.targetPrice,
    direction: row.direction,
    frequency: row.frequency,
    isActive: row.isActive,
    lastPrice: row.lastPrice,
    triggeredAt: row.triggeredAt,
    createdAt: row.createdAt,
    stock: row.stock,
  };
}

exports.listAlerts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { stockId, activeOnly } = req.query;

    const where = { userId };
    if (stockId) where.stockId = stockId;
    if (activeOnly === 'true') where.isActive = true;

    const alerts = await prisma.priceAlert.findMany({
      where,
      include: STOCK_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json(alerts.map(serializeAlert));
  } catch (error) {
    logger.error('listAlerts error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

exports.createAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { stockId, targetPrice, direction, frequency } = req.body;

    if (!stockId) {
      return res.status(400).json({ error: 'stockId is required' });
    }

    const price = Number(targetPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'targetPrice must be a positive number' });
    }

    const dir = String(direction || '').toUpperCase();
    const freq = String(frequency || '').toUpperCase();
    if (!VALID_DIRECTIONS.has(dir)) {
      return res.status(400).json({ error: 'direction must be ABOVE or BELOW' });
    }
    if (!VALID_FREQUENCIES.has(freq)) {
      return res.status(400).json({ error: 'frequency must be ONCE or EVERY' });
    }

    const stock = await prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const alert = await prisma.priceAlert.create({
      data: {
        userId,
        stockId,
        targetPrice: price,
        direction: dir,
        frequency: freq,
        lastPrice: stock.price,
        isActive: true,
      },
      include: STOCK_INCLUDE,
    });

    res.status(201).json(serializeAlert(alert));
  } catch (error) {
    logger.error('createAlert error', { error: error.message });
    res.status(500).json({ error: 'Failed to create alert' });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existing = await prisma.priceAlert.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await prisma.priceAlert.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    logger.error('deleteAlert error', { error: error.message });
    res.status(500).json({ error: 'Failed to delete alert' });
  }
};

exports.deactivateAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existing = await prisma.priceAlert.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const updated = await prisma.priceAlert.update({
      where: { id },
      data: { isActive: false },
      include: STOCK_INCLUDE,
    });

    res.json(serializeAlert(updated));
  } catch (error) {
    logger.error('deactivateAlert error', { error: error.message });
    res.status(500).json({ error: 'Failed to update alert' });
  }
};
