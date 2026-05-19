require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const STOCKS_DATA = [
  { ticker: 'RELIANCE.NS', displayTicker: 'RELIANCE', name: 'Reliance Industries', price: 2943.55, change: 38.20, changePct: 1.32, sector: 'Energy', industry: 'Oil & Gas', mcap: 19800000000000, pe: 28.4, high52: 3024, low52: 2220, volume: 12400000 },
  { ticker: 'TCS.NS', displayTicker: 'TCS', name: 'Tata Consultancy Services', price: 3412.10, change: -47.30, changePct: -1.37, sector: 'IT', industry: 'Software Services', mcap: 12400000000000, pe: 30.2, high52: 4045, low52: 3310, volume: 4200000 },
  { ticker: 'INFY.NS', displayTicker: 'INFY', name: 'Infosys Limited', price: 1587.40, change: 22.15, changePct: 1.41, sector: 'IT', industry: 'Software Services', mcap: 6600000000000, pe: 25.8, high52: 1810, low52: 1358, volume: 8700000 },
  { ticker: 'HDFCBANK.NS', displayTicker: 'HDFCBANK', name: 'HDFC Bank Limited', price: 1695.30, change: 28.45, changePct: 1.71, sector: 'Banking', industry: 'Private Banks', mcap: 12900000000000, pe: 19.6, high52: 1794, low52: 1420, volume: 15100000 },
  { ticker: 'ITC.NS', displayTicker: 'ITC', name: 'ITC Limited', price: 468.25, change: -2.10, changePct: -0.45, sector: 'FMCG', industry: 'Cigarettes & FMCG', mcap: 5800000000000, pe: 27.1, high52: 510, low52: 398, volume: 18300000 },
  { ticker: 'BAJFINANCE.NS', displayTicker: 'BAJFINANCE', name: 'Bajaj Finance Limited', price: 6842.30, change: 112.50, changePct: 1.67, sector: 'Finance', industry: 'NBFC', mcap: 4200000000000, pe: 35.4, high52: 7440, low52: 6112, volume: 3100000 },
  { ticker: 'WIPRO.NS', displayTicker: 'WIPRO', name: 'Wipro Limited', price: 487.60, change: -6.40, changePct: -1.30, sector: 'IT', industry: 'Software Services', mcap: 2540000000000, pe: 22.1, high52: 562, low52: 410, volume: 6200000 },
  { ticker: 'SBIN.NS', displayTicker: 'SBIN', name: 'State Bank of India', price: 812.40, change: 14.20, changePct: 1.78, sector: 'Banking', industry: 'Public Sector Banks', mcap: 7250000000000, pe: 11.2, high52: 912, low52: 600, volume: 28400000 },
  { ticker: 'TATAMOTORS.NS', displayTicker: 'TATAMOTORS', name: 'Tata Motors Limited', price: 924.15, change: -18.30, changePct: -1.94, sector: 'Auto', industry: 'Automobiles', mcap: 3420000000000, pe: 12.8, high52: 1065, low52: 780, volume: 9800000 },
  { ticker: 'SUNPHARMA.NS', displayTicker: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries', price: 1689.70, change: 31.20, changePct: 1.88, sector: 'Pharma', industry: 'Pharmaceuticals', mcap: 4050000000000, pe: 38.2, high52: 1820, low52: 1240, volume: 5200000 },
  { ticker: 'NTPC.NS', displayTicker: 'NTPC', name: 'NTPC Limited', price: 362.40, change: 4.80, changePct: 1.34, sector: 'Power', industry: 'Power Generation', mcap: 3510000000000, pe: 16.4, high52: 448, low52: 290, volume: 22100000 },
  { ticker: 'ASIANPAINT.NS', displayTicker: 'ASIANPAINT', name: 'Asian Paints Limited', price: 2418.60, change: -32.10, changePct: -1.31, sector: 'FMCG', industry: 'Paints', mcap: 2314000000000, pe: 52.3, high52: 3394, low52: 2100, volume: 1480000 },
  { ticker: 'HINDUNILVR.NS', displayTicker: 'HINDUNILVR', name: 'Hindustan Unilever Limited', price: 2312.40, change: 18.90, changePct: 0.82, sector: 'FMCG', industry: 'Consumer Goods', mcap: 5432000000000, pe: 58.1, high52: 2724, low52: 2188, volume: 1920000 },
  { ticker: 'AXISBANK.NS', displayTicker: 'AXISBANK', name: 'Axis Bank Limited', price: 1124.50, change: -9.30, changePct: -0.82, sector: 'Banking', industry: 'Private Banks', mcap: 3462000000000, pe: 16.8, high52: 1340, low52: 990, volume: 11200000 },
  { ticker: 'MARUTI.NS', displayTicker: 'MARUTI', name: 'Maruti Suzuki India Limited', price: 12480.30, change: 240.50, changePct: 1.97, sector: 'Auto', industry: 'Passenger Cars', mcap: 3765000000000, pe: 28.6, high52: 13400, low52: 9900, volume: 620000 },
  { ticker: 'ULTRACEMCO.NS', displayTicker: 'ULTRACEMCO', name: 'UltraTech Cement Limited', price: 10842.60, change: 122.30, changePct: 1.14, sector: 'Materials', industry: 'Cement', mcap: 3120000000000, pe: 42.1, high52: 12400, low52: 9200, volume: 380000 },
  { ticker: 'DRREDDY.NS', displayTicker: 'DRREDDY', name: "Dr. Reddy's Laboratories", price: 5812.40, change: -68.20, changePct: -1.16, sector: 'Pharma', industry: 'Pharmaceuticals', mcap: 972000000000, pe: 29.4, high52: 7200, low52: 5100, volume: 1240000 },
  { ticker: 'TATASTEEL.NS', displayTicker: 'TATASTEEL', name: 'Tata Steel Limited', price: 168.40, change: 2.10, changePct: 1.26, sector: 'Materials', industry: 'Steel', mcap: 2102000000000, pe: 8.2, high52: 184, low52: 120, volume: 82000000 },
  { ticker: 'KOTAKBANK.NS', displayTicker: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1842.60, change: -22.10, changePct: -1.19, sector: 'Banking', industry: 'Private Banks', mcap: 3652000000000, pe: 22.4, high52: 2190, low52: 1700, volume: 8200000 },
  { ticker: 'ONGC.NS', displayTicker: 'ONGC', name: 'Oil & Natural Gas Corporation', price: 284.60, change: 3.80, changePct: 1.35, sector: 'Energy', industry: 'Oil & Gas Exploration', mcap: 3582000000000, pe: 6.8, high52: 345, low52: 210, volume: 34200000 },
  { ticker: 'POWERGRID.NS', displayTicker: 'POWERGRID', name: 'Power Grid Corporation of India', price: 312.40, change: 4.20, changePct: 1.36, sector: 'Power', industry: 'Power Transmission', mcap: 2902000000000, pe: 18.2, high52: 366, low52: 242, volume: 14800000 },
  { ticker: 'ADANIENT.NS', displayTicker: 'ADANIENT', name: 'Adani Enterprises Limited', price: 2642.30, change: -48.20, changePct: -1.79, sector: 'Conglomerate', industry: 'Diversified', mcap: 3012000000000, pe: 96.4, high52: 3743, low52: 2024, volume: 2180000 },
  { ticker: 'CIPLA.NS', displayTicker: 'CIPLA', name: 'Cipla Limited', price: 1548.20, change: 18.40, changePct: 1.20, sector: 'Pharma', industry: 'Pharmaceuticals', mcap: 1248000000000, pe: 32.4, high52: 1720, low52: 1240, volume: 3200000 },
  { ticker: 'HCLTECH.NS', displayTicker: 'HCLTECH', name: 'HCL Technologies Limited', price: 1682.40, change: 24.30, changePct: 1.47, sector: 'IT', industry: 'Software Services', mcap: 4566000000000, pe: 28.2, high52: 1944, low52: 1420, volume: 4800000 },
  { ticker: 'LT.NS', displayTicker: 'LT', name: 'Larsen & Toubro Limited', price: 3568.40, change: 52.30, changePct: 1.49, sector: 'Infrastructure', industry: 'Engineering & Construction', mcap: 4892000000000, pe: 38.6, high52: 3964, low52: 3010, volume: 3600000 },
];

const TRIBE_CHANNELS = [
  { name: "Beginner's Lounge", slug: 'beginners-lounge', description: 'Ask any question, no matter how basic. No judgment here!', type: 'text' },
  { name: 'IPO Watch', slug: 'ipo-watch', description: 'Discuss upcoming IPOs, GMP, subscriptions, and allotment tips.', type: 'text' },
  { name: 'Sector Spotlight', slug: 'sector-spotlight', description: 'IT, Pharma, Banking, FMCG, and beyond. Deep sector analysis.', type: 'text' },
  { name: 'Platform Help', slug: 'platform-help', description: 'Understand FinSocial features and navigate your portfolio.', type: 'text' },
  { name: 'Mutual Funds Corner', slug: 'mutual-funds', description: 'SIPs, index funds, and long-term investing strategies.', type: 'text' },
];

const DUMMY_USERS = [
  { email: 'vikram@demo.com', firstName: 'Vikram', lastName: 'Malhotra', experienceLevel: 'advanced', isVerified: true, verifiedReason: 'Expert Trader — 83% win rate over 245 trades', bio: 'Swing trader. Focus on momentum & breakouts. 10+ years market experience.' },
  { email: 'ananya@demo.com', firstName: 'Ananya', lastName: 'Patel', experienceLevel: 'advanced', isVerified: true, verifiedReason: 'Expert Trader — 71% win rate over 198 trades', bio: 'Value investor. Long-term positions in quality businesses.' },
  { email: 'rahul@demo.com', firstName: 'Rahul', lastName: 'Sharma', experienceLevel: 'intermediate', isVerified: false, bio: 'Learning the ropes. Love banking and FMCG stocks.' },
  { email: 'priya@demo.com', firstName: 'Priya', lastName: 'Menon', experienceLevel: 'intermediate', isVerified: false, bio: 'IT sector enthusiast. Following TCS, Infy closely.' },
  { email: 'arjun@demo.com', firstName: 'Arjun', lastName: 'Nair', experienceLevel: 'beginner', isVerified: false, bio: 'Just started my investing journey. Excited to learn!' },
  { email: 'meera@demo.com', firstName: 'Meera', lastName: 'Iyer', experienceLevel: 'beginner', isVerified: false, bio: 'SIP investor. Long-term wealth creation is my goal.' },
  { email: 'kiran@demo.com', firstName: 'Kiran', lastName: 'Rao', experienceLevel: 'intermediate', isVerified: false, bio: 'Options trader. Risk management first.' },
  { email: 'demo@finsocial.com', firstName: 'Demo', lastName: 'User', experienceLevel: 'beginner', isVerified: false, bio: 'Test account for demos.' },
];

async function main() {
  console.log('🌱 Starting rich seed...');

  // Stocks
  const stockMap = {};
  for (const s of STOCKS_DATA) {
    const stock = await prisma.stock.upsert({
      where: { ticker: s.ticker },
      update: { price: s.price, change: s.change, changePct: s.changePct, lastUpdated: new Date() },
      create: s,
    });
    stockMap[s.ticker] = stock;
  }
  console.log(`✓ ${Object.keys(stockMap).length} stocks seeded`);
  console.log('  → Run npm run import-history for real Yahoo OHLCV (charts + XGBoost need this)');

  // Tribe channels
  const channelMap = {};
  for (const c of TRIBE_CHANNELS) {
    const ch = await prisma.tribeChannel.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
    channelMap[c.slug] = ch;
  }
  console.log(`✓ ${Object.keys(channelMap).length} tribe channels seeded`);

  // Users
  const pw = await bcrypt.hash('Demo@1234', 10);
  const userMap = {};
  for (const u of DUMMY_USERS) {
    const username = u.email.split('@')[0];
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        ...u,
        username,
        passwordHash: pw,
        virtualBalance: 1000000,
      },
    });
    userMap[u.email] = user;
  }
  console.log(`✓ ${Object.keys(userMap).length} users seeded`);

  const users = Object.values(userMap);
  const vikram = userMap['vikram@demo.com'];
  const ananya = userMap['ananya@demo.com'];
  const rahul = userMap['rahul@demo.com'];
  const priya = userMap['priya@demo.com'];
  const arjun = userMap['arjun@demo.com'];
  const reliance = stockMap['RELIANCE.NS'];
  const tcs = stockMap['TCS.NS'];
  const hdfcbank = stockMap['HDFCBANK.NS'];
  const infy = stockMap['INFY.NS'];
  const bajfinance = stockMap['BAJFINANCE.NS'];

  // Trades for experienced users
  const tradeSeeds = [
    { userId: vikram.id, stockId: reliance.id, side: 'BUY', quantity: 100, executionPrice: 2780, totalValue: 278000, reason: 'Breakout above 200DMA', timestamp: daysAgo(30) },
    { userId: vikram.id, stockId: tcs.id, side: 'BUY', quantity: 50, executionPrice: 3210, totalValue: 160500, reason: 'Strong Q2 results', timestamp: daysAgo(25) },
    { userId: vikram.id, stockId: hdfcbank.id, side: 'BUY', quantity: 80, executionPrice: 1580, totalValue: 126400, reason: 'Banking sector re-rating', timestamp: daysAgo(20) },
    { userId: ananya.id, stockId: infy.id, side: 'BUY', quantity: 120, executionPrice: 1480, totalValue: 177600, reason: 'Undervalued vs peers', timestamp: daysAgo(45) },
    { userId: ananya.id, stockId: bajfinance.id, side: 'BUY', quantity: 30, executionPrice: 6200, totalValue: 186000, reason: 'NBFC credit growth thesis', timestamp: daysAgo(35) },
    { userId: rahul.id, stockId: hdfcbank.id, side: 'BUY', quantity: 50, executionPrice: 1620, totalValue: 81000, reason: 'Long-term hold', timestamp: daysAgo(15) },
    { userId: priya.id, stockId: tcs.id, side: 'BUY', quantity: 40, executionPrice: 3350, totalValue: 134000, reason: 'IT sector recovery', timestamp: daysAgo(10) },
  ];

  for (const t of tradeSeeds) {
    await prisma.trade.upsert({
      where: { id: `seed-trade-${t.userId}-${t.stockId}-${t.side}`.slice(0, 36) },
      update: {},
      create: { id: `seed-trade-${t.userId}-${t.stockId}-${t.side}`.slice(0, 36), ...t },
    }).catch(() => prisma.trade.create({ data: t }));
  }

  // Portfolio holdings
  const holdingSeeds = [
    { userId: vikram.id, stockId: reliance.id, totalQuantity: 100, averageCost: 2780 },
    { userId: vikram.id, stockId: tcs.id, totalQuantity: 50, averageCost: 3210 },
    { userId: vikram.id, stockId: hdfcbank.id, totalQuantity: 80, averageCost: 1580 },
    { userId: ananya.id, stockId: infy.id, totalQuantity: 120, averageCost: 1480 },
    { userId: ananya.id, stockId: bajfinance.id, totalQuantity: 30, averageCost: 6200 },
    { userId: rahul.id, stockId: hdfcbank.id, totalQuantity: 50, averageCost: 1620 },
    { userId: priya.id, stockId: tcs.id, totalQuantity: 40, averageCost: 3350 },
  ];

  for (const h of holdingSeeds) {
    await prisma.portfolioHolding.upsert({
      where: { userId_stockId: { userId: h.userId, stockId: h.stockId } },
      update: {},
      create: h,
    });
  }
  console.log('✓ Trades and holdings seeded');

  // Sentiment votes
  const sentimentSeeds = [
    { userId: vikram.id, stockId: reliance.id, vote: 'bullish' },
    { userId: vikram.id, stockId: tcs.id, vote: 'bullish' },
    { userId: ananya.id, stockId: infy.id, vote: 'bullish' },
    { userId: ananya.id, stockId: bajfinance.id, vote: 'bullish' },
    { userId: rahul.id, stockId: hdfcbank.id, vote: 'bullish' },
    { userId: priya.id, stockId: tcs.id, vote: 'neutral' },
    { userId: arjun.id, stockId: reliance.id, vote: 'neutral' },
  ];

  for (const s of sentimentSeeds) {
    await prisma.sentimentVote.upsert({
      where: { userId_stockId: { userId: s.userId, stockId: s.stockId } },
      update: {},
      create: s,
    });
  }
  console.log('✓ Sentiment votes seeded');

  // Forum Q&A
  const questionSeeds = [
    {
      userId: arjun.id,
      title: 'How do I read a candlestick chart as a beginner?',
      body: 'I just signed up and see these green and red candles everywhere. What do they mean and how do I use them to make decisions?',
      tags: ['Beginner', 'Technical Analysis', 'Charts'],
    },
    {
      userId: arjun.id,
      title: 'What is the difference between NSE and BSE?',
      body: 'I see stocks listed on both NSE and BSE. What is the difference and does it matter which one I buy from?',
      tags: ['Beginner', 'Stock Exchange'],
    },
    {
      userId: rahul.id,
      title: 'How to analyze bank stocks properly?',
      body: 'I want to invest in HDFC Bank but don\'t know the key metrics for banking. What are NIM, GNPA, PCR?',
      tags: ['Banking', 'Fundamental Analysis'],
    },
    {
      userId: priya.id,
      title: 'What is the impact of Fed rate cuts on Indian IT sector?',
      body: 'Will IT stocks like TCS and Infosys benefit from US Fed rate cuts? How does that flow through?',
      tags: ['Macro', 'IT', 'US Markets'],
    },
    {
      userId: userMap['meera@demo.com'].id,
      title: 'SIP vs lump sum — which is better for a beginner?',
      body: 'I have ₹5,000 per month to invest. Should I do SIP in index funds or wait and invest a lump sum?',
      tags: ['Mutual Funds', 'SIP', 'Beginner'],
    },
    {
      userId: userMap['kiran@demo.com'].id,
      title: 'How does implied volatility affect option premiums?',
      body: 'I keep seeing IV mentioned in options chains. How does it affect the price I pay for a call or put?',
      tags: ['Options', 'Derivatives', 'Intermediate'],
    },
    {
      userId: rahul.id,
      title: 'Is Reliance a good buy at ₹2900?',
      body: 'Reliance has been consolidating between 2850-3000 for weeks. Is this a good accumulation zone or should I wait for a breakout?',
      tags: ['RELIANCE', 'Technical Analysis', 'Energy'],
    },
    {
      userId: priya.id,
      title: 'How to interpret the RSI indicator?',
      body: 'The Signal Board shows RSI values. What does RSI above 70 or below 30 mean in practice?',
      tags: ['Technical Analysis', 'RSI', 'Intermediate'],
    },
  ];

  const createdQuestions = [];
  for (const q of questionSeeds) {
    const question = await prisma.forumQuestion.create({ data: q });
    createdQuestions.push(question);
  }

  // Answers
  const answerSeeds = [
    {
      questionId: createdQuestions[0].id,
      userId: vikram.id,
      body: 'A candlestick has a body (open to close price) and wicks (high and low). Green means the price closed higher than it opened (bullish). Red means it closed lower (bearish). The size of the body shows conviction — a long green body means strong buying. Wicks show where price was rejected. Start by identifying support/resistance zones where multiple wicks touch the same level.',
      isAccepted: true,
    },
    {
      questionId: createdQuestions[0].id,
      userId: ananya.id,
      body: 'Great question! Also look at patterns: a "Doji" (tiny body) means indecision. A "Hammer" (long lower wick, small body at top) at support is bullish. The FinSocial Signal Board uses these patterns alongside RSI and MACD to generate signals. Check the Stocks page for live examples!',
      isAccepted: false,
    },
    {
      questionId: createdQuestions[2].id,
      userId: ananya.id,
      body: 'For banks, the key metrics are: NIM (Net Interest Margin) — higher is better, above 3% is good. GNPA (Gross Non-Performing Assets) — lower is better, below 2% is healthy. PCR (Provision Coverage Ratio) — higher is safer, above 70% is good. ROE above 15% shows efficient capital use. HDFC Bank scores well on all these metrics historically.',
      isAccepted: true,
    },
    {
      questionId: createdQuestions[4].id,
      userId: vikram.id,
      body: 'For a beginner, SIP is almost always better. It averages your cost over time (rupee cost averaging), removes the emotional pressure of timing the market, and builds discipline. A Nifty 50 index fund SIP of ₹5K/month over 20 years at 12% CAGR grows to ₹49+ lakhs. The best time to start is now.',
      isAccepted: true,
    },
  ];

  for (const a of answerSeeds) {
    await prisma.forumAnswer.create({ data: a });
  }

  // Update vote counts for answered questions
  for (const q of createdQuestions.slice(0, 4)) {
    await prisma.forumQuestion.update({
      where: { id: q.id },
      data: { votes: Math.floor(Math.random() * 40) + 5 }
    });
  }

  console.log('✓ Forum Q&A seeded');

  // Tribe starter messages
  const starterMessages = {
    'beginners-lounge': [
      { userId: vikram.id, content: 'Welcome everyone! This is a safe space to ask ANY investing question. No such thing as a dumb question here. 👋' },
      { userId: ananya.id, content: 'Happy to help beginners! I started knowing nothing about stocks. Ask away!' },
      { userId: arjun.id, content: 'Hi! Just joined. How do I start with ₹10,000 as a first investment?' },
      { userId: vikram.id, content: '@Arjun Great question! Start with a Nifty 50 index fund. Low cost, instant diversification. Avoid individual stocks until you understand fundamentals.' },
    ],
    'sector-spotlight': [
      { userId: rahul.id, content: 'Banking sector update: RBI kept rates unchanged. HDFCBANK and SBIN likely to benefit from stable NIMs. Watching closely.' },
      { userId: vikram.id, content: 'IT sector seeing headwinds from slow US client spending. TCS guidance was cautious. Waiting for confirmation before adding.' },
      { userId: priya.id, content: 'Pharma is quietly outperforming. SUNPHARMA up 12% this quarter. Any sector specialists here?' },
    ],
    'ipo-watch': [
      { userId: ananya.id, content: 'Stay alert for upcoming IPOs this quarter! Always check GMP (Grey Market Premium) as an indicator of listing expectations.' },
      { userId: userMap['kiran@demo.com'].id, content: 'Reminder: apply via ASBA only. Never pay premium for IPO allotments — that\'s illegal.' },
    ],
    'platform-help': [
      { userId: vikram.id, content: 'Quick tip: Use the Signal Board on the Stocks page to see ML-powered BUY/SELL signals with confidence levels!' },
      { userId: ananya.id, content: 'For portfolio optimization, click "Optimize" in your Portfolio page to get AI-powered rebalancing suggestions.' },
    ],
    'mutual-funds': [
      { userId: ananya.id, content: 'Index funds vs active funds: For most investors, index funds win due to lower expense ratios. A 0.5% difference in expense ratio costs you lakhs over 20 years.' },
      { userId: userMap['meera@demo.com'].id, content: 'Which index fund do you recommend for a 10-year SIP? Nifty 50 or Nifty Next 50?' },
      { userId: ananya.id, content: 'Both! Nifty 50 for stability (large caps), Next 50 for growth potential. A 70/30 split is popular.' },
    ],
  };

  for (const [slug, messages] of Object.entries(starterMessages)) {
    const channel = channelMap[slug];
    if (!channel) continue;
    for (const msg of messages) {
      await prisma.chatMessage.create({
        data: { channelId: channel.id, userId: msg.userId, content: msg.content }
      });
    }
  }
  console.log('✓ Tribe starter messages seeded');

  // Seed initial signals
  const signalSeeds = [
    { stockId: reliance.id, verdict: 'BUY', confidence: 78, reasoning: 'RSI at 42 (neutral zone), MACD bullish crossover. 50-day MA above 200-day MA. Volume surge 18% above 20-day avg.', rsi: 42, macd: 12.4, source: 'ml' },
    { stockId: tcs.id, verdict: 'HOLD', confidence: 61, reasoning: 'RSI at 58, approaching overbought. MACD positive but flattening. Await Q3 guidance confirmation.', rsi: 58, macd: 8.2, source: 'ml' },
    { stockId: hdfcbank.id, verdict: 'BUY', confidence: 82, reasoning: 'Strong breakout above 1650 resistance. RSI 55, healthy. Volume 24% above average. Banking sector tailwinds.', rsi: 55, macd: 18.6, source: 'ml' },
    { stockId: infy.id, verdict: 'BUY', confidence: 71, reasoning: 'RSI 48, room to run. Positive earnings surprise expected. IT sector recovery thesis intact.', rsi: 48, macd: 6.8, source: 'ml' },
    { stockId: bajfinance.id, verdict: 'SELL', confidence: 65, reasoning: 'RSI 72, overbought territory. MACD showing bearish divergence. Consider booking profits.', rsi: 72, macd: -4.2, source: 'ml' },
  ];

  for (const s of signalSeeds) {
    await prisma.signal.create({ data: s });
  }
  console.log('✓ Initial signals seeded');

  // Leaderboard snapshots
  const lbData = [
    { userId: vikram.id, period: 'weekly', rank: 1, returnsPct: 8.42, tradeCount: 12, winRate: 0.83, portfolioValue: 1480000 },
    { userId: ananya.id, period: 'weekly', rank: 2, returnsPct: 6.18, tradeCount: 8, winRate: 0.75, portfolioValue: 1380000 },
    { userId: rahul.id, period: 'weekly', rank: 3, returnsPct: 4.21, tradeCount: 6, winRate: 0.67, portfolioValue: 1180000 },
    { userId: vikram.id, period: 'monthly', rank: 1, returnsPct: 22.4, tradeCount: 34, winRate: 0.71, portfolioValue: 1480000 },
    { userId: ananya.id, period: 'monthly', rank: 2, returnsPct: 18.7, tradeCount: 28, winRate: 0.69, portfolioValue: 1380000 },
    { userId: vikram.id, period: 'alltime', rank: 1, returnsPct: 48.2, tradeCount: 245, winRate: 0.72, portfolioValue: 1480000 },
    { userId: ananya.id, period: 'alltime', rank: 2, returnsPct: 38.7, tradeCount: 198, winRate: 0.65, portfolioValue: 1380000 },
  ];

  for (const lb of lbData) {
    await prisma.leaderboardSnapshot.create({ data: lb });
  }
  console.log('✓ Leaderboard snapshots seeded');

  console.log('\n🎉 Rich seed complete!');
  console.log('Demo credentials: any user above with password Demo@1234');
  console.log('e.g. vikram@demo.com / Demo@1234 (Verified Trader)');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
