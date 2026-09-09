import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateBurnRate } from '../src/utils/burnRate';
import { UsageSnapshot } from '../src/types/domain';

describe('BurnRate Unit Tests', () => {
  const baseTime = 1700000000000;

  it('returns idle estimate when fewer than 2 snapshots exist', () => {
    const snapshots: UsageSnapshot[] = [
      { timestamp: baseTime, accountId: 'acc1', fiveHourPercentage: 20 }
    ];

    const res = calculateBurnRate(snapshots, 20, undefined, baseTime);
    assert.strictEqual(res.status, 'idle');
    assert.strictEqual(res.percentagePerHour, 0);
    assert.strictEqual(res.formattedSummary, 'Burn: Stable / Idle');
  });

  it('calculates positive burn rate and projected minutes to exhaustion', () => {
    // 30 minutes elapsed, usage went from 20% to 35% (+15% in 30m => 30%/hr)
    const snapshots: UsageSnapshot[] = [
      { timestamp: baseTime - 30 * 60 * 1000, accountId: 'acc1', fiveHourPercentage: 20 },
      { timestamp: baseTime, accountId: 'acc1', fiveHourPercentage: 35 }
    ];

    // Current is 35%, remaining is 65%. 65 / 30% * 60 = 130 minutes
    const res = calculateBurnRate(snapshots, 35, undefined, baseTime);
    assert.strictEqual(res.percentagePerHour, 30);
    assert.strictEqual(res.status, 'critical'); // >= 25%/hr triggers critical
    assert.strictEqual(res.minutesToExhaustion, 130);
    assert.match(res.formattedSummary, /\+30\.0%\/hr/);
    assert.match(res.formattedSummary, /Exhaustion: ~2h 10m/);
  });

  it('flags isExhaustionBeforeReset based on nextResetTime', () => {
    const snapshots: UsageSnapshot[] = [
      { timestamp: baseTime - 30 * 60 * 1000, accountId: 'acc1', fiveHourPercentage: 40 },
      { timestamp: baseTime, accountId: 'acc1', fiveHourPercentage: 55 }
    ];

    // Case A: Next reset is 3 hours away (180 mins). Exhaustion is ~90 mins => exhausts before reset.
    const resetFar = baseTime + 180 * 60 * 1000;
    const resA = calculateBurnRate(snapshots, 55, resetFar, baseTime);
    assert.strictEqual(resA.isExhaustionBeforeReset, true);
    assert.match(resA.formattedSummary, /Exhaustion: ~/);

    // Case B: Next reset is 30 minutes away. Exhaustion is 90 mins => resets before exhaustion.
    const resetSoon = baseTime + 30 * 60 * 1000;
    const resB = calculateBurnRate(snapshots, 55, resetSoon, baseTime);
    assert.strictEqual(resB.isExhaustionBeforeReset, false);
    assert.match(resB.formattedSummary, /Quota resets before limit/);
  });

  it('handles negative or flat delta as idle', () => {
    const snapshots: UsageSnapshot[] = [
      { timestamp: baseTime - 30 * 60 * 1000, accountId: 'acc1', fiveHourPercentage: 50 },
      { timestamp: baseTime, accountId: 'acc1', fiveHourPercentage: 40 } // Usage dropped (e.g. rollover)
    ];

    const res = calculateBurnRate(snapshots, 40, undefined, baseTime);
    assert.strictEqual(res.status, 'idle');
    assert.strictEqual(res.percentagePerHour, 0);
    assert.strictEqual(res.formattedSummary, 'Burn: Stable / Idle');
  });

  it('calculates token burn per hour when thirtyDayTokens present', () => {
    const snapshots: UsageSnapshot[] = [
      { timestamp: baseTime - 60 * 60 * 1000, accountId: 'acc1', fiveHourPercentage: 10, thirtyDayTokens: 100000 },
      { timestamp: baseTime, accountId: 'acc1', fiveHourPercentage: 20, thirtyDayTokens: 150000 }
    ];

    const res = calculateBurnRate(snapshots, 20, undefined, baseTime);
    assert.strictEqual(res.percentagePerHour, 10);
    assert.strictEqual(res.tokensPerHour, 50000);
  });
});
