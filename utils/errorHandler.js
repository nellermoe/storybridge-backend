const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level}]: ${message}\n${stack || ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log' })
  ]
});

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  const errorMessage = err.stack || err.message || 'Unknown error';
  logger.error(errorMessage);

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Construct the response
  const response = {
    error: {
      message: err.message || 'Internal Server Error',
      statusCode,
      // Include stack trace in development mode only
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  // Send the response
  res.status(statusCode).json(response);
};

// Custom error class for API errors
class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message) {
    return new ApiError(message || 'Bad Request', 400);
  }

  static notFound(message) {
    return new ApiError(message || 'Resource Not Found', 404);
  }

  static internalServer(message) {
    return new ApiError(message || 'Internal Server Error', 500);
  }

  static forbidden(message) {
    return new ApiError(message || 'Forbidden', 403);
  }

  static unauthorized(message) {
    return new ApiError(message || 'Unauthorized', 401);
  }
}

module.exports = {
  errorHandler,
  ApiError,
  logger
};