const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

exports.followUser = async (req, res) => {
  try {
    const followerId = req.user.userId;
    const { userId: followingId } = req.params;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('followUser error', { error: error.message });
    res.status(500).json({ error: 'Failed to follow user' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.user.userId;
    const { userId: followingId } = req.params;

    await prisma.follow.deleteMany({ where: { followerId, followingId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unfollow' });
  }
};

exports.getMentors = async (req, res) => {
  try {
    const mentors = await prisma.user.findMany({
      where: { isVerified: true },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        avatarUrl: true, bio: true, mentorBio: true, experienceLevel: true,
        _count: { select: { followers: true } },
      },
      take: 10,
    });
    res.json(mentors);
  } catch (error) {
    logger.error('getMentors error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.userId ?? null;

    const [snap, followRow] = await Promise.all([
      prisma.leaderboardSnapshot.findFirst({
        where: { userId, period: 'alltime' },
        orderBy: { computedAt: 'desc' },
      }),
      viewerId && viewerId !== userId
        ? prisma.follow.findFirst({ where: { followerId: viewerId, followingId: userId } })
        : Promise.resolve(null),
    ]);

    res.json({
      snapshot: snap ?? null,
      isFollowing: !!followRow,
    });
  } catch (error) {
    logger.error('getUserStats error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        avatarUrl: true, bio: true, mentorBio: true, experienceLevel: true,
        isVerified: true, verifiedReason: true, createdAt: true,
        _count: { select: { followers: true, following: true, trades: true } },
        holdings: { include: { stock: { select: { displayTicker: true, price: true } } } },
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    logger.error('getUserProfile error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
