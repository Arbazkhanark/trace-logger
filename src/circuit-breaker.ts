// src/circuit-breaker.ts
export interface CircuitBreakerOptions {
  circuitBreakerCount?: number;
  circuitBreakerTime?: number;
  circuitBreakerCooldown?: number;
  circuitBreakerCallback?: () => void;
}

export class LoggerCircuitBreaker {
  private options: Required<CircuitBreakerOptions>;
  private errorCount = 0;
  private lastResetTime = Date.now();
  private isOpen = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      circuitBreakerCount: options.circuitBreakerCount ?? 5,
      circuitBreakerTime: options.circuitBreakerTime ?? 30000,
      circuitBreakerCooldown: options.circuitBreakerCooldown ?? 60000,
      circuitBreakerCallback: options.circuitBreakerCallback ?? (() => console.log('Logging disabled due to circuit breaker')),
    };
  }

  /**
   * Enable or reset the circuit breaker
   */
  enable(): void {
    this.errorCount = 0;
    this.lastResetTime = Date.now();
    this.isOpen = false;
  }

  /**
   * Check if logging is enabled (circuit breaker not tripped)
   */
  isEnabled(): boolean {
    if (!this.isOpen) return true;

    // Check if cooldown period has passed
    const now = Date.now();
    if (now - this.lastResetTime >= this.options.circuitBreakerCooldown) {
      this.isOpen = false;
      this.errorCount = 0;
      return true;
    }

    return false;
  }

  /**
   * Increment error count and trip circuit breaker if threshold reached
   */
  incrementErrorCount(): void {
    if (this.isOpen) return;

    const now = Date.now();

    // Reset error count if time window has passed
    if (now - this.lastResetTime > this.options.circuitBreakerTime) {
      this.errorCount = 1;
    } else {
      this.errorCount++;
    }

    this.lastResetTime = now;

    // Trip circuit breaker if threshold reached
    if (this.errorCount >= this.options.circuitBreakerCount) {
      this.isOpen = true;
      this.options.circuitBreakerCallback();
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      isOpen: this.isOpen,
      errorCount: this.errorCount,
      lastResetTime: this.lastResetTime,
      timeSinceLastReset: Date.now() - this.lastResetTime,
      remainingCooldown: this.isOpen ?
        Math.max(0, this.options.circuitBreakerCooldown - (Date.now() - this.lastResetTime)) : 0
    };
  }

  /**
   * Manually trip the circuit breaker
   */
  trip(): void {
    this.isOpen = true;
    this.lastResetTime = Date.now();
  }
}