const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const { mlBaseUrl } = require('../utils/serviceUrls');
const ML_URL = mlBaseUrl();

exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [user, holdings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { virtualBalance: true },
      }),
      prisma.portfolioHolding.findMany({
        where: { userId },
        include: { stock: true },
      }),
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const enriched = holdings
      .filter((h) => h.stock)
      .map((h) => {
        const pnl = (h.stock.price - h.averageCost) * h.totalQuantity;
        const pnlPct = h.averageCost > 0
          ? ((h.stock.price - h.averageCost) / h.averageCost) * 100
          : 0;
        return {
          id: h.id,
          ticker: h.stock.ticker,
          displayTicker: h.stock.displayTicker,
          name: h.stock.name,
          sector: h.stock.sector,
          qty: h.totalQuantity,
          avg: h.averageCost,
          ltp: h.stock.price,
          currentValue: h.totalQuantity * h.stock.price,
          pnl,
          pnlPct,
          stockId: h.stockId,
        };
      });

    const totalValue = enriched.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPnl = enriched.reduce((sum, h) => sum + h.pnl, 0);

    res.json({
      balance: user.virtualBalance,
      holdings: enriched,
      totalValue,
      totalPnl,
      totalInvested: totalValue - totalPnl,
    });
  } catch (error) {
    logger.error('getPortfolio error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
};

exports.optimizePortfolio = async (req, res) => {
  try {
    const userId = req.user.userId;

    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId },
      include: { stock: true }
    });

    if (holdings.length === 0) {
      return res.json({ optimizedPortfolio: [], mode: 'no_holdings' });
    }

    const totalValue = holdings.reduce((sum, h) => sum + h.totalQuantity * h.stock.price, 0);
    const holdingsForML = holdings.map((h) => ({
      ticker: h.stock.ticker,
      currentAlloc: totalValue > 0 ? (h.totalQuantity * h.stock.price / totalValue) * 100 : 0,
    }));

    const mlResponse = await axios.post(
      `${ML_URL}/optimize`,
      { holdings: holdingsForML },
      { timeout: 120000 },
    );

    if (mlResponse.status >= 400) {
      return res.status(mlResponse.status).json(mlResponse.data);
    }
    res.json(mlResponse.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const payload = error.response?.data || { error: 'Optimization service unavailable' };
    logger.error('optimizePortfolio error', { error: error.message, status, payload });
    res.status(status).json(payload);
  }
};
