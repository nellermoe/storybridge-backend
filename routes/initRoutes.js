const express = require('express');
const router = express.Router();
const initController = require('../controllers/initController');

/**
 * @route POST /api/init
 * @desc Initialize the database with demo data
 * @access Public
 */
router.post('/init', initController.initializeDatabase);

/**
 * @route GET /api/init/status
 * @desc Check database status
 * @access Public
 */
router.get('/init/status', initController.getDatabaseStatus);

module.exports = router;