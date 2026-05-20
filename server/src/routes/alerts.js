const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alertsController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, alertsController.listAlerts);
router.post('/', requireAuth, alertsController.createAlert);
router.patch('/:id/deactivate', requireAuth, alertsController.deactivateAlert);
router.delete('/:id', requireAuth, alertsController.deleteAlert);

module.exports = router;
