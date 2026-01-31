// // src/db-logger.ts
// import type { LoggerConfig, LogOptions } from './logger.js'; // Import from existing

// // Types for DB
// export interface DBLoggerOptions {
//   type: 'sql' | 'nosql';
//   orm?: 'typeorm' | 'sequelize' | 'prisma' | 'mongoose' | 'native'; // Extendable
//   logLevel?: 'debug' | 'info' | 'warn' | 'error';
//   slowQueryThreshold?: number; // ms, e.g., 100ms for warn
//   maskSensitive?: boolean; // Hide passwords in metadata
// }

// // Factory: Returns DB-specific logger adapter
// export function createDBLogger(
//   scaleLogger: any, // Your CustomLogger instance
//   options: DBLoggerOptions = { type: 'sql' }
// ): any {
//   const { type, orm = 'typeorm', logLevel = 'debug', slowQueryThreshold = 100, maskSensitive = true } = options;

//   // Helper to mask sensitive data (e.g., passwords)
//   const maskData = (data: any): any => {
//     if (!maskSensitive || typeof data !== 'object') return data;
//     return JSON.parse(JSON.stringify(data).replace(/password|secret|token/gi, '***MASKED***'));
//   };

//   // SQL Adapter (TypeORM focus, extensible)
//   if (type === 'sql') {
//     class SQLScaletraceLogger {
//       logQuery(query: string, parameters?: any[], duration?: number) {
//         const opts: LogOptions = {
//           functionName: 'database/query',
//           metadata: maskData({ parameters, duration: `${duration || 0}ms` })
//         };
//         scaleLogger.debug(query, opts);
//       }

//       logQueryError(error: string, query?: string, parameters?: any[], duration?: number) {
//         const opts: LogOptions = {
//           functionName: 'database/query',
//           metadata: maskData({ query, parameters, duration: `${duration || 0}ms` }),
//           error: new Error(error)
//         };
//         scaleLogger.error('Database query error', opts);
//       }

//       logQuerySlow(query: string, parameters?: any[], duration: number) {
//         if (duration < slowQueryThreshold) return;
//         const opts: LogOptions = {
//           functionName: 'database/query',
//           metadata: maskData({ query, parameters, duration: `${duration}ms`, slow: true })
//         };
//         scaleLogger.warn(`Slow query detected (>${slowQueryThreshold}ms)`, opts);
//       }

//       logMigration(message: string) {
//         scaleLogger.info(message, { functionName: 'database/migration' });
//       }

//       log(level: 'log' | 'info' | 'warn' | 'error', message: any) {
//         const fnName = level === 'error' ? 'database/connect' : 'database/general';
//         const opts: LogOptions = { functionName: fnName };
//         if (level === 'error') {
//           opts.error = new Error(message as string);
//         }
//         scaleLogger[level as keyof typeof scaleLogger](message as string, opts);
//       }
//     }
//     return new SQLScaletraceLogger();
//   }

//   // NoSQL Adapter (Mongoose focus)
//   if (type === 'nosql') {
//     const middleware = (schema: any, operation: string) => {
//       schema.pre(operation, function (next: any) {
//         const query = this.getQuery?.() || this.modelName;
//         scaleLogger.debug(`Mongo ${operation.toUpperCase()}`, {
//           functionName: 'database/query',
//           metadata: maskData({ operation, filter: this.getFilter?.(), collection: this.model?.collection?.name })
//         });
//         next();
//       });

//       schema.post(operation, function (doc: any, next: any) {
//         scaleLogger.info(`Document ${operation}ed`, {
//           functionName: 'database/query',
//           metadata: maskData({ operation, collection: this.collection?.name, id: doc?._id })
//         });
//         next();
//       });

//       schema.post(`${operation}Error`, function (error: any, doc: any, next: any) {
//         scaleLogger.error(`Mongo ${operation} error`, {
//           functionName: 'database/query',
//           metadata: maskData({ operation, collection: doc?.collection?.name }),
//           error
//         });
//         next(error);
//       });
//     };

//     // Connection hooks
//     const connectionHooks = (conn: any) => {
//       conn.on('connected', () => {
//         scaleLogger.info('MongoDB connected', { functionName: 'database/connect' });
//       });
//       conn.on('error', (err: any) => {
//         scaleLogger.error('MongoDB connection error', {
//           functionName: 'database/connect',
//           metadata: maskData({ readyState: conn.readyState }),
//           error: err
//         });
//       });
//     };

//     return { middleware, connectionHooks }; // Return hooks for user to apply
//   }

//   throw new Error(`Unsupported DB type: ${type}`);
// }

// // Export types
// export type { DBLoggerOptions };












// src/db-logger.ts
import type { LogOptions } from './logger.js'; // only need LogOptions

// Types for DB
export interface DBLoggerOptions {
  type: 'sql' | 'nosql';
  orm?: 'typeorm' | 'sequelize' | 'prisma' | 'mongoose' | 'native'; // Extendable
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  slowQueryThreshold?: number; // ms, e.g., 100ms for warn
  maskSensitive?: boolean; // Hide passwords in metadata
}

// Factory: Returns DB-specific logger adapter
export function createDBLogger(
  scaleLogger: any, // Your CustomLogger instance
  options: DBLoggerOptions = { type: 'sql' }
): any {
  const {
    type,
    orm = 'typeorm',
    logLevel = 'debug',
    slowQueryThreshold = 100,
    maskSensitive = true,
  } = options;

  // Helper to mask sensitive data (e.g., passwords)
  const maskData = (data: any): any => {
    if (!maskSensitive || typeof data !== 'object' || data === null) return data;
    try {
      // stringify then replace keys case-insensitively
      const str = JSON.stringify(data);
      const masked = str.replace(/("?(password|secret|token|pwd)"?\s*:\s*)("[^"]*"|\d+|null|true|false|\[[^\]]*\]|\{[^\}]*\})/gi, '$1"***MASKED***"');
      return JSON.parse(masked);
    } catch {
      return data;
    }
  };

  // SQL Adapter (TypeORM focus, extensible)
  if (type === 'sql') {
    class SQLScaletraceLogger {
      // query with optional parameters and optional duration
      logQuery(query: string, parameters?: any[], duration?: number) {
        const opts: LogOptions = {
          functionName: 'database/query',
          metadata: maskData({ parameters, duration: duration != null ? `${duration}ms` : '0ms' }),
        };
        scaleLogger.debug(query, opts);
      }

      // query error
      logQueryError(error: string | Error, query?: string, parameters?: any[], duration?: number) {
        const err = error instanceof Error ? error : new Error(String(error));
        const opts: LogOptions = {
          functionName: 'database/query',
          metadata: maskData({ query, parameters, duration: duration != null ? `${duration}ms` : '0ms' }),
          error: err,
        };
        scaleLogger.error('Database query error', opts);
      }

      // make duration optional to avoid "required after optional" error
      logQuerySlow(query: string, parameters?: any[], duration?: number) {
        if (duration == null) return;
        if (duration < slowQueryThreshold) return;
        const opts: LogOptions = {
          functionName: 'database/query',
          metadata: maskData({ query, parameters, duration: `${duration}ms`, slow: true }),
        };
        scaleLogger.warn(`Slow query detected (>${slowQueryThreshold}ms)`, opts);
      }

      logMigration(message: string) {
        scaleLogger.info(message, { functionName: 'database/migration' });
      }

      log(level: 'log' | 'info' | 'warn' | 'error', message: any) {
        const fnName = level === 'error' ? 'database/connect' : 'database/general';
        const opts: LogOptions = { functionName: fnName };
        if (level === 'error') {
          opts.error = message instanceof Error ? message : new Error(String(message));
        }
        // ensure method exists on scaleLogger
        const method = (scaleLogger as any)[level] ?? ((m: any, o: any) => (scaleLogger.info ? scaleLogger.info(m, o) : null));
        method.call(scaleLogger, String(message), opts);
      }
    }
    return new SQLScaletraceLogger();
  }

// NoSQL Adapter (Mongoose focus)
if (type === 'nosql') {
  const middleware = (schema: any) => {
    const ops = [
      'save',
      'insertMany',
      'find',
      'findOne',
      'findOneAndUpdate',
      'updateOne',
      'updateMany',
      'deleteOne',
      'deleteMany',
      'aggregate',
    ];

    ops.forEach((operation) => {
      // 🔹 Pre-hook (before query executes)
      schema.pre(operation, function (this: any, next: any) {
        try {
          const filter =
            typeof this.getFilter === 'function'
              ? this.getFilter()
              : this._conditions || {};
          const update =
            typeof this.getUpdate === 'function'
              ? this.getUpdate()
              : this._update || {};
          const options = this.options || {};
          const collection =
            this.model?.collection?.name || this.collection?.name;
          const doc = this.toObject ? this.toObject() : undefined;

          scaleLogger.debug(`Mongo Pre-${operation.toUpperCase()}`, {
            functionName: 'database/query',
            metadata: maskData({
              operation,
              collection,
              query: filter,
              update,
              options,
              doc,
            }),
          });
        } catch (err) {
          scaleLogger.error('Mongo pre-middleware error', {
            functionName: 'database/query',
            error: err as Error,
          });
        }
        next();
      });

      // 🔹 Post-hook (after query success)
      schema.post(operation, function (this: any, result: any, next: any) {
        try {
          const collection =
            this.model?.collection?.name || this.collection?.name;
          scaleLogger.info(`Mongo ${operation} success`, {
            functionName: 'database/query',
            metadata: maskData({
              operation,
              collection,
              resultSummary: Array.isArray(result)
                ? `${result.length} docs`
                : typeof result === 'object'
                ? Object.keys(result).length > 0
                  ? '1 doc affected'
                  : 'no docs'
                : String(result),
            }),
          });
        } catch (err) {
          scaleLogger.error('Mongo post-middleware error', {
            functionName: 'database/query',
            error: err as Error,
          });
        }
        next?.();
      });

      // 🔹 Error hook (if query fails)
      schema.post(`${operation}Error`, function (this: any, error: any, next: any) {
        try {
          const collection =
            this.model?.collection?.name || this.collection?.name;
          scaleLogger.error(`Mongo ${operation} failed`, {
            functionName: 'database/query',
            metadata: maskData({ operation, collection }),
            error,
          });
        } catch (err) {
          scaleLogger.error('Mongo post-error middleware failure', {
            functionName: 'database/query',
            error: err as Error,
          });
        }
        next?.(error);
      });
    });
  };

  // 🔹 Connection hooks
  const connectionHooks = (conn: any) => {
    conn.on('connected', () => {
      scaleLogger.info('MongoDB connected', { functionName: 'database/connect',
        includeTraceId:false
       });
    });
    conn.on('error', (err: any) => {
      scaleLogger.error('MongoDB connection error', {
        functionName: 'database/connect',
        includeTraceId:false,
        metadata: maskData({ readyState: conn.readyState }),
        error: err,
      });
    });
  };

  return { middleware, connectionHooks };
}

  throw new Error(`Unsupported DB type: ${type}`);
}
