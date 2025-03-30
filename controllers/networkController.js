const neo4jService = require('../services/neo4jService');
const dataService = require('../services/dataService');
const { ApiError } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');

/**
 * Get network data for visualization
 * @route GET /api/network
 */
const getNetworkData = async (req, res, next) => {
  try {
    const limit = req.query.limit || 100;
    
    logger.info(`Retrieving network data with limit: ${limit}`);
    
    // Get network data from Neo4j
    const networkData = await neo4jService.getNetworkData(parseInt(limit));
    
    // Return formatted data for D3.js visualization
    res.json(networkData);
  } catch (error) {
    next(error);
  }
};

/**
 * Find the shortest path between two nodes
 * @route GET /api/path
 */
const getPath = async (req, res, next) => {
  try {
    const { source, target } = req.query;
    
    // Validate input
    if (!source || !target) {
      throw ApiError.badRequest('Source and target parameters are required');
    }
    
    logger.info(`Finding path from ${source} to ${target}`);
    
    let pathData;
    
    // Check if we're searching by ID or by name
    if (source.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a UUID, search by ID
      pathData = await neo4jService.findShortestPath(source, target);
    } else {
      // It's likely a name, search for the characters first
      const sourceNode = await neo4jService.executeQuery(
        'MATCH (u:User {name: $name}) RETURN u',
        { name: source },
        true
      );
      
      const targetNode = await neo4jService.executeQuery(
        'MATCH (u:User {name: $name}) RETURN u',
        { name: target },
        true
      );
      
      if (!sourceNode || !sourceNode.u) {
        throw ApiError.notFound(`Source user '${source}' not found`);
      }
      
      if (!targetNode || !targetNode.u) {
        throw ApiError.notFound(`Target user '${target}' not found`);
      }
      
      // Now get the path between them
      pathData = await neo4jService.findShortestPath(sourceNode.u.id, targetNode.u.id);
    }
    
    if (!pathData) {
      return res.json({
        message: 'No path found between the specified users',
        path: null,
        length: -1
      });
    }
    
    // Format the path data for the frontend
    const formattedPath = dataService.formatPathData(pathData);
    
    res.json({
      message: `Path found with length ${formattedPath.length}`,
      ...formattedPath
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get connections for a specific character
 * @route GET /api/connections/:characterName
 */
const getCharacterConnections = async (req, res, next) => {
  try {
    const { characterName } = req.params;
    const depth = req.query.depth || 1;
    
    logger.info(`Getting connections for character: ${characterName} with depth: ${depth}`);
    
    // Get character connections
    const connectionData = await neo4jService.getCharacterConnections(
      characterName,
      parseInt(depth)
    );
    
    if (!connectionData || !connectionData.character) {
      throw ApiError.notFound(`Character '${characterName}' not found`);
    }
    
    // Format the network data for visualization
    const formattedData = dataService.formatNetworkForD3({
      paths: connectionData.paths
    });
    
    // Add the central character info
    res.json({
      character: {
        id: connectionData.character.id,
        name: connectionData.character.name,
        ...connectionData.character
      },
      connections: connectionData.connections.map(c => ({
        id: c.id,
        name: c.name,
        ...c
      })),
      network: formattedData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNetworkData,
  getPath,
  getCharacterConnections
};