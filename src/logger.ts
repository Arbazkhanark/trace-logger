// src/logger.ts
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { LoggerCircuitBreaker, CircuitBreakerOptions } from './circuit-breaker.js';
import { LogRotator, RotationOptions } from './log.rotation.js';

// AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

// ANSI color codes for colorful output
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

// Default Level-specific colors - ALWAYS USED (even when colors=false)
const DefaultLevelColors = {
  debug: Colors.cyan,
  info: Colors.green,
  warn: Colors.yellow,
  error: Colors.red,
};

// ✅ EXPORT INTERFACES
export interface LogOptions {
  functionName: string;
  metadata?: Record<string, any>;
  error?: Error;
  customColor?: string;
  logColor?: string;
  fullLogColor?: string;
}

export interface LoggerConfig {
  mode?: 'simple' | 'pro';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  filePath?: string;
  includeIp?: boolean;
  includeUserAgent?: boolean;
  includeParams?: boolean;
  includeQueries?: boolean;
  includeResponseHeaders?: boolean;
  includeSendData?: boolean;
  colors?: boolean;
  customColors?: {
    debug?: string;
    info?: string;
    warn?: string;
    error?: string;
  };
  circuitBreaker?: CircuitBreakerOptions;
  rotation?: RotationOptions;
}

// Custom file transport with rotation support
function createFileTransport(filePath: string, rotator: LogRotator) {
  const absoluteFilePath = resolve(process.cwd(), filePath);
  const logDir = dirname(absoluteFilePath);

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return {
    write: (data: string) => {
      try {
        // Check and rotate before writing
        rotator.checkAndRotate(absoluteFilePath);

        const stream = createWriteStream(absoluteFilePath, {
          flags: 'a',
          encoding: 'utf8'
        });
        stream.write(data + '\n');
        stream.end();
      } catch (err) {
        console.error('Failed to write to log file:', err);
      }
    }
  };
}

// Get timestamp in improved format with milliseconds
function getTimestamp(): string {
  return new Date().toISOString();
}

// Get formatted time with milliseconds for console
function getConsoleTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// Remove colors from string for file logging
function removeColors(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Get color code from string name
function getColorCode(colorName: string): string {
  const colorMap: { [key: string]: string } = {
    'black': Colors.black,
    'red': Colors.red,
    'green': Colors.green,
    'yellow': Colors.yellow,
    'blue': Colors.blue,
    'magenta': Colors.magenta,
    'cyan': Colors.cyan,
    'white': Colors.white,
    'brightRed': Colors.brightRed,
    'brightGreen': Colors.brightGreen,
    'brightYellow': Colors.brightYellow,
    'brightBlue': Colors.brightBlue,
    'brightMagenta': Colors.brightMagenta,
    'brightCyan': Colors.brightCyan,
    'brightWhite': Colors.brightWhite,
  };

  return colorMap[colorName] || '';
}

// Format log in EXACT old multi-line format with single-line JSON metadata
function formatLog(level: string, msg: string, opts: LogOptions, useColors: boolean = true, customLevelColors?: any): string {
  const traceId = asyncLocalStorage.getStore()?.get('traceId') || uuidv4();

  // Use single-line JSON for metadata (no pretty printing)
  const metadata = opts.metadata ? JSON.stringify(opts.metadata) : '{}';

  // LOG LEVEL COLOR: Use custom color if provided in log options, then custom level colors, then default
  let levelColor = DefaultLevelColors[level as keyof typeof DefaultLevelColors];

  if (opts.customColor) {
    levelColor = getColorCode(opts.customColor);
  } else if (customLevelColors && customLevelColors[level]) {
    levelColor = getColorCode(customLevelColors[level]);
  }

  const resetColor = Colors.reset;

  // Other colors depend on useColors flag
  const dimColor = useColors ? Colors.dim : '';
  const brightColor = useColors ? Colors.bright : '';

  // Apply full log color to everything except level
  const fullLogColor = opts.fullLogColor ? getColorCode(opts.fullLogColor) : '';

  // Apply log color only to the message if specified
  const logColor = opts.logColor ? getColorCode(opts.logColor) : '';

  // Build output with fullLogColor applied to everything except level
  let output = `${fullLogColor}${brightColor}${getTimestamp()}:${resetColor} ${levelColor}${level}${resetColor}: ${fullLogColor}${logColor}${msg}${resetColor}\n${fullLogColor}${dimColor}Trace Id: ${traceId}${resetColor}\n${fullLogColor}${dimColor}Function Name: ${opts.functionName}${resetColor}\n${fullLogColor}${dimColor}Metadata: ${metadata}${resetColor}`;

  if (opts.error?.stack) {
    const errorColor = useColors ? Colors.red : '';
    output = `${output}\n${fullLogColor}${errorColor}Error Stack: ${opts.error.stack}${resetColor}`;
  }

  return output;
}

// Custom Console Logger (No Pino)
class CustomLogger {
  private fileTransport: any = null;
  private circuitBreaker: LoggerCircuitBreaker;
  private logRotator: LogRotator;
  private config: LoggerConfig;
  private logLevels = ['debug', 'info', 'warn', 'error'];
  private currentLogLevelIndex: number;
  private useColors: boolean;
  private customLevelColors: any;

  constructor(config: LoggerConfig = {}) {
    this.config = config;

    // Set log level
    this.currentLogLevelIndex = this.logLevels.indexOf(config.logLevel || 'info');

    // Enable additional colors by default, can be disabled
    this.useColors = config.colors !== false;

    // Store custom level colors
    this.customLevelColors = config.customColors || {};

    // Initialize circuit breaker
    this.circuitBreaker = new LoggerCircuitBreaker(config.circuitBreaker || {});

    // Initialize log rotator
    this.logRotator = new LogRotator(config.rotation || {});

    // Create file transport for pro mode
    if (config.mode === 'pro' && config.filePath) {
      this.fileTransport = createFileTransport(config.filePath, this.logRotator);
    }
  }

  private shouldLog(level: string): boolean {
    const levelIndex = this.logLevels.indexOf(level);
    return levelIndex >= this.currentLogLevelIndex;
  }

  private writeToConsole(level: 'info' | 'debug' | 'warn' | 'error', formattedLog: string, customColor?: string, logColor?: string, fullLogColor?: string) {
    const timestamp = getConsoleTimestamp();

    // LOG LEVEL COLOR: Use custom color if provided, then custom level colors, then default
    let levelColor = DefaultLevelColors[level];

    if (customColor) {
      levelColor = getColorCode(customColor);
    } else if (this.customLevelColors && this.customLevelColors[level]) {
      levelColor = getColorCode(this.customLevelColors[level]);
    }

    const resetColor = Colors.reset;

    // Other colors depend on useColors flag
    const pidColor = this.useColors ? Colors.blue : '';
    const bracketColor = this.useColors ? Colors.dim : '';

    // Apply full log color to prefix (except level)
    const fullLogPrefixColor = fullLogColor ? getColorCode(fullLogColor) : '';

    const prefix = `${fullLogPrefixColor}${bracketColor}[${timestamp}]${resetColor} ${levelColor}${level.toUpperCase()}${resetColor} ${fullLogPrefixColor}${bracketColor}(${pidColor}${process.pid}${bracketColor}):${resetColor}`;

    switch (level) {
      case 'info':
        console.log(prefix, formattedLog);
        break;
      case 'debug':
        console.log(prefix, formattedLog);
        break;
      case 'warn':
        console.warn(prefix, formattedLog);
        break;
      case 'error':
        console.error(prefix, formattedLog);
        break;
    }
  }

  private log(level: 'info' | 'debug' | 'warn' | 'error', msg: string, opts: LogOptions) {
    // Check log level
    if (!this.shouldLog(level)) {
      return;
    }

    // Check circuit breaker for errors
    if (level === 'error' && !this.circuitBreaker.isEnabled()) {
      return;
    }

    const formattedLog = formatLog(level, msg, opts, this.useColors, this.customLevelColors);

    // Write to console with custom format
    this.writeToConsole(level, formattedLog, opts.customColor, opts.logColor, opts.fullLogColor);

    // Write to file in pro mode (without colors)
    if (this.fileTransport) {
      const fileLog = formatLog(level, msg, opts, false);
      this.fileTransport.write(removeColors(fileLog));
    }

    // Increment circuit breaker for errors
    if (level === 'error') {
      this.circuitBreaker.incrementErrorCount();
    }
  }

  info(msg: string, opts: LogOptions) {
    this.log('info', msg, opts);
  }

  debug(msg: string, opts: LogOptions) {
    this.log('debug', msg, opts);
  }

  warn(msg: string, opts: LogOptions) {
    this.log('warn', msg, opts);
  }

  error(msg: string, opts: LogOptions) {
    this.log('error', msg, opts);
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.enable();
  }

  /**
   * Get log rotation status
   */
  getRotationStatus() {
    return this.config.filePath ? this.logRotator.getStatus(this.config.filePath) : null;
  }

  /**
   * Manually trigger log rotation
   */
  rotateLogs() {
    if (this.config.filePath) {
      this.logRotator.checkAndRotate(this.config.filePath);
    }
  }
}

// Global logger instance
let globalLogger: CustomLogger;

export const logger = {
  init(config: LoggerConfig = {}) {
    globalLogger = new CustomLogger(config);
  },

  info(msg: string, opts: LogOptions) {
    if (!globalLogger) {
      const formatted = formatLog('info', msg, opts, true);
      const timestamp = getConsoleTimestamp();
      const prefix = `[${timestamp}] ${DefaultLevelColors.info}INFO${Colors.reset} (${process.pid}):`;
      console.log(prefix, formatted);
      return;
    }
    globalLogger.info(msg, opts);
  },

  debug(msg: string, opts: LogOptions) {
    if (!globalLogger) {
      const formatted = formatLog('debug', msg, opts, true);
      const timestamp = getConsoleTimestamp();
      const prefix = `[${timestamp}] ${DefaultLevelColors.debug}DEBUG${Colors.reset} (${process.pid}):`;
      console.log(prefix, formatted);
      return;
    }
    globalLogger.debug(msg, opts);
  },

  warn(msg: string, opts: LogOptions) {
    if (!globalLogger) {
      const formatted = formatLog('warn', msg, opts, true);
      const timestamp = getConsoleTimestamp();
      const prefix = `[${timestamp}] ${DefaultLevelColors.warn}WARN${Colors.reset} (${process.pid}):`;
      console.warn(prefix, formatted);
      return;
    }
    globalLogger.warn(msg, opts);
  },

  error(msg: string, opts: LogOptions) {
    if (!globalLogger) {
      const formatted = formatLog('error', msg, opts, true);
      const timestamp = getConsoleTimestamp();
      const prefix = `[${timestamp}] ${DefaultLevelColors.error}ERROR${Colors.reset} (${process.pid}):`;
      console.error(prefix, formatted);
      return;
    }
    globalLogger.error(msg, opts);
  },

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return globalLogger ? globalLogger.getCircuitBreakerStatus() : null;
  },

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    if (globalLogger) {
      globalLogger.resetCircuitBreaker();
    }
  },

  /**
   * Get rotation status
   */
  getRotationStatus() {
    return globalLogger ? globalLogger.getRotationStatus() : null;
  },

  /**
   * Manually rotate logs
   */
  rotateLogs() {
    if (globalLogger) {
      globalLogger.rotateLogs();
    }
  }
};

// Express Middleware for HTTP logs
export function httpLogger(config: LoggerConfig = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const traceId = uuidv4();
    const store = new Map<string, string>().set('traceId', traceId);

    asyncLocalStorage.run(store, () => {
      const start = Date.now();

      res.on('finish', () => {
        const responseTime = `${Date.now() - start}ms`;
        const metadata: Record<string, any> = {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          responseTime,
        };

        if (config.includeIp !== false) metadata.ip = req.ip;
        if (config.includeUserAgent !== false) {
          metadata.userAgent = req.headers['user-agent'] || 'Unknown';
        }
        if (config.includeParams && req.params && Object.keys(req.params).length > 0) {
          metadata.params = req.params;
        }
        if (config.includeQueries && req.query && Object.keys(req.query).length > 0) {
          metadata.queries = req.query;
        }
        if (config.includeResponseHeaders) {
          metadata.responseHeaders = res.getHeaders();
        }
        if (config.includeSendData && (req as any).body) {
          const body = (req as any).body;
          if (typeof body === 'object' && body !== null) {
            try {
              metadata.body = JSON.parse(JSON.stringify(body));
            } catch {
              metadata.body = '[Unserializable Body]';
            }
          } else if (typeof body === 'string') {
            metadata.body = body.slice(0, 1000);
          }
        }

        logger.info(`${req.method} ${req.url}`, {
          functionName: 'HTTP_REQUEST',
          metadata,
        });
      });

      next();
    });
  };
}

// External API/DB log helper
export function logExternalCall(
  endpoint: string,
  method: string,
  metadata: Record<string, any>,
  statusCode?: number,
  error?: Error,
) {
  const traceId = asyncLocalStorage.getStore()?.get('traceId') || uuidv4();
  const baseMetadata = {
    endpoint,
    method,
    responseTime: metadata.responseTime || 'N/A',
    ...metadata,
  };

  if (error) {
    logger.error(`External API call failed`, {
      functionName: metadata.functionName || 'ExternalService.call',
      metadata: { ...baseMetadata, statusCode },
      error,
    });
  } else {
    logger.info(`Making external API request`, {
      functionName: metadata.functionName || 'ExternalService.call',
      metadata: baseMetadata,
    });
  }
}

// Initialize with default config
logger.init({
  mode: 'simple',
  logLevel: 'info',
  colors: true,
  circuitBreaker: {
    circuitBreakerCount: 5,
    circuitBreakerTime: 30000,
    circuitBreakerCooldown: 60000,
  },
  rotation: {
    enabled: true,
    maxSize: '10m',
    maxFiles: 5,
  }
});