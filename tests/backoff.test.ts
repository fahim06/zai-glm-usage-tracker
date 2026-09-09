import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateBackoffDelay } from '../src/utils/backoff';

describe('BackoffDelay Unit Tests', () => {
  it('returns base interval when failures is 0', () => {
    assert.strictEqual(calculateBackoffDelay(30, 0), 30_000);
    assert.strictEqual(calculateBackoffDelay(60, 0), 60_000);
  });

  it('enforces sane minimum interval of 5 seconds', () => {
    assert.strictEqual(calculateBackoffDelay(5, 0), 5_000);
    assert.strictEqual(calculateBackoffDelay(0, 0), 5_000);
    assert.strictEqual(calculateBackoffDelay(-10, 0), 5_000);
  });

  it('exponentially increases delay on consecutive failures', () => {
    const base = 20; // 20s = 20,000ms
    assert.strictEqual(calculateBackoffDelay(base, 1), 40_000);  // 2x
    assert.strictEqual(calculateBackoffDelay(base, 2), 80_000);  // 4x
    assert.strictEqual(calculateBackoffDelay(base, 3), 160_000); // 8x
    assert.strictEqual(calculateBackoffDelay(base, 4), 300_000); // 16x = 320,000 -> capped at 300,000ms
  });

  it('caps delay at maxBackoffMs', () => {
    const customMax = 120_000;
    assert.strictEqual(calculateBackoffDelay(30, 10, customMax), 120_000);
  });
});
