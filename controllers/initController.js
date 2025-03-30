const neo4jService = require('../services/neo4jService');
const dataService = require('../services/dataService');
const { logger } = require('../utils/logger');

/**
 * Initialize the database with demo data
 * @route POST /api/init
 */
const initializeDatabase = async (req, res, next) => {
  try {
    logger.info('Starting database initialization');
    
    // Clear existing data if requested
    if (req.query.clear === 'true' || req.body.clear === true) {
      logger.info('Clearing existing database data');
      await neo4jService.clearDatabase();
    }
    
    // Generate sample WoT character data
    const wotCharacters = dataService.generateSampleWotCharacters();
    
    // Initialize with the data
    const summary = await dataService.initializeWithWotData(wotCharacters);
    
    logger.info(`Database initialization complete: ${JSON.stringify(summary)}`);
    
    res.json({
      message: 'Database initialized successfully',
      summary
    });
  } catch (error) {
    logger.error(`Database initialization failed: ${error.message}`);
    next(error);
  }
};

/**
 * Check database status
 * @route GET /api/init/status
 */
const getDatabaseStatus = async (req, res, next) => {
  try {
    logger.info('Checking database status');
    
    // Check connectivity
    const isConnected = await require('../config/db').verifyConnectivity();
    
    // Count nodes and relationships
    const countResult = await neo4jService.executeQuery(`
      MATCH (n)
      RETURN 
        count(n) AS nodeCount,
        count(()-->()) AS relationshipCount,
        count((u:User)) AS userCount,
        count((s:Story)) AS storyCount
    `, {}, true);
    
    res.json({
      connected: isConnected,
      stats: countResult ? {
        nodeCount: countResult.nodeCount,
        relationshipCount: countResult.relationshipCount,
        userCount: countResult.userCount,
        storyCount: countResult.storyCount
      } : { nodeCount: 0, relationshipCount: 0, userCount: 0, storyCount: 0 }
    });
  } catch (error) {
    logger.error(`Database status check failed: ${error.message}`);
    next(error);
  }
};

module.exports = {
  initializeDatabase,
  getDatabaseStatus
};