const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { buildUserTradingStats } = require('../utils/userStats');

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

async function loadUserForStats(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      holdings: { include: { stock: { select: { price: true } } } },
      trades: { orderBy: { timestamp: 'asc' } },
    },
  });
}

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

    const [user, followRow] = await Promise.all([
      loadUserForStats(userId),
      viewerId && viewerId !== userId
        ? prisma.follow.findFirst({ where: { followerId: viewerId, followingId: userId } })
        : Promise.resolve(null),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const live = buildUserTradingStats(user);
    res.json({
      snapshot: {
        userId: user.id,
        period: 'alltime',
        ...live,
      },
      isFollowing: !!followRow,
    });
  } catch (error) {
    logger.error('getUserStats error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const raw = req.body?.bio;
    if (typeof raw !== 'string') {
      return res.status(400).json({ error: 'bio must be a string' });
    }
    const bio = raw.trim().slice(0, 500);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { bio: bio || null },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        bio: true, mentorBio: true, experienceLevel: true,
      },
    });

    res.json(user);
  } catch (error) {
    logger.error('updateMyProfile error', { error: error.message });
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.getUserFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'User not found' });

    const rows = await prisma.follow.findMany({
      where: { followingId: userId },
      include: { follower: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rows.map((r) => r.follower));
  } catch (error) {
    logger.error('getUserFollowers error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
};

exports.getUserFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'User not found' });

    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rows.map((r) => r.following));
  } catch (error) {
    logger.error('getUserFollowing error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch following' });
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
        holdings: { include: { stock: { select: { ticker: true, displayTicker: true, price: true } } } },
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    logger.error('getUserProfile error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
