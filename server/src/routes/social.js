const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { requireAuth, optionalAuth } = require('../middleware/auth');


router.get('/mentors', requireAuth, socialController.getMentors);
router.patch('/users/me/profile', requireAuth, socialController.updateMyProfile);
router.get('/users/:userId', socialController.getUserProfile);
router.get('/users/:userId/stats', optionalAuth, socialController.getUserStats);
router.get('/users/:userId/followers', socialController.getUserFollowers);
router.get('/users/:userId/following', socialController.getUserFollowing);
router.post('/users/:userId/follow', requireAuth, socialController.followUser);
router.delete('/users/:userId/follow', requireAuth, socialController.unfollowUser);


module.exports = router;
