import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UsageNormalizer } from '../src/services/usageNormalizer';
import { ZaiQuotaLimitData } from '../src/types/api';

describe('UsageNormalizer Unit Tests', () => {
  it('correctly maps unit 3 to fiveHourQuota', () => {
    const rawData: ZaiQuotaLimitData = {
      code: 200,
      level: 'pro',
      limits: [
        {
          type: 'TOKENS_LIMIT',
          unit: 3,
          percentage: 16,
          usage: 1920,
          nextResetTime: 1777819631597
        }
      ]
    } as any;

    const metrics = UsageNormalizer.normalize(rawData);

    assert.strictEqual(metrics.fiveHourQuota.unit, 3);
    assert.strictEqual(metrics.fiveHourQuota.percentage, 16);
    assert.strictEqual(metrics.fiveHourQuota.used, 1920);
    assert.strictEqual(metrics.fiveHourQuota.nextResetTime, 1777819631597);
    assert.strictEqual(metrics.planTier, 'pro');
  });

  it('estimates usage from tier if exact tokens not returned', () => {
    const rawData: ZaiQuotaLimitData = {
      level: 'lite',
      limits: [
        {
          type: 'CREDIT_LIMIT',
          unit: 3,
          percentage: 50
        }
      ]
    };

    const metrics = UsageNormalizer.normalize(rawData);
    // Lite tier = 2000 credits for 5-hour window, 50% = 1000
    assert.strictEqual(metrics.fiveHourQuota.percentage, 50);
    assert.strictEqual(metrics.fiveHourQuota.used, 1000);
  });

  it('extracts thirtyDayTokens and thirtyDayPrompts from totalUsage object (standard Z.ai monitor API)', () => {
    const rawQuota: ZaiQuotaLimitData = {
      level: 'pro',
      limits: [{ type: 'TOKENS_LIMIT', unit: 3, percentage: 20 }]
    };
    const rawModelUsage = {
      totalUsage: {
        totalTokensUsage: 450000,
        totalModelCallCount: 120
      }
    };

    const metrics = UsageNormalizer.normalize(rawQuota, rawModelUsage);
    assert.strictEqual(metrics.thirtyDayTokens, 450000);
    assert.strictEqual(metrics.thirtyDayPrompts, 120);
  });

  it('extracts thirtyDayTokens from tokensUsage array or modelDataList fallback', () => {
    const rawQuota: ZaiQuotaLimitData = {
      level: 'pro',
      limits: [{ type: 'TOKENS_LIMIT', unit: 3, percentage: 20 }]
    };

    // Array of tokensUsage
    const arrayModelUsage = {
      tokensUsage: [1000, 2500, 3500]
    };
    const metrics1 = UsageNormalizer.normalize(rawQuota, arrayModelUsage);
    assert.strictEqual(metrics1.thirtyDayTokens, 7000);

    // modelDataList breakdown
    const modelListUsage = {
      modelDataList: [
        { modelName: 'glm-4-plus', tokensUsage: [5000, 5000] },
        { modelName: 'glm-4-flash', tokensUsage: [2000, 1000] }
      ]
    };
    const metrics2 = UsageNormalizer.normalize(rawQuota, modelListUsage);
    assert.strictEqual(metrics2.thirtyDayTokens, 13000);
  });
});
