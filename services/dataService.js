const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const neo4jService = require('./neo4jService');

class DataService {
  /**
   * Initialize the database with demo data from Wheel of Time characters
   * 
   * @param {Array} characters - The character data to import
   * @returns {Promise<object>} - Summary of the import
   */
  async initializeWithWotData(characters) {
    if (!characters || !Array.isArray(characters)) {
      logger.error('Invalid or missing characters data for initialization');
      throw new Error('Invalid characters data');
    }

    logger.info(`Starting database initialization with ${characters.length} characters`);
    
    const summary = {
      characters: 0,
      relationships: 0,
      stories: 0
    };
    
    try {
      // First, create all character nodes
      for (const character of characters) {
        if (!character || !character.name) {
          logger.warn('Skipping invalid character without name');
          continue;
        }

        // Generate a unique ID for each character
        const userId = uuidv4();
        
        try {
          await neo4jService.createUser({
            id: userId,
            name: character.name,
            bio: character.description || `A character from the Wheel of Time series`,
            // Store original data for reference
            affiliation: character.affiliation || 'Unknown',
            nationality: character.nationality || 'Unknown',
            gender: character.gender || 'Unknown'
          });
          
          // Add character ID for later reference
          character.id = userId;
          summary.characters++;
        } catch (error) {
          logger.error(`Error creating user ${character.name}: ${error.message}`);
          // Continue with other characters instead of failing the entire process
        }
      }
      
      logger.info(`Created ${summary.characters} character nodes`);
      
      // Create relationships based on character associations
      for (const character of characters) {
        // Skip if no associations or no ID (meaning user creation failed)
        if (!character.id || !character.associations || !Array.isArray(character.associations) || character.associations.length === 0) {
          continue;
        }
        
        // For each associated character, create a relationship
        for (const association of character.associations) {
          if (!association) {
            continue;
          }

          // Find the associated character in our processed list
          const associatedCharacter = characters.find(c => 
            c && c.name && c.id && 
            c.name.toLowerCase() === association.toLowerCase()
          );
          
          // Skip if character not found or has no ID
          if (!associatedCharacter || !associatedCharacter.id) {
            continue;
          }
          
          try {
            // Create relationship
            await neo4jService.createConnection(
              character.id, 
              associatedCharacter.id,
              'KNOWS'
            );
            
            summary.relationships++;
          } catch (error) {
            logger.error(`Error creating relationship between ${character.name} and ${association}: ${error.message}`);
            // Continue with other relationships
          }
        }
      }
      
      logger.info(`Created ${summary.relationships} character relationships`);
      
      // Create some sample stories
      const storyTitles = [
        "The Dragon Reborn",
        "The Eye of the World", 
        "The Great Hunt",
        "The Shadow Rising",
        "The Fires of Heaven"
      ];
      
      // Select main characters to be authors
      const mainCharacters = characters.filter(c => 
        c && c.id && c.name && (
          c.name === "Rand al'Thor" || 
          c.name === "Matrim Cauthon" || 
          c.name === "Perrin Aybara" ||
          c.name === "Egwene al'Vere" ||
          c.name === "Nynaeve al'Meara"
        )
      );
      
      // Fallback if we couldn't find main characters
      const authors = mainCharacters.length ? mainCharacters : characters.filter(c => c && c.id).slice(0, 5);
      
      // Check if we have any authors
      if (authors.length === 0) {
        logger.warn('No valid authors found for stories, skipping story creation');
      } else {
        // Create stories
        for (let i = 0; i < storyTitles.length; i++) {
          const author = authors[i % authors.length];
          
          if (!author || !author.id) {
            logger.warn(`No valid author for story "${storyTitles[i]}", skipping`);
            continue;
          }
          
          try {
            const storyId = uuidv4();
            await neo4jService.createStory({
              id: storyId,
              title: storyTitles[i],
              content: `This is a sample story about the adventures in the world of the Wheel of Time.`,
              authorId: author.id
            });
            
            summary.stories++;
            
            // Add some story shares
            const recipients = characters
              .filter(c => c && c.id && c.id !== author.id)
              .sort(() => 0.5 - Math.random()) // Shuffle
              .slice(0, 5); // Take 5 random characters
            
            for (const recipient of recipients) {
              if (recipient && recipient.id) {
                try {
                  await neo4jService.shareStory(storyId, author.id, recipient.id);
                } catch (error) {
                  logger.error(`Error sharing story ${storyId} from ${author.name} to ${recipient.name}: ${error.message}`);
                  // Continue with other recipients
                }
              }
            }
          } catch (error) {
            logger.error(`Error creating story "${storyTitles[i]}": ${error.message}`);
            // Continue with other stories
          }
        }
      }
      
      logger.info(`Created ${summary.stories} stories with authors and shares`);
      
      return summary;
    } catch (error) {
      logger.error(`Database initialization failed: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Format network data for D3.js visualization
   * 
   * @param {object} data - Raw network data
   * @returns {object} - Formatted network data
   */
  formatNetworkForD3(data) {
    // If data is missing, return empty structure
    if (!data) {
      return { nodes: [], links: [] };
    }
    
    // If already in the right format, return as is
    if (data.nodes && data.links) {
      return data;
    }
    
    // Otherwise, transform the data
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    // Process paths
    if (data.paths && Array.isArray(data.paths)) {
      data.paths.forEach(path => {
        if (!path || !path.segments || !Array.isArray(path.segments)) {
          return; // Skip invalid path
        }
        
        path.segments.forEach(segment => {
          if (!segment || !segment.start || !segment.end || !segment.relationship) {
            return; // Skip invalid segment
          }
          
          // Ensure IDs exist
          const startId = segment.start.id || `node-${Math.random().toString(36).substr(2, 9)}`;
          const endId = segment.end.id || `node-${Math.random().toString(36).substr(2, 9)}`;
          
          // Add start node if not already in the map
          if (!nodeMap.has(startId)) {
            nodeMap.set(startId, {
              id: startId,
              name: segment.start.name || 'Unknown',
              group: segment.start.labels && Array.isArray(segment.start.labels) ? segment.start.labels[0] : 'Unknown',
              ...segment.start
            });
          }
          
          // Add end node if not already in the map
          if (!nodeMap.has(endId)) {
            nodeMap.set(endId, {
              id: endId,
              name: segment.end.name || 'Unknown',
              group: segment.end.labels && Array.isArray(segment.end.labels) ? segment.end.labels[0] : 'Unknown',
              ...segment.end
            });
          }
          
          // Add relationship
          const relId = segment.relationship.id || `rel-${Math.random().toString(36).substr(2, 9)}`;
          links.push({
            source: startId,
            target: endId,
            type: segment.relationship.type || 'Unknown',
            id: relId,
            ...segment.relationship
          });
        });
      });
    }
    
    // Convert node map to array
    const nodesArray = Array.from(nodeMap.values());
    
    return {
      nodes: nodesArray,
      links
    };
  }

  /**
   * Format path data for frontend visualization
   * 
   * @param {object} pathData - Raw path data
   * @returns {object} - Formatted path data
   */
  formatPathData(pathData) {
    if (!pathData || !pathData.path) {
      return { nodes: [], links: [], length: 0 };
    }
    
    const segments = pathData.path.segments || [];
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    // Process each segment in the path
    segments.forEach(segment => {
      if (!segment || !segment.start || !segment.end || !segment.relationship) {
        return; // Skip invalid segment
      }
      
      // Ensure IDs exist
      const startId = segment.start.id || `node-${Math.random().toString(36).substr(2, 9)}`;
      const endId = segment.end.id || `node-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add start node if not already in the map
      if (!nodeMap.has(startId)) {
        const startNode = {
          id: startId,
          name: segment.start.name || 'Unknown',
          group: segment.start.labels && Array.isArray(segment.start.labels) ? segment.start.labels[0] : 'Unknown',
          ...segment.start
        };
        nodes.push(startNode);
        nodeMap.set(startId, startNode);
      }
      
      // Add end node if not already in the map
      if (!nodeMap.has(endId)) {
        const endNode = {
          id: endId,
          name: segment.end.name || 'Unknown',
          group: segment.end.labels && Array.isArray(segment.end.labels) ? segment.end.labels[0] : 'Unknown',
          ...segment.end
        };
        nodes.push(endNode);
        nodeMap.set(endId, endNode);
      }
      
      // Add relationship
      const relId = segment.relationship.id || `rel-${Math.random().toString(36).substr(2, 9)}`;
      links.push({
        source: startId,
        target: endId,
        type: segment.relationship.type || 'Unknown',
        id: relId,
        ...segment.relationship
      });
    });
    
    return {
      nodes,
      links,
      length: pathData.pathLength || (segments ? segments.length : 0)
    };
  }

  /**
   * Generate a sample set of WoT characters for testing
   * 
   * @returns {Array} - Sample character data
   */
  generateSampleWotCharacters() {
    return [
      {
        name: "Rand al'Thor",
        description: "The Dragon Reborn, a farm boy from the Two Rivers who discovers he is the reincarnation of the Dragon.",
        gender: "Male",
        nationality: "Andoran/Aiel",
        affiliation: "Dragon Reborn",
        associations: ["Matrim Cauthon", "Perrin Aybara", "Egwene al'Vere", "Moiraine Damodred"]
      },
      {
        name: "Matrim Cauthon",
        description: "A gambler and trickster from the Two Rivers with incredible luck.",
        gender: "Male",
        nationality: "Andoran",
        affiliation: "Band of the Red Hand",
        associations: ["Rand al'Thor", "Perrin Aybara", "Tuon Athaem Kore Paendrag"]
      },
      {
        name: "Perrin Aybara",
        description: "A blacksmith from the Two Rivers with the ability to communicate with wolves.",
        gender: "Male",
        nationality: "Andoran",
        affiliation: "Wolf Brother",
        associations: ["Rand al'Thor", "Matrim Cauthon", "Faile Bashere"]
      },
      {
        name: "Egwene al'Vere",
        description: "An innkeeper's daughter who becomes the Amyrlin Seat.",
        gender: "Female",
        nationality: "Andoran",
        affiliation: "Aes Sedai (White Tower)",
        associations: ["Rand al'Thor", "Nynaeve al'Meara", "Elayne Trakand"]
      },
      {
        name: "Nynaeve al'Meara",
        description: "The former Wisdom of Emond's Field who becomes a powerful Aes Sedai.",
        gender: "Female",
        nationality: "Andoran",
        affiliation: "Aes Sedai (Yellow Ajah)",
        associations: ["Lan Mandragoran", "Egwene al'Vere", "Elayne Trakand"]
      },
      {
        name: "Moiraine Damodred",
        description: "An Aes Sedai of the Blue Ajah who guides the young heroes from the Two Rivers.",
        gender: "Female",
        nationality: "Cairhienin",
        affiliation: "Aes Sedai (Blue Ajah)",
        associations: ["Lan Mandragoran", "Rand al'Thor", "Siuan Sanche"]
      },
      {
        name: "Lan Mandragoran",
        description: "The uncrowned king of Malkier and Moiraine's Warder.",
        gender: "Male",
        nationality: "Malkieri",
        affiliation: "Warder",
        associations: ["Moiraine Damodred", "Nynaeve al'Meara"]
      },
      {
        name: "Elayne Trakand",
        description: "Daughter-Heir of Andor who becomes a queen and Aes Sedai.",
        gender: "Female",
        nationality: "Andoran",
        affiliation: "Aes Sedai (Green Ajah)/Queen of Andor",
        associations: ["Rand al'Thor", "Egwene al'Vere", "Nynaeve al'Meara"]
      },
      {
        name: "Min Farshaw",
        description: "A young woman with the ability to see visions about people's futures.",
        gender: "Female",
        nationality: "Andoran",
        affiliation: "Rand al'Thor",
        associations: ["Rand al'Thor", "Elayne Trakand", "Aviendha"]
      },
      {
        name: "Aviendha",
        description: "A Maiden of the Spear who becomes a Wise One.",
        gender: "Female",
        nationality: "Aiel",
        affiliation: "Wise One",
        associations: ["Rand al'Thor", "Elayne Trakand", "Min Farshaw"]
      }
    ];
  }
}

module.exports = new DataService();