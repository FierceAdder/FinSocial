const axios = require('axios');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const { genAiBaseUrl } = require('../utils/serviceUrls');
const GEN_AI_URL = genAiBaseUrl();

exports.getQuestions = async (req, res) => {
  try {
    const questions = await prisma.forumQuestion.findMany({
      include: {
        user: { select: { username: true, firstName: true, avatarUrl: true, isVerified: true } },
        _count: { select: { answers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(questions);
  } catch (error) {
    logger.error('getQuestions error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

exports.getQuestionById = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.forumQuestion.update({
      where: { id },
      data: { views: { increment: 1 } }
    }).catch(() => {}); // ignore if question doesn't exist yet (will 404 below)

    const question = await prisma.forumQuestion.findUnique({
      where: { id },
      include: {
        user: { select: { username: true, firstName: true, avatarUrl: true, isVerified: true } },
        answers: {
          include: { user: { select: { username: true, firstName: true, avatarUrl: true, isVerified: true } } },
          orderBy: [{ isAccepted: 'desc' }, { votes: 'desc' }]
        }
      }
    });

    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (error) {
    logger.error('getQuestionById error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch question' });
  }
};

exports.createQuestion = async (req, res) => {
  try {
    const { title, body, tags } = req.body;
    const question = await prisma.forumQuestion.create({
      data: { title, body, tags: tags || [], userId: req.user.userId },
      include: { user: { select: { username: true, firstName: true } } }
    });
    res.status(201).json(question);
  } catch (error) {
    logger.error('createQuestion error', { error: error.message });
    res.status(500).json({ error: 'Failed to create question' });
  }
};

exports.createAnswer = async (req, res) => {
  try {
    const { id: questionId } = req.params;
    const { body } = req.body;

    const answer = await prisma.forumAnswer.create({
      data: { body, questionId, userId: req.user.userId },
      include: { user: { select: { username: true, firstName: true } } }
    });

    // Notify question owner
    const question = await prisma.forumQuestion.findUnique({ where: { id: questionId }, select: { userId: true, title: true } });
    if (question && question.userId !== req.user.userId) {
      await prisma.notification.create({
        data: {
          userId: question.userId,
          type: 'forum_answer',
          title: 'New answer on your question',
          body: `Someone answered: "${question.title}"`,
          payload: { questionId, answerId: answer.id },
        }
      }).catch(() => {});
      if (global.io) {
        global.io.to(`user:${question.userId}`).emit('notification:new', { type: 'forum_answer' });
      }
    }

    res.status(201).json(answer);
  } catch (error) {
    logger.error('createAnswer error', { error: error.message });
    res.status(500).json({ error: 'Failed to post answer' });
  }
};

exports.voteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { direction } = req.body; // 1 or -1
    const userId = req.user.userId;

    if (![1, -1].includes(Number(direction))) {
      return res.status(400).json({ error: 'direction must be 1 or -1' });
    }

    const existing = await prisma.forumVote.findUnique({
      where: { userId_targetType_targetId: { userId, targetType: 'question', targetId: id } }
    });

    let delta = Number(direction);
    if (existing) {
      if (existing.direction === delta) {
        // Undo vote
        await prisma.forumVote.delete({ where: { id: existing.id } });
        delta = -delta;
      } else {
        // Change direction
        await prisma.forumVote.update({ where: { id: existing.id }, data: { direction: delta } });
        delta = delta * 2;
      }
    } else {
      await prisma.forumVote.create({ data: { userId, targetType: 'question', targetId: id, direction: delta } });
    }

    const updated = await prisma.forumQuestion.update({
      where: { id },
      data: { votes: { increment: delta } }
    });

    res.json({ votes: updated.votes });
  } catch (error) {
    logger.error('voteQuestion error', { error: error.message });
    res.status(500).json({ error: 'Failed to vote' });
  }
};

exports.voteAnswer = async (req, res) => {
  try {
    const { answerId } = req.params;
    const { direction } = req.body;
    const userId = req.user.userId;

    if (![1, -1].includes(Number(direction))) {
      return res.status(400).json({ error: 'direction must be 1 or -1' });
    }

    const existing = await prisma.forumVote.findUnique({
      where: { userId_targetType_targetId: { userId, targetType: 'answer', targetId: answerId } }
    });

    let delta = Number(direction);
    if (existing) {
      if (existing.direction === delta) {
        await prisma.forumVote.delete({ where: { id: existing.id } });
        delta = -delta;
      } else {
        await prisma.forumVote.update({ where: { id: existing.id }, data: { direction: delta } });
        delta = delta * 2;
      }
    } else {
      await prisma.forumVote.create({ data: { userId, targetType: 'answer', targetId: answerId, direction: delta } });
    }

    const updated = await prisma.forumAnswer.update({
      where: { id: answerId },
      data: { votes: { increment: delta } }
    });

    res.json({ votes: updated.votes });
  } catch (error) {
    logger.error('voteAnswer error', { error: error.message });
    res.status(500).json({ error: 'Failed to vote on answer' });
  }
};

exports.acceptAnswer = async (req, res) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.userId;

    const answer = await prisma.forumAnswer.findUnique({
      where: { id: answerId },
      include: { question: true }
    });

    if (!answer) return res.status(404).json({ error: 'Answer not found' });
    if (answer.question.userId !== userId) {
      return res.status(403).json({ error: 'Only the question owner can accept answers' });
    }

    // Unaccept previous accepted answer for this question
    await prisma.forumAnswer.updateMany({
      where: { questionId: answer.questionId, isAccepted: true },
      data: { isAccepted: false }
    });

    const updated = await prisma.forumAnswer.update({
      where: { id: answerId },
      data: { isAccepted: !answer.isAccepted }
    });

    res.json(updated);
  } catch (error) {
    logger.error('acceptAnswer error', { error: error.message });
    res.status(500).json({ error: 'Failed to accept answer' });
  }
};

exports.aiSuggest = async (req, res) => {
  try {
    const { id } = req.params;

    const question = await prisma.forumQuestion.findUnique({ where: { id } });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const response = await axios.post(`${GEN_AI_URL}/suggest-answer`, {
      questionTitle: question.title,
      questionBody: question.body,
      tags: question.tags,
    }, { timeout: 30000 });

    res.json({ suggestion: response.data.suggestion });
  } catch (error) {
    logger.error('aiSuggest error', { error: error.message });
    res.status(500).json({ error: 'AI suggestion unavailable' });
  }
};
