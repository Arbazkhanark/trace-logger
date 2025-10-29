// src/log-rotation.ts
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';

export interface RotationOptions {
  enabled?: boolean;
  maxSize?: string; // '10m', '100k', '1g'
  maxFiles?: number; // Number of files to keep
  compress?: boolean; // Future feature for gzip compression
}

export class LogRotator {
  private options: Required<RotationOptions>;

  constructor(options: RotationOptions = {}) {
    this.options = {
      enabled: options.enabled ?? false,
      maxSize: options.maxSize ?? '10m',
      maxFiles: options.maxFiles ?? 5,
      compress: options.compress ?? false,
    };
  }

  /**
   * Parse size string to bytes (e.g., '10m' -> 10485760)
   */
  private parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024,
    };

    const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([bkmg])?$/);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const size = parseFloat(match[1]);
    const unit = match[2] || 'b';

    return Math.floor(size * (units[unit] || 1));
  }

  /**
   * Check if rotation is needed and perform rotation
   */
  checkAndRotate(filePath: string): void {
    if (!this.options.enabled) return;

    try {
      if (!existsSync(filePath)) return;

      const stats = statSync(filePath);
      const maxSize = this.parseSize(this.options.maxSize);

      // Check if file size exceeds limit
      if (stats.size > maxSize) {
        this.rotateFile(filePath);
        this.cleanupOldFiles(filePath);
      }
    } catch (error) {
      console.error('Log rotation error:', error);
    }
  }

  /**
   * Rotate the current log file
   */
  private rotateFile(filePath: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    const dir = dirname(filePath);
    const baseName = basename(filePath, extname(filePath));
    const extension = extname(filePath);

    // Create rotated filename
    const rotatedPath = join(dir, `${baseName}-${timestamp}${extension}`);

    try {
      renameSync(filePath, rotatedPath);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Clean up old log files beyond maxFiles limit
   */
  private cleanupOldFiles(filePath: string): void {
    const dir = dirname(filePath);
    const baseName = basename(filePath, extname(filePath));
    const extension = extname(filePath);

    try {
      const files = readdirSync(dir)
        .filter(file => file.startsWith(baseName) && file.endsWith(extension) && file !== basename(filePath))
        .map(file => ({
          name: file,
          path: join(dir, file),
          time: statSync(join(dir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Sort by modification time (newest first)

      // Remove files beyond maxFiles limit
      if (files.length > this.options.maxFiles) {
        const filesToRemove = files.slice(this.options.maxFiles);
        filesToRemove.forEach(file => {
          try {
            unlinkSync(file.path);
          } catch (error) {
            console.error('Failed to remove old log file:', error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  /**
   * Get rotation status
   */
  getStatus(filePath: string) {
    if (!existsSync(filePath)) {
      return { exists: false, size: 0, needsRotation: false };
    }

    const stats = statSync(filePath);
    const maxSize = this.parseSize(this.options.maxSize);
    const needsRotation = stats.size > maxSize;

    return {
      exists: true,
      size: stats.size,
      maxSize,
      needsRotation,
      sizePercentage: (stats.size / maxSize) * 100
    };
  }
}