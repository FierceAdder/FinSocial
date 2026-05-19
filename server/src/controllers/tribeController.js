const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { ensureTribeChannelsIfNeeded } = require('../utils/ensureTribeChannels');

const { genAiBaseUrl } = require('../utils/serviceUrls');
const { finbotKeywordFallback } = require('../utils/finbotFallback');
const { isGenAiUnreachable, extractGenAiErrorReply } = require('../utils/genAiErrors');

exports.getChannels = async (req, res) => {
  try {
    await ensureTribeChannelsIfNeeded();
    const channels = await prisma.tribeChannel.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { messages: true } }
      }
    });
    res.json(channels);
  } catch (error) {
    logger.error('getChannels error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await prisma.chatMessage.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, isVerified: true } },
        poll: true,
      },
      orderBy: { timestamp: 'asc' },
      take: 200,
    });
    res.json(messages);
  } catch (error) {
    logger.error('getMessages error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.createPoll = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { question, options, endsAt } = req.body;
    const userId = req.user.userId;

    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Poll needs a question and at least 2 options' });
    }

    const poll = await prisma.tribePoll.create({
      data: {
        channelId,
        question,
        options,
        votes: {},
        createdBy: userId,
        endsAt: endsAt ? new Date(endsAt) : null,
      }
    });

    // Announce poll in channel
    const botMsg = await prisma.chatMessage.create({
      data: {
        channelId,
        userId,
        pollId: poll.id,
        content: `📊 Poll: ${question}`,
        isBot: false,
      },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, isVerified: true } },
        poll: true,
      },
    });

    if (global.io) {
      global.io.to(channelId).emit('tribe:poll', { poll, message: botMsg });
    }

    res.status(201).json({ poll, announcement: botMsg });
  } catch (error) {
    logger.error('createPoll error', { error: error.message });
    res.status(500).json({ error: 'Failed to create poll' });
  }
};

exports.votePoll = async (req, res) => {
  try {
    const { pollId } = req.params;
    const { option } = req.body;
    const userId = req.user.userId;

    const poll = await prisma.tribePoll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (!poll.options.includes(option)) return res.status(400).json({ error: 'Invalid option' });

    const prev =
      poll.votes && typeof poll.votes === 'object' && !Array.isArray(poll.votes) ? poll.votes : {};
    const votes = { ...prev, [userId]: option };

    const updated = await prisma.tribePoll.update({
      where: { id: pollId },
      data: { votes }
    });

    // Compute results
    const results = {};
    for (const opt of poll.options) results[opt] = 0;
    for (const v of Object.values(votes)) results[v] = (results[v] || 0) + 1;

    if (global.io) {
      global.io.to(poll.channelId).emit('tribe:poll_update', { pollId, results });
    }

    res.json({ results, totalVotes: Object.keys(votes).length });
  } catch (error) {
    logger.error('votePoll error', { error: error.message });
    res.status(500).json({ error: 'Failed to vote on poll' });
  }
};

exports.getPolls = async (req, res) => {
  try {
    const { channelId } = req.params;
    const polls = await prisma.tribePoll.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json(polls);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
};

exports.finbotReply = async (req, res) => {
  const { message, history } = req.body;
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    return res.status(400).json({ error: 'Message is required', reply: 'Please enter a message to send to FinBot.' });
  }

  const genAiUrl = genAiBaseUrl();
  const chatUrl = `${genAiUrl}/chat`;

  try {
    const response = await axios.post(
      chatUrl,
      { message: trimmed, history: Array.isArray(history) ? history : [] },
      { timeout: 45000 },
    );
    const data = response.data;
    if (data && typeof data.reply === 'string' && data.reply.trim()) {
      return res.json({
        reply: data.reply,
        source: data.source || 'gemini',
      });
    }
    logger.warn('finbotReply unexpected upstream payload', { keys: data ? Object.keys(data) : null });
    return res.json({
      reply: finbotKeywordFallback(trimmed),
      source: 'fallback',
    });
  } catch (error) {
    const data = error.response?.data;
    logger.error('finbotReply error', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      upstream: typeof data === 'string' ? data.slice(0, 300) : data,
      genAiUrl: chatUrl,
      genAiConfigured: Boolean(process.env.GEN_AI_SERVICE_URL),
    });

    if (isGenAiUnreachable(error)) {
      const offlineHint = !process.env.GEN_AI_SERVICE_URL
        ? ' On Render, set GEN_AI_SERVICE_URL on core-api to your public gen-ai URL. Locally, run gen-ai on port 5002 or set GEN_AI_SERVICE_URL.'
        : '';
      return res.json({
        reply: finbotKeywordFallback(trimmed) + offlineHint,
        source: 'fallback',
      });
    }

    const reply = extractGenAiErrorReply(
      error,
      'FinBot AI error. Check gen-ai /health (llm_ready, gemini_key_configured) and GEMINI_API_KEY on the gen-ai service.',
    );
    return res.json({ reply, source: 'error' });
  }
};
