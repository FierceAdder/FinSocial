const { computeWinRatioFromTrades } = require('./winRate');

/**
 * @param {{ virtualBalance: number, holdings: Array<{ totalQuantity: number, averageCost: number, stock: { price: number } }>, trades: Array }} user
 */
function buildUserTradingStats(user) {
  const portfolioValue = user.holdings.reduce(
    (sum, h) => sum + h.totalQuantity * h.stock.price,
    0,
  ) + user.virtualBalance;

  const invested = user.holdings.reduce(
    (sum, h) => sum + h.totalQuantity * h.averageCost,
    0,
  );
  const unrealizedPnl = user.holdings.reduce(
    (sum, h) => sum + (h.stock.price - h.averageCost) * h.totalQuantity,
    0,
  );
  const returnsPct = invested > 0 ? (unrealizedPnl / invested) * 100 : 0;
  const tradeCount = user.trades.length;
  const closedSellCount = user.trades.filter((t) => t.side === 'SELL').length;
  const winRate = computeWinRatioFromTrades(user.trades);

  return {
    portfolioValue,
    returnsPct,
    tradeCount,
    closedSellCount,
    winRate,
  };
}

module.exports = { buildUserTradingStats, computeWinRatioFromTrades };
