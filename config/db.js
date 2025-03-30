const neo4j = require('neo4j-driver');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/db.log' })
  ]
});

// Create a Neo4j driver instance
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD),
  {
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
    disableLosslessIntegers: true // For easier JSON serialization
  }
);

// Verify connectivity when the app starts
const verifyConnectivity = async () => {
  try {
    await driver.verifyConnectivity();
    logger.info('Connected to Neo4j database successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to connect to Neo4j database: ${error.message}`);
    return false;
  }
};

// Create constraints and indexes for better performance
const initializeDbSchema = async () => {
  const session = driver.session();
  try {
    // Create constraints for User nodes (ensure uniqueness)
    await session.run(`
      CREATE CONSTRAINT user_id_unique IF NOT EXISTS
      FOR (u:User)
      REQUIRE u.id IS UNIQUE
    `);

    // Create constraints for Story nodes
    await session.run(`
      CREATE CONSTRAINT story_id_unique IF NOT EXISTS
      FOR (s:Story)
      REQUIRE s.id IS UNIQUE
    `);

    // Create indexes for better query performance
    await session.run(`
      CREATE INDEX user_name_index IF NOT EXISTS
      FOR (u:User)
      ON (u.name)
    `);

    await session.run(`
      CREATE INDEX story_title_index IF NOT EXISTS
      FOR (s:Story)
      ON (s.title)
    `);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize database schema: ${error.message}`);
    throw error;
  } finally {
    await session.close();
  }
};

module.exports = {
  driver,
  verifyConnectivity,
  initializeDbSchema,
  getSession: () => driver.session()
};