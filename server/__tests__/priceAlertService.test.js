const {
  detectPriceCross,
  VALID_DIRECTIONS,
  VALID_FREQUENCIES,
} = require('../src/services/priceAlertService');

describe('priceAlertService', () => {
  describe('detectPriceCross', () => {
    it('detects cross above target', () => {
      expect(detectPriceCross(99, 101, 100, 'ABOVE')).toBe(true);
      expect(detectPriceCross(99, 100, 100, 'ABOVE')).toBe(true);
      expect(detectPriceCross(100, 100, 100, 'ABOVE')).toBe(false);
      expect(detectPriceCross(101, 102, 100, 'ABOVE')).toBe(false);
    });

    it('detects cross below target', () => {
      expect(detectPriceCross(101, 99, 100, 'BELOW')).toBe(true);
      expect(detectPriceCross(101, 100, 100, 'BELOW')).toBe(true);
      expect(detectPriceCross(100, 100, 100, 'BELOW')).toBe(false);
      expect(detectPriceCross(99, 98, 100, 'BELOW')).toBe(false);
    });

    it('returns false for invalid numbers', () => {
      expect(detectPriceCross(null, 100, 100, 'ABOVE')).toBe(false);
      expect(detectPriceCross(99, NaN, 100, 'ABOVE')).toBe(false);
    });
  });

  it('exports valid enums', () => {
    expect(VALID_DIRECTIONS.has('ABOVE')).toBe(true);
    expect(VALID_FREQUENCIES.has('ONCE')).toBe(true);
  });
});
