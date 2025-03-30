const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');

/**
 * @route GET /api/stories
 * @desc Get all stories with pagination
 * @access Public
 */
router.get('/stories', storyController.getStories);

/**
 * @route GET /api/stories/:id
 * @desc Get a specific story by ID
 * @access Public
 */
router.get('/stories/:id', storyController.getStoryById);

/**
 * @route POST /api/stories
 * @desc Create a new story
 * @access Public
 */
router.post('/stories', storyController.createStory);

/**
 * @route POST /api/stories/share
 * @desc Share a story with another user
 * @access Public
 */
router.post('/stories/share', storyController.shareStory);

module.exports = router;