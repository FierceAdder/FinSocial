const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { ensureTribeChannelsIfNeeded } = require('../utils/ensureTribeChannels');

const { genAiBaseUrl } = require('../utils/serviceUrls');
const { finbotKeywordFallback } = require('../utils/finbotFallback');
const GEN_AI_URL = genAiBaseUrl();

function isGenAiUnreachable(err) {
  if (err.response) return false;
  const code = err.code || '';
  return ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNABORTED'].includes(code);
}

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

  try {
    const response = await axios.post(`${GEN_AI_URL}/chat`, { message, history }, { timeout: 30000 });
    return res.json(response.data);
  } catch (error) {
    const data = error.response?.data;
    logger.error('finbotReply error', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      upstream: typeof data === 'string' ? data.slice(0, 300) : data,
      genAiUrl: `${GEN_AI_URL}/chat`,
      genAiConfigured: Boolean(process.env.GEN_AI_SERVICE_URL),
    });

    if (isGenAiUnreachable(error)) {
      if (!process.env.GEN_AI_SERVICE_URL) {
        return res.status(503).json({
          reply:
            'FinBot is not linked to the AI service. On Render, set GEN_AI_SERVICE_URL on core-api to your gen-ai URL (e.g. https://your-gen-ai.onrender.com), then redeploy.',
          source: 'error',
        });
      }
      return res.json({
        reply: finbotKeywordFallback(message),
        source: 'fallback',
      });
    }

    const d = data && typeof data === 'object' ? data.detail : null;
    const reply =
      typeof d === 'string'
        ? d
        : data?.reply ||
          'FinBot AI error. Check gen-ai /health (llm_ready, gemini_key_configured) and GEMINI_API_KEY on the gen-ai service.';
    const st = typeof error.response?.status === 'number' ? error.response.status : 503;
    const outStatus = st >= 400 && st < 499 ? st : 503;
    return res.status(outStatus).json({ reply, source: 'error' });
  }
};
