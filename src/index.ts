export { logger, httpLogger, logExternalCall, getLiveTraceId, withTraceId } from './logger.js';
export { LoggerCircuitBreaker } from './circuit-breaker.js';
export { LogRotator } from './log.rotation.js';
export type { LoggerConfig, LogOptions } from './logger.js';
export type { CircuitBreakerOptions } from './circuit-breaker.js';
export type { RotationOptions } from './log.rotation.js';
// src/index.ts (add at bottom)
export { createDBLogger, type DBLoggerOptions } from './db.logger.js';