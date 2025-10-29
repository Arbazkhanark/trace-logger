import test, { describe } from "node:test";

const express = require('express');
const request = require('supertest'); // for HTTP testing
const fs = require('fs');
const path = require('path');
const { logger, httpLogger } = require('../dist/cjs/index'); // adjust path

describe('ScaleTrace Logger System', () => {
  const logFile = path.join(__dirname, '../logs/test.log');

  beforeAll(() => {
    // Initialize logger
    logger.init({
      mode: 'pro',
      logLevel: 'debug',
      filePath: logFile,
      colors: false,
      circuitBreaker: {
        circuitBreakerCount: 3,
        circuitBreakerTime: 1000,
        circuitBreakerCooldown: 2000,
      },
      rotation: {
        enabled: false,
      },
    });

    // Clear previous logs
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  });

  test('logger should write info logs', () => {
    logger.info('Info test', { functionName: 'test/info', metadata: { test: true } });
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('Info test');
  });

  test('logger should write warn logs', () => {
    logger.warn('Warn test', { functionName: 'test/warn' });
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('Warn test');
  });

  test('logger should write error logs', () => {
    logger.error('Error test', { functionName: 'test/error' });
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('Error test');
  });

  test('logger debug logs', () => {
    logger.debug('Debug test', { functionName: 'test/debug' });
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('Debug test');
  });

  test('circuit breaker triggers after multiple errors', () => {
    // Trigger errors > circuitBreakerCount
    logger.error('CB test 1', { functionName: 'circuit/test' });
    logger.error('CB test 2', { functionName: 'circuit/test' });
    logger.error('CB test 3', { functionName: 'circuit/test' });

    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('Circuit breaker triggered');
  });

  test('httpLogger middleware logs requests', async () => {
    const app = express();
    app.use(express.json());
    app.use(httpLogger({
      mode: 'pro',
      logLevel: 'debug',
      includeQueries: true,
      includeSendData: true
    }));

    app.post('/test', (req, res) => res.status(200).send({ ok: true }));

    await request(app)
      .post('/test?query=1')
      .send({ name: 'abc' })
      .expect(200);

    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('/test');
    expect(content).toContain('abc');
  });
});
