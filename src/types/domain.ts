/**
 * Domain types decoupled from API wire formats.
 */

export type PlanTier = 'auto' | 'lite' | 'pro' | 'max';

export type ConnectionStatus = 'unconfigured' | 'connected' | 'degraded' | 'error';

export interface QuotaWindow {
  unit: number;
  name: string;
  percentage: number;
  nextResetTime?: number | undefined;
  used?: number | undefined;
  remaining?: number | undefined;
  type: string;
}

export interface UsageMetrics {
  fiveHourQuota: QuotaWindow;
  monthlyMcpQuota?: QuotaWindow | undefined;
  thirtyDayTokens?: number | undefined;
  thirtyDayPrompts?: number | undefined;
  planTier: string;
  lastUpdated: Date;
}

export interface UsageState {
  status: ConnectionStatus;
  metrics?: UsageMetrics | undefined;
  errorMessage?: string | undefined;
  lastAttempt?: Date | undefined;
  accountId?: string | undefined;
  accountLabel?: string | undefined;
}

export interface AccountInfo {
  id: string;
  label: string;
  createdAt: number;
}

export interface UsageSnapshot {
  timestamp: number;
  accountId: string;
  fiveHourPercentage: number;
  fiveHourUsed?: number | undefined;
  thirtyDayTokens?: number | undefined;
  thirtyDayPrompts?: number | undefined;
}

