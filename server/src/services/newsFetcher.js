const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const { mlBaseUrl, genAiBaseUrl } = require('../utils/serviceUrls');
const ML_URL = mlBaseUrl();
const GEN_AI_URL = genAiBaseUrl();

async function fetchFromNewsApi(apiKey) {
  const headers = { 'X-Api-Key': apiKey };

  try {
    const { data } = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { country: 'in', category: 'business', pageSize: 15 },
      headers,
      timeout: 12000,
    });
    if (data?.articles?.length) return data.articles;
    if (data?.status === 'error') {
      logger.warn('[News] top-headlines error', { message: data.message, code: data.code });
    }
  } catch (e) {
    logger.warn('[News] top-headlines request failed', { error: e.response?.data?.message || e.message });
  }

  try {
    const { data } = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: 'India stock market OR NSE OR BSE OR Nifty',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 15,
      },
      headers,
      timeout: 12000,
    });
    if (data?.articles?.length) return data.articles;
    if (data?.status === 'error') {
      throw new Error(data.message || 'NewsAPI everything failed');
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    throw new Error(msg);
  }

  return [];
}

async function ingestArticle(article) {
  if (!article.url || !article.title) return null;

  const exists = await prisma.newsArticle.findUnique({ where: { url: article.url } });
  if (exists) return null;

  let summary = article.description || article.title;
  let tickers = [];

  try {
    const summaryRes = await axios.post(
      `${GEN_AI_URL}/summarize-news`,
      {
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
      },
      { timeout: 20000 },
    );
    summary = summaryRes.data.summary || summary;
    tickers = summaryRes.data.tickers || [];
  } catch (err) {
    logger.warn('[News] Summarization skipped', { title: article.title?.slice(0, 40), error: err.message });
  }

  let sentiment = 'neutral';
  try {
    const sentRes = await axios.post(
      `${ML_URL}/sentiment-batch`,
      { texts: [`${article.title}. ${summary}`] },
      { timeout: 10000 },
    );
    const result = sentRes.data.results?.[0];
    if (result?.label) sentiment = result.label;
  } catch (err) {
    logger.warn('[News] Sentiment skipped', { error: err.message });
  }

  const publishedAt = article.publishedAt ? new Date(article.publishedAt) : new Date();
  if (Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  return prisma.newsArticle.create({
    data: {
      url: article.url,
      title: article.title,
      description: article.description || null,
      content: article.content || null,
      summary,
      source: article.source?.name || 'NewsAPI',
      tickers,
      sentiment,
      publishedAt,
    },
  });
}

/**
 * Fetch from NewsAPI and persist new articles.
 * @returns {{ fetched: number, saved: number, error?: string }}
 */
async function fetchAndStoreNews() {
  const apiKey = process.env.NEWSAPI_KEY?.trim();
  if (!apiKey) {
    return { fetched: 0, saved: 0, error: 'NEWSAPI_KEY not configured' };
  }

  let articles;
  try {
    articles = await fetchFromNewsApi(apiKey);
  } catch (e) {
    logger.error('[News] NewsAPI fetch failed', { error: e.message });
    return { fetched: 0, saved: 0, error: e.message };
  }

  let saved = 0;
  let skipped = 0;
  const savedArticles = [];

  for (const article of articles) {
    try {
      const row = await ingestArticle(article);
      if (row) {
        saved += 1;
        savedArticles.push(row);
        if (global.io) {
          global.io.emit('feed:news', {
            id: row.id,
            title: row.title,
            summary: row.summary,
            sentiment: row.sentiment,
            tickers: row.tickers,
            source: row.source,
            url: row.url,
            publishedAt: row.publishedAt,
          });
        }
      } else {
        skipped += 1;
      }
    } catch (err) {
      logger.warn('[News] Ingest failed', { url: article.url, error: err.message });
    }
  }

  logger.info('[News] Fetch complete', { fetched: articles.length, saved, skipped });
  const result = { fetched: articles.length, saved, skipped };
  if (saved === 0 && articles.length > 0) {
    result.message = 'No new headlines — everything from NewsAPI is already in your feed.';
  }
  return result;
}

module.exports = { fetchAndStoreNews };
