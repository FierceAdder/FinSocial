const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { fetchHistoryForRange } = require('../utils/stockHistoryRange');
const { fetchBestEffortQuote, persistQuoteUpdate } = require('../services/quoteService');

exports.getAllStocks = async (req, res) => {
  try {
    const stocks = await prisma.stock.findMany({
      orderBy: { changePct: 'desc' },
      take: 50,
      include: {
        signals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      }
    });

    const result = stocks.map((s) => ({
      ...s,
      latestSignal: s.signals[0] || null,
      signals: undefined,
    }));

    res.json(result);
  } catch (error) {
    logger.error('getAllStocks error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
};

exports.getStock = async (req, res) => {
  try {
    const { ticker } = req.params;

    const skipQuote = req.query.skipQuote === '1' || req.query.skipQuote === 'true';
    if (!skipQuote) {
      const q = await fetchBestEffortQuote(ticker);
      if (q) {
        await persistQuoteUpdate(ticker, q);
      }
    }

    const stock = await prisma.stock.findUnique({ where: { ticker } });
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const range = req.query.range || '2y';
    const { history, interval, range: resolvedRange, historySource } = await fetchHistoryForRange(
      stock.id,
      ticker,
      range,
    );

    const latestSignal = await prisma.signal.findFirst({
      where: { stockId: stock.id },
      orderBy: { createdAt: 'desc' },
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      ...stock,
      history,
      historyRange: resolvedRange,
      historyInterval: interval,
      historySource: historySource || 'unknown',
      latestSignal,
    });
  } catch (error) {
    logger.error('getStock error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
};

exports.getStockByTicker = async (req, res) => {
  const { ticker } = req.params;
  req.params.ticker = decodeURIComponent(ticker);
  return exports.getStock(req, res);
};
