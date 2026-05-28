import winston from 'winston';
import path from 'path';

// Define log format with timestamps and structured data
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  winston.format.json()
);

// Create logger instance with multiple transports
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: {
    service: 'pr-agent',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version,
  },
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `[${timestamp}] ${level}: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  logger.add(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: customFormat,
    })
  );

  // Combined log file
  logger.add(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      format: customFormat,
    })
  );
}

// Export logger with convenience methods
export const log = {
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
    logger.error(message, { error: error?.message, stack: error?.stack, ...meta });
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, meta);
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, meta);
  },
  trace: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, { level: 'trace', ...meta });
  },
};

export default logger;
