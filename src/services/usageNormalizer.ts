import {
  UNIT_5_HOUR,
  UNIT_MONTHLY_MCP
} from '../config/constants';
import { ZaiQuotaLimitData, ZaiQuotaLimitItem, ZaiModelUsageData } from '../types/api';
import { UsageMetrics, QuotaWindow } from '../types/domain';

export class UsageNormalizer {
  /**
   * Normalizes raw API responses into a clean domain UsageMetrics object.
   */
  public static normalize(
    quotaData: ZaiQuotaLimitData,
    modelUsage?: ZaiModelUsageData,
    configuredTier: string = 'auto'
  ): UsageMetrics {
    const limits = quotaData.limits ?? [];

    const fiveHourRaw = limits.find((l) => l.unit === UNIT_5_HOUR) ?? limits[0];
    const monthlyMcpRaw = limits.find((l) => l.unit === UNIT_MONTHLY_MCP);

    const planTier = quotaData.level || (configuredTier !== 'auto' ? configuredTier : 'unknown');

    const fiveHourQuota = this.mapQuotaWindow(fiveHourRaw, '5-Hour Quota', planTier);
    const monthlyMcpQuota = monthlyMcpRaw ? this.mapQuotaWindow(monthlyMcpRaw, 'Monthly MCP Quota', planTier) : undefined;

    const thirtyDayTokens = this.extractTotalTokens(modelUsage);
    const thirtyDayPrompts = this.extractTotalPrompts(modelUsage);

    return {
      fiveHourQuota,
      ...(monthlyMcpQuota ? { monthlyMcpQuota } : {}),
      ...(thirtyDayTokens !== undefined ? { thirtyDayTokens } : {}),
      ...(thirtyDayPrompts !== undefined ? { thirtyDayPrompts } : {}),
      planTier,
      lastUpdated: new Date()
    };
  }

  /**
   * Extracts total tokens from various response structures returned by Z.ai model-usage endpoints.
   */
  public static extractTotalTokens(data: ZaiModelUsageData | undefined): number | undefined {
    if (!data) {
      return undefined;
    }

    if (data.totalUsage?.totalTokensUsage !== undefined && typeof data.totalUsage.totalTokensUsage === 'number') {
      return data.totalUsage.totalTokensUsage;
    }
    if (data.totalUsage?.tokens !== undefined && typeof data.totalUsage.tokens === 'number') {
      return data.totalUsage.tokens;
    }
    if (data.totalTokensUsage !== undefined && typeof data.totalTokensUsage === 'number') {
      return data.totalTokensUsage;
    }
    if (data.totalTokens !== undefined && typeof data.totalTokens === 'number') {
      return data.totalTokens;
    }
    if (data.tokens !== undefined && typeof data.tokens === 'number') {
      return data.tokens;
    }

    if (Array.isArray(data.tokensUsage) && data.tokensUsage.length > 0) {
      return data.tokensUsage.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    }

    if (Array.isArray(data.modelDataList) && data.modelDataList.length > 0) {
      let sum = 0;
      let hasData = false;
      for (const item of data.modelDataList) {
        if (Array.isArray(item.tokensUsage)) {
          hasData = true;
          sum += item.tokensUsage.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
        }
      }
      if (hasData) {
        return sum;
      }
    }

    return undefined;
  }

  /**
   * Extracts total prompt/model calls from various response structures returned by Z.ai model-usage endpoints.
   */
  public static extractTotalPrompts(data: ZaiModelUsageData | undefined): number | undefined {
    if (!data) {
      return undefined;
    }

    if (data.totalUsage?.totalModelCallCount !== undefined && typeof data.totalUsage.totalModelCallCount === 'number') {
      return data.totalUsage.totalModelCallCount;
    }
    if (data.totalUsage?.prompts !== undefined && typeof data.totalUsage.prompts === 'number') {
      return data.totalUsage.prompts;
    }
    if (data.totalModelCallCount !== undefined && typeof data.totalModelCallCount === 'number') {
      return data.totalModelCallCount;
    }
    if (data.totalPrompts !== undefined && typeof data.totalPrompts === 'number') {
      return data.totalPrompts;
    }
    if (data.prompts !== undefined && typeof data.prompts === 'number') {
      return data.prompts;
    }

    return undefined;
  }

  private static mapQuotaWindow(
    raw: ZaiQuotaLimitItem | undefined,
    fallbackName: string,
    tier: string
  ): QuotaWindow {
    if (!raw) {
      return {
        unit: UNIT_5_HOUR,
        name: fallbackName,
        percentage: 0,
        type: 'TOKENS_LIMIT'
      };
    }

    const percentage = Math.min(100, Math.max(0, Math.round(raw.percentage ?? 0)));
    const used = raw.usage ?? raw.currentValue ?? this.estimateTokensFromTier(percentage, tier, raw.unit);
    const remaining = raw.remaining;

    return {
      unit: raw.unit,
      name: fallbackName,
      percentage,
      ...(raw.nextResetTime ? { nextResetTime: raw.nextResetTime } : {}),
      ...(used !== undefined ? { used } : {}),
      ...(remaining !== undefined ? { remaining } : {}),
      type: raw.type ?? 'TOKENS_LIMIT'
    };
  }

  /**
   * Approximates credit/token usage from subscription tier allowances if the API doesn't return exact token count.
   */
  private static estimateTokensFromTier(percentage: number, tier: string, unit: number): number | undefined {
    const cleanTier = tier.toLowerCase();
    let totalAllowance: number | undefined;

    if (unit === UNIT_5_HOUR) {
      if (cleanTier === 'lite') {
        totalAllowance = 2000;
      } else if (cleanTier === 'pro') {
        totalAllowance = 12000;
      } else if (cleanTier === 'max') {
        totalAllowance = 28000;
      }
    }

    if (totalAllowance !== undefined) {
      return Math.round((percentage / 100) * totalAllowance);
    }

    return undefined;
  }
}
