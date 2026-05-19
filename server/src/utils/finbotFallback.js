/** Keyword replies when gen-ai service is unreachable (mirrors gen-ai-service/app.py fallbacks). */
function finbotKeywordFallback(message) {
  const msg = (message || '').toLowerCase();
  if (['portfolio', 'optimize', 'rebalance'].some((w) => msg.includes(w))) {
    return 'For portfolio optimization, review sector allocation on the Portfolio page and use Optimize for AI rebalancing suggestions.';
  }
  if (['reliance', 'reli'].some((w) => msg.includes(w))) {
    return 'Reliance Industries (RELIANCE.NS) is in Energy. Check the Signal Board on Stocks for the latest ML signal.';
  }
  if (['rsi', 'macd', 'bollinger', 'sma'].some((w) => msg.includes(w))) {
    return 'RSI below 30 often signals oversold; above 70 overbought. MACD and Bollinger Bands are on the Stocks page.';
  }
  if (['beginner', 'start', 'new'].some((w) => msg.includes(w))) {
    return "Welcome to FinSocial! Try Beginner's Lounge in Tribe, the Signal Board, and small virtual trades to learn.";
  }
  return "I'm FinBot! Ask about stocks, portfolio ideas, or market concepts. (Running in offline demo mode — gen-ai service not connected.)";
}

module.exports = { finbotKeywordFallback };
