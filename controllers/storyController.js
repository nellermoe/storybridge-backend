const { v4: uuidv4 } = require('uuid');
const neo4jService = require('../services/neo4jService');
const { ApiError } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');

/**
 * Get all stories
 * @route GET /api/stories
 */
const getStories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const skip = page * limit;
    
    logger.info(`Retrieving stories with pagination: page=${page}, limit=${limit}`);
    
    // Get stories from Neo4j
    const stories = await neo4jService.getStories(skip, limit);
    
    // Process the results for the frontend
    const formattedStories = stories.map(record => {
      return {
        id: record.s.id,
        title: record.s.title,
        content: record.s.content,
        createdAt: record.s.createdAt,
        author: {
          id: record.author.id,
          name: record.author.name
        }
      };
    });
    
    res.json({
      stories: formattedStories,
      page,
      limit,
      total: formattedStories.length // This is just the current page count, ideally we would have a total count
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific story by ID
 * @route GET /api/stories/:id
 */
const getStoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    logger.info(`Retrieving story with ID: ${id}`);
    
    // Get story from Neo4j
    const result = await neo4jService.executeQuery(
      `
      MATCH (s:Story {id: $id})<-[:AUTHORED]-(author:User)
      OPTIONAL MATCH (sharer:User)-[shared:SHARED]->(s)
      RETURN s, author, collect(distinct {sharer: sharer, shared: shared}) as shares
      `,
      { id },
      true
    );
    
    if (!result || !result.s) {
      throw ApiError.notFound(`Story with ID ${id} not found`);
    }
    
    // Format response
    const story = {
      id: result.s.id,
      title: result.s.title,
      content: result.s.content,
      createdAt: result.s.createdAt,
      author: {
        id: result.author.id,
        name: result.author.name
      },
      shares: result.shares
        .filter(share => share.sharer && share.shared) // Filter out null entries
        .map(share => ({
          user: {
            id: share.sharer.id,
            name: share.sharer.name
          },
          timestamp: share.shared.timestamp
        }))
    };
    
    res.json(story);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new story
 * @route POST /api/stories
 */
const createStory = async (req, res, next) => {
  try {
    const { title, content, authorId } = req.body;
    
    // Validate required fields
    if (!title || !content || !authorId) {
      throw ApiError.badRequest('Title, content, and authorId are required');
    }
    
    logger.info(`Creating new story: "${title}" by author ${authorId}`);
    
    // Check if the author exists
    const authorResult = await neo4jService.executeQuery(
      'MATCH (u:User {id: $authorId}) RETURN u',
      { authorId },
      true
    );
    
    if (!authorResult || !authorResult.u) {
      throw ApiError.notFound(`Author with ID ${authorId} not found`);
    }
    
    // Create story
    const storyId = uuidv4();
    const story = await neo4jService.createStory({
      id: storyId,
      title,
      content,
      authorId
    });
    
    res.status(201).json({
      message: 'Story created successfully',
      story: {
        id: storyId,
        title,
        content,
        authorId,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Share a story with another user
 * @route POST /api/stories/share
 */
const shareStory = async (req, res, next) => {
  try {
    const { storyId, senderId, receiverId } = req.body;
    
    // Validate required fields
    if (!storyId || !senderId || !receiverId) {
      throw ApiError.badRequest('StoryId, senderId, and receiverId are required');
    }
    
    logger.info(`Sharing story ${storyId} from ${senderId} to ${receiverId}`);
    
    // Check if story exists
    const storyResult = await neo4jService.executeQuery(
      'MATCH (s:Story {id: $storyId}) RETURN s',
      { storyId },
      true
    );
    
    if (!storyResult || !storyResult.s) {
      throw ApiError.notFound(`Story with ID ${storyId} not found`);
    }
    
    // Check if sender exists
    const senderResult = await neo4jService.executeQuery(
      'MATCH (u:User {id: $senderId}) RETURN u',
      { senderId },
      true
    );
    
    if (!senderResult || !senderResult.u) {
      throw ApiError.notFound(`Sender with ID ${senderId} not found`);
    }
    
    // Check if receiver exists
    const receiverResult = await neo4jService.executeQuery(
      'MATCH (u:User {id: $receiverId}) RETURN u',
      { receiverId },
      true
    );
    
    if (!receiverResult || !receiverResult.u) {
      throw ApiError.notFound(`Receiver with ID ${receiverId} not found`);
    }
    
    // Record the share
    const shareResult = await neo4jService.shareStory(storyId, senderId, receiverId);
    
    // Find paths before and after the share to see if the path length was reduced
    const pathBeforeShare = await neo4jService.executeQuery(
      `
      MATCH (author:User)-[:AUTHORED]->(s:Story {id: $storyId})
      MATCH (receiver:User {id: $receiverId})
      CALL {
        WITH author, receiver
        MATCH p = shortestPath((author)-[r:KNOWS|SHARED_WITH*]-(receiver))
        WHERE NONE(rel IN r WHERE rel.storyId = $storyId)
        RETURN length(p) AS pathLength
      }
      RETURN pathLength
      `,
      { storyId, receiverId },
      true
    );
    
    const pathAfterShare = await neo4jService.executeQuery(
      `
      MATCH (author:User)-[:AUTHORED]->(s:Story {id: $storyId})
      MATCH (receiver:User {id: $receiverId})
      CALL {
        WITH author, receiver
        MATCH p = shortestPath((author)-[r:KNOWS|SHARED_WITH*]-(receiver))
        RETURN length(p) AS pathLength
      }
      RETURN pathLength
      `,
      { storyId, receiverId },
      true
    );
    
    // Calculate reward points based on path reduction
    let rewardPoints = 0;
    let pathReduction = 0;
    
    if (pathBeforeShare && pathBeforeShare.pathLength && pathAfterShare && pathAfterShare.pathLength) {
      const before = pathBeforeShare.pathLength;
      const after = pathAfterShare.pathLength;
      
      pathReduction = before - after;
      
      // Award points based on path reduction
      if (pathReduction > 0) {
        rewardPoints = pathReduction * 10; // 10 points per hop reduction
      }
    }
    
    res.json({
      message: 'Story shared successfully',
      share: {
        storyId,
        senderId,
        receiverId,
        timestamp: new Date().toISOString()
      },
      pathReduction,
      rewardPoints
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStories,
  getStoryById,
  createStory,
  shareStory
};