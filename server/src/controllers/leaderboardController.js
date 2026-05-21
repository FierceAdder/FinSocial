const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

exports.getLeaderboard = async (req, res) => {
  try {
    const period = req.query.period || 'weekly';
    if (!['weekly', 'monthly', 'alltime'].includes(period)) {
      return res.status(400).json({ error: 'period must be weekly, monthly, or alltime' });
    }

    const snapshots = await prisma.leaderboardSnapshot.findMany({
      where: { period },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isVerified: true,
            experienceLevel: true,
          },
        },
      },
      orderBy: { rank: 'asc' },
      take: 20,
    });

    res.json(snapshots);
  } catch (error) {
    logger.error('getLeaderboard error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};
