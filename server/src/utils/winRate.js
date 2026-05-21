/**
 * Win ratio = profitable SELLs / total SELLs in the period.
 * Each SELL is compared to the average cost basis for that stock immediately before the sale.
 *
 * @param {Array<{ stockId: string, side: string, quantity: number, executionPrice: number, totalValue?: number, timestamp: Date | string }>} trades
 * @returns {number | null} ratio in [0, 1], or null when there are no closed (SELL) trades
 */
function computeWinRatioFromTrades(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return null;

  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  /** @type {Map<string, { qty: number, avgCost: number }>} */
  const book = new Map();
  let wins = 0;
  let closed = 0;

  for (const t of sorted) {
    if (t.side !== 'BUY' && t.side !== 'SELL') continue;
    const stockId = t.stockId;
    const qty = Number(t.quantity) || 0;
    if (qty <= 0) continue;

    if (t.side === 'BUY') {
      const lot = book.get(stockId) || { qty: 0, avgCost: 0 };
      const addVal = Number.isFinite(t.totalValue) ? t.totalValue : t.executionPrice * qty;
      const newQty = lot.qty + qty;
      const newAvg = newQty > 0
        ? (lot.qty * lot.avgCost + addVal) / newQty
        : t.executionPrice;
      book.set(stockId, { qty: newQty, avgCost: newAvg });
      continue;
    }

    const lot = book.get(stockId) || { qty: 0, avgCost: t.executionPrice };
    const costBasis = lot.avgCost;
    const sellPx = t.executionPrice;

    if (sellPx > costBasis) wins += 1;
    closed += 1;

    const newQty = Math.max(0, lot.qty - qty);
    book.set(stockId, { qty: newQty, avgCost: lot.avgCost });
  }

  if (closed === 0) return null;
  return wins / closed;
}

module.exports = { computeWinRatioFromTrades };
