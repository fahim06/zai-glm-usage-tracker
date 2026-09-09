import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatTokens, formatCountdown, renderProgressBar, getQuotaStatusBadge } from '../src/utils/formatters';

describe('Formatters Unit Tests', () => {
  it('formats token numbers with K and M suffixes', () => {
    assert.strictEqual(formatTokens(0), '0');
    assert.strictEqual(formatTokens(500), '500');
    assert.strictEqual(formatTokens(1200), '1.2K');
    assert.strictEqual(formatTokens(14600), '14.6K');
    assert.strictEqual(formatTokens(100000), '100K');
    assert.strictEqual(formatTokens(1250000), '1.3M');
    assert.strictEqual(formatTokens(undefined), '0');
  });

  it('formats countdown relative to now', () => {
    const now = 1700000000000;
    // 2 hours 15 minutes ahead
    const twoHoursFifteenMin = now + (2 * 3600 + 15 * 60) * 1000;
    assert.strictEqual(formatCountdown(twoHoursFifteenMin, now), '2h 15m');

    // 45 seconds ahead
    const fortyFiveSec = now + 45 * 1000;
    assert.strictEqual(formatCountdown(fortyFiveSec, now), '45s');

    // Already passed
    assert.strictEqual(formatCountdown(now - 5000, now), 'resetting now');
    assert.strictEqual(formatCountdown(undefined, now), 'unknown');
  });

  it('renders modern progress bars correctly', () => {
    assert.strictEqual(renderProgressBar(0, 10), '[▱▱▱▱▱▱▱▱▱▱] 0%');
    assert.strictEqual(renderProgressBar(50, 10), '[▰▰▰▰▰▱▱▱▱▱] 50%');
    assert.strictEqual(renderProgressBar(100, 10), '[▰▰▰▰▰▰▰▰▰▰] 100%');
    assert.strictEqual(renderProgressBar(16, 10), '[▰▰▱▱▱▱▱▱▱▱] 16%');
    // Supports custom glyphs
    assert.strictEqual(renderProgressBar(50, 6, '█', '░'), '[███░░░] 50%');
  });

  it('computes correct quota status badges', () => {
    assert.strictEqual(getQuotaStatusBadge(20), '🟢 Healthy');
    assert.strictEqual(getQuotaStatusBadge(79), '🟢 Healthy');
    assert.strictEqual(getQuotaStatusBadge(80), '🟡 Warning');
    assert.strictEqual(getQuotaStatusBadge(94), '🟡 Warning');
    assert.strictEqual(getQuotaStatusBadge(95), '🔴 Critical');
    assert.strictEqual(getQuotaStatusBadge(100), '🔴 Critical');
  });
});
