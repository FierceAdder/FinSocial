const { computeWinRatioFromTrades } = require('../src/utils/winRate');

describe('computeWinRatioFromTrades', () => {
  const stockId = 'stock-1';

  it('returns null when there are no SELL trades', () => {
    expect(computeWinRatioFromTrades([
      { stockId, side: 'BUY', quantity: 10, executionPrice: 100, totalValue: 1000, timestamp: '2024-01-01' },
    ])).toBeNull();
  });

  it('counts profitable sells vs total sells (not always 100%)', () => {
    const ratio = computeWinRatioFromTrades([
      { stockId, side: 'BUY', quantity: 10, executionPrice: 100, totalValue: 1000, timestamp: '2024-01-01' },
      { stockId, side: 'SELL', quantity: 5, executionPrice: 110, totalValue: 550, timestamp: '2024-01-02' },
      { stockId, side: 'SELL', quantity: 5, executionPrice: 90, totalValue: 450, timestamp: '2024-01-03' },
    ]);
    expect(ratio).toBeCloseTo(0.5, 5);
  });

  it('does not treat every sell as a win when execution price equals avg cost check', () => {
    const ratio = computeWinRatioFromTrades([
      { stockId, side: 'BUY', quantity: 10, executionPrice: 100, totalValue: 1000, timestamp: '2024-01-01' },
      { stockId, side: 'SELL', quantity: 10, executionPrice: 100, totalValue: 1000, timestamp: '2024-01-02' },
    ]);
    expect(ratio).toBe(0);
  });
});
