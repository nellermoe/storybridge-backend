const { driver } = require('../config/db');
const { logger } = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class Neo4jService {
  /**
   * Executes a Cypher query and returns the results
   * 
   * @param {string} query - The Cypher query to execute
   * @param {object} params - The parameters for the query
   * @param {boolean} singleRecord - Whether to return a single record or all records
   * @returns {Promise<array|object>} - The query results
   */
  async executeQuery(query, params = {}, singleRecord = false) {
    const session = driver.session();
    try {
      logger.debug(`Executing query: ${query}`, { params });
      
      // Convert any number parameters to integers if they're used for LIMIT
      const processedParams = {};
      for (const key in params) {
        if (key === 'limit' || key.includes('limit') || key.includes('skip')) {
          processedParams[key] = parseInt(params[key]) || 0;
        } else {
          processedParams[key] = params[key];
        }
      }
      
      const result = await session.run(query, processedParams);
      
      // Process the results
      const records = result.records.map(record => {
        const processedRecord = {};
        
        // Process each field in the record
        record.keys.forEach(key => {
          const value = record.get(key);
          
          // Handle Neo4j nodes
          if (value && value.constructor && value.constructor.name === 'Node') {
            processedRecord[key] = {
              ...value.properties,
              id: value.identity ? value.identity.toString() : `node-${Math.random().toString(36).substring(2)}`,
              labels: value.labels || []
            };
          } 
          // Handle Neo4j relationships
          else if (value && value.constructor && value.constructor.name === 'Relationship') {
            processedRecord[key] = {
              ...value.properties,
              id: value.identity ? value.identity.toString() : `rel-${Math.random().toString(36).substring(2)}`,
              type: value.type || 'UNKNOWN',
              startNodeId: value.startNodeIdentity ? value.startNodeIdentity.toString() : 'unknown',
              endNodeId: value.endNodeIdentity ? value.endNodeIdentity.toString() : 'unknown'
            };
          } 
          // Handle Neo4j paths
          else if (value && value.constructor && value.constructor.name === 'Path') {
            processedRecord[key] = {
              segments: value.segments.map(segment => ({
                start: segment.start ? {
                  ...segment.start.properties,
                  id: segment.start.identity ? segment.start.identity.toString() : `node-${Math.random().toString(36).substring(2)}`,
                  labels: segment.start.labels || []
                } : { id: `node-${Math.random().toString(36).substring(2)}`, labels: [] },
                relationship: segment.relationship ? {
                  ...segment.relationship.properties,
                  id: segment.relationship.identity ? segment.relationship.identity.toString() : `rel-${Math.random().toString(36).substring(2)}`,
                  type: segment.relationship.type || 'UNKNOWN',
                  startNodeId: segment.relationship.startNodeIdentity ? segment.relationship.startNodeIdentity.toString() : 'unknown',
                  endNodeId: segment.relationship.endNodeIdentity ? segment.relationship.endNodeIdentity.toString() : 'unknown'
                } : { id: `rel-${Math.random().toString(36).substring(2)}`, type: 'UNKNOWN', startNodeId: 'unknown', endNodeId: 'unknown' },
                end: segment.end ? {
                  ...segment.end.properties,
                  id: segment.end.identity ? segment.end.identity.toString() : `node-${Math.random().toString(36).substring(2)}`,
                  labels: segment.end.labels || []
                } : { id: `node-${Math.random().toString(36).substring(2)}`, labels: [] }
              }))
            };
          } 
          // Handle arrays of Neo4j objects
          else if (Array.isArray(value)) {
            processedRecord[key] = value.map(item => {
              if (item && item.constructor) {
                if (item.constructor.name === 'Node') {
                  return {
                    ...item.properties,
                    id: item.identity ? item.identity.toString() : `node-${Math.random().toString(36).substring(2)}`,
                    labels: item.labels || []
                  };
                } else if (item.constructor.name === 'Relationship') {
                  return {
                    ...item.properties,
                    id: item.identity ? item.identity.toString() : `rel-${Math.random().toString(36).substring(2)}`,
                    type: item.type || 'UNKNOWN',
                    startNodeId: item.startNodeIdentity ? item.startNodeIdentity.toString() : 'unknown',
                    endNodeId: item.endNodeIdentity ? item.endNodeIdentity.toString() : 'unknown'
                  };
                }
              }
              return item;
            });
          } 
          // Handle primitive values
          else {
            processedRecord[key] = value;
          }
        });
        
        return processedRecord;
      });
      
      logger.debug(`Query executed successfully with ${records.length} results`);
      
      return singleRecord ? records[0] : records;
    } catch (error) {
      logger.error(`Query execution failed: ${error.message}`, { query, params, error });
      throw new ApiError(`Database query failed: ${error.message}`, 500);
    } finally {
      await session.close();
    }
  }

  /**
   * Creates a user node in the database
   * 
   * @param {object} user - The user data
   * @returns {Promise<object>} - The created user
   */
  async createUser(user) {
    const query = `
      CREATE (u:User {
        id: $id,
        name: $name,
        bio: $bio,
        createdAt: datetime(),
        isActive: true
      })
      RETURN u
    `;
    
    return this.executeQuery(query, user, true);
  }

  /**
   * Creates a story node in the database
   * 
   * @param {object} story - The story data
   * @returns {Promise<object>} - The created story
   */
  async createStory(story) {
    const query = `
      CREATE (s:Story {
        id: $id,
        title: $title,
        content: $content,
        createdAt: datetime(),
        authorId: $authorId
      })
      WITH s
      MATCH (author:User {id: $authorId})
      CREATE (author)-[:AUTHORED]->(s)
      RETURN s
    `;
    
    return this.executeQuery(query, story, true);
  }

  /**
   * Creates a connection between two users
   * 
   * @param {string} user1Id - The ID of the first user
   * @param {string} user2Id - The ID of the second user
   * @param {string} relationshipType - The type of relationship to create
   * @returns {Promise<object>} - The created relationship
   */
  async createConnection(user1Id, user2Id, relationshipType = 'CONNECTED_TO') {
    const query = `
      MATCH (u1:User {id: $user1Id})
      MATCH (u2:User {id: $user2Id})
      WHERE u1 <> u2
      CREATE (u1)-[r:${relationshipType} {createdAt: datetime()}]->(u2)
      RETURN u1, r, u2
    `;
    
    return this.executeQuery(query, { user1Id, user2Id }, true);
  }

  /**
   * Get all users with pagination
   * 
   * @param {number} skip - The number of records to skip
   * @param {number} limit - The number of records to return
   * @returns {Promise<array>} - The list of users
   */
  async getUsers(skip = 0, limit = 50) {
    const query = `
      MATCH (u:User)
      RETURN u
      ORDER BY u.name
      SKIP $skip
      LIMIT $limit
    `;
    
    return this.executeQuery(query, { skip: parseInt(skip), limit: parseInt(limit) });
  }

  /**
   * Get all stories with pagination
   * 
   * @param {number} skip - The number of records to skip
   * @param {number} limit - The number of records to return
   * @returns {Promise<array>} - The list of stories
   */
  async getStories(skip = 0, limit = 50) {
    // Convert parameters to integers
    const intSkip = parseInt(skip) || 0;
    const intLimit = parseInt(limit) || 50;
    
    const query = `
      MATCH (s:Story)<-[:AUTHORED]-(author:User)
      RETURN s, author
      ORDER BY s.createdAt DESC
      SKIP toInteger($skip)
      LIMIT toInteger($limit)
    `;
    
    return this.executeQuery(query, { skip: intSkip, limit: intLimit });
  }

  /**
   * Find the shortest path between two users
   * 
   * @param {string} sourceId - The ID of the source user
   * @param {string} targetId - The ID of the target user
   * @returns {Promise<object>} - The shortest path between the users
   */
  async findShortestPath(sourceId, targetId) {
    const query = `
      MATCH path = shortestPath((source:User {id: $sourceId})-[*]-(target:User {id: $targetId}))
      RETURN path, length(path) AS pathLength
    `;
    
    return this.executeQuery(query, { sourceId, targetId }, true);
  }

  /**
   * Get the network data for visualization
   * 
   * @param {number} limit - The maximum number of nodes to return
   * @returns {Promise<object>} - The network data
   */
  async getNetworkData(limit = 100) {
    // Convert limit to a proper integer
    const intLimit = parseInt(limit);
    
    const query = `
      MATCH (u:User)
      WITH u LIMIT toInteger($limit)
      OPTIONAL MATCH (u)-[r]-(related:User)
      WHERE id(related) < id(u) // Avoid duplicate relationships
      RETURN COLLECT(DISTINCT u) AS nodes, COLLECT(DISTINCT r) AS relationships
    `;
    
    const result = await this.executeQuery(query, { limit: intLimit }, true);
    
    if (!result) {
      return { nodes: [], links: [] };
    }
    
    // Transform data for D3.js visualization
    const nodes = result.nodes.map(node => ({
      id: node.id,
      label: node.name,
      group: node.labels[0],
      ...node
    }));
    
    const links = result.relationships.map(rel => ({
      source: rel.startNodeId,
      target: rel.endNodeId,
      type: rel.type,
      ...rel
    }));
    
    return { nodes, links };
  }

  /**
   * Record a story share event
   * 
   * @param {string} storyId - The ID of the story
   * @param {string} senderId - The ID of the user sharing the story
   * @param {string} receiverId - The ID of the user receiving the story
   * @returns {Promise<object>} - The created share relationship
   */
  async shareStory(storyId, senderId, receiverId) {
    const query = `
      MATCH (story:Story {id: $storyId})
      MATCH (sender:User {id: $senderId})
      MATCH (receiver:User {id: $receiverId})
      WHERE sender <> receiver
      CREATE (sender)-[share:SHARED {timestamp: datetime()}]->(story)
      CREATE (sender)-[connection:SHARED_WITH {timestamp: datetime(), storyId: $storyId}]->(receiver)
      RETURN story, sender, receiver, share, connection
    `;
    
    return this.executeQuery(query, { storyId, senderId, receiverId }, true);
  }

  /**
   * Get connections for a specific user
   * 
   * @param {string} userId - The ID of the user
   * @param {number} depth - The depth of connections to retrieve
   * @returns {Promise<array>} - The user's connections
   */
  async getUserConnections(userId, depth = 1) {
    const query = `
      MATCH (user:User {id: $userId})
      CALL {
        WITH user
        MATCH path = (user)-[*1..${depth}]-(connected:User)
        WHERE user <> connected
        RETURN path, connected
        ORDER BY length(path)
        LIMIT 50
      }
      RETURN user, collect(distinct path) as paths, collect(distinct connected) as connections
    `;
    
    return this.executeQuery(query, { userId }, true);
  }

  /**
   * Get connections for a specific character by name
   * 
   * @param {string} characterName - The name of the character
   * @param {number} depth - The depth of connections to retrieve
   * @returns {Promise<array>} - The character's connections
   */
  async getCharacterConnections(characterName, depth = 1) {
    const query = `
      MATCH (character:User {name: $characterName})
      CALL {
        WITH character
        MATCH path = (character)-[*1..${depth}]-(connected:User)
        WHERE character <> connected
        RETURN path, connected
        ORDER BY length(path)
        LIMIT 50
      }
      RETURN character, collect(distinct path) as paths, collect(distinct connected) as connections
    `;
    
    return this.executeQuery(query, { characterName }, true);
  }

  /**
   * Clear the database (for testing/initialization)
   */
  async clearDatabase() {
    const query = 'MATCH (n) DETACH DELETE n';
    return this.executeQuery(query);
  }
}

module.exports = new Neo4jService();