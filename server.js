require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./utils/errorHandler');
const { logger, requestLogger } = require('./utils/logger');
const db = require('./config/db');

// Import routes
const networkRoutes = require('./routes/networkRoutes');
const storyRoutes = require('./routes/storyRoutes');
const initRoutes = require('./routes/initRoutes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Verify database connectivity
db.verifyConnectivity()
  .then(connected => {
    if (connected) {
      // Initialize database schema (create constraints and indexes)
      return db.initializeDbSchema();
    } else {
      logger.error('Unable to connect to Neo4j database. Check your connection settings.');
      process.exit(1);
    }
  })
  .catch(error => {
    logger.error(`Database initialization error: ${error.message}`);
    process.exit(1);
  });

// Configure rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes by default
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // 100 requests per window by default
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      statusCode: 429
    }
  }
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } })); // HTTP request logging
app.use(requestLogger); // Custom request logger
app.use(limiter); // Rate limiting

// Routes
app.use('/api', networkRoutes);
app.use('/api', storyRoutes);
app.use('/api', initRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'StoryBridge API',
    version: '1.0.0',
    endpoints: {
      network: '/api/network',
      path: '/api/path?source=X&target=Y',
      stories: '/api/stories',
      shareStory: '/api/stories/share',
      characterConnections: '/api/connections/:characterName',
      initialize: '/api/init',
      status: '/api/init/status',
      health: '/health'
    }
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: {
      message: `Not Found - ${req.originalUrl}`,
      statusCode: 404
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  logger.info(`StoryBridge server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  // Exit with failure
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    // Close the Neo4j driver
    await db.driver.close();
    logger.info('Neo4j connection closed');
    
    // Exit with success
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    // Exit with failure
    process.exit(1);
  }
};

// Trust proxy (required for platforms like Render that use reverse proxies)
app.set('trust proxy', 1);

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app; // Export for testing