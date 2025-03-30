const express = require('express');
const router = express.Router();
const networkController = require('../controllers/networkController');

/**
 * @route GET /api/network
 * @desc Get network data for visualization
 * @access Public
 */
router.get('/network', networkController.getNetworkData);

/**
 * @route GET /api/path
 * @desc Find the shortest path between two nodes
 * @access Public
 */
router.get('/path', networkController.getPath);

/**
 * @route GET /api/connections/:characterName
 * @desc Get connections for a specific character
 * @access Public
 */
router.get('/connections/:characterName', networkController.getCharacterConnections);

module.exports = router;