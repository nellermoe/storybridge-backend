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
    logger.info(`Starting database initialization with ${characters.length} characters`);
    
    const summary = {
      characters: 0,
      relationships: 0,
      stories: 0
    };
    
    try {
      // First, create all character nodes
      for (const character of characters) {
        // Generate a unique ID for each character
        const userId = uuidv4();
        
        await neo4jService.createUser({
          id: userId,
          name: character.name,
          bio: character.description || `A character from the Wheel of Time series`,
          // Store original data for reference
          affiliation: character.affiliation,
          nationality: character.nationality,
          gender: character.gender
        });
        
        // Add character ID for later reference
        character.id = userId;
        summary.characters++;
      }
      
      logger.info(`Created ${summary.characters} character nodes`);
      
      // Create relationships based on character associations
      for (const character of characters) {
        // Skip if no associations
        if (!character.associations || character.associations.length === 0) {
          continue;
        }
        
        // For each associated character, create a relationship
        for (const association of character.associations) {
          // Find the associated character in our processed list
          const associatedCharacter = characters.find(c => 
            c.name.toLowerCase() === association.toLowerCase()
          );
          
          // Skip if character not found
          if (!associatedCharacter) {
            continue;
          }
          
          // Create relationship
          await neo4jService.createConnection(
            character.id, 
            associatedCharacter.id,
            'KNOWS'
          );
          
          summary.relationships++;
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
        c.name === "Rand al'Thor" || 
        c.name === "Matrim Cauthon" || 
        c.name === "Perrin Aybara" ||
        c.name === "Egwene al'Vere" ||
        c.name === "Nynaeve al'Meara"
      );
      
      // Fallback if we couldn't find main characters
      const authors = mainCharacters.length ? mainCharacters : characters.slice(0, 5);
      
      // Create stories
      for (let i = 0; i < storyTitles.length; i++) {
        const author = authors[i % authors.length];
        
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
          .filter(c => c.id !== author.id)
          .sort(() => 0.5 - Math.random()) // Shuffle
          .slice(0, 5); // Take 5 random characters
        
        for (const recipient of recipients) {
          await neo4jService.shareStory(storyId, author.id, recipient.id);
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
    // If already in the right format, return as is
    if (data.nodes && data.links) {
      return data;
    }
    
    // Otherwise, transform the data
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    // Process paths
    if (data.paths) {
      data.paths.forEach(path => {
        path.segments.forEach(segment => {
          // Add start node if not already in the map
          if (!nodeMap.has(segment.start.id)) {
            nodeMap.set(segment.start.id, {
              id: segment.start.id,
              name: segment.start.name,
              group: segment.start.labels[0],
              ...segment.start
            });
          }
          
          // Add end node if not already in the map
          if (!nodeMap.has(segment.end.id)) {
            nodeMap.set(segment.end.id, {
              id: segment.end.id,
              name: segment.end.name,
              group: segment.end.labels[0],
              ...segment.end
            });
          }
          
          // Add relationship
          links.push({
            source: segment.start.id,
            target: segment.end.id,
            type: segment.relationship.type,
            id: segment.relationship.id,
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
    
    const segments = pathData.path.segments;
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    // Process each segment in the path
    segments.forEach(segment => {
      // Add start node if not already in the map
      if (!nodeMap.has(segment.start.id)) {
        const startNode = {
          id: segment.start.id,
          name: segment.start.name,
          group: segment.start.labels[0],
          ...segment.start
        };
        nodes.push(startNode);
        nodeMap.set(segment.start.id, startNode);
      }
      
      // Add end node if not already in the map
      if (!nodeMap.has(segment.end.id)) {
        const endNode = {
          id: segment.end.id,
          name: segment.end.name,
          group: segment.end.labels[0],
          ...segment.end
        };
        nodes.push(endNode);
        nodeMap.set(segment.end.id, endNode);
      }
      
      // Add relationship
      links.push({
        source: segment.start.id,
        target: segment.end.id,
        type: segment.relationship.type,
        id: segment.relationship.id,
        ...segment.relationship
      });
    });
    
    return {
      nodes,
      links,
      length: pathData.pathLength || segments.length
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