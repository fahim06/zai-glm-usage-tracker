/**
 * Raw wire types for Z.ai and BigModel API responses.
 * These reflect the exact JSON structures returned by Z.ai monitor endpoints.
 */

export interface ZaiQuotaLimitItem {
  type: string;             // e.g. "TOKENS_LIMIT", "CREDIT_LIMIT", "TIME_LIMIT"
  unit: number;             // 3 = 5-hour window, 5 = monthly MCP window
  percentage: number;       // 0 - 100
  usage?: number;           // Tokens or credits used (optional)
  currentValue?: number;    // Alternative field for used value
  remaining?: number;       // Remaining units
  nextResetTime?: number;   // Epoch timestamp in milliseconds
}

export interface ZaiQuotaLimitData {
  limits: ZaiQuotaLimitItem[];
  level?: string;           // e.g. "lite", "pro", "max"
}

export interface ZaiQuotaLimitResponse {
  code: number;             // 200 on success
  msg?: string;
  message?: string;
  data?: ZaiQuotaLimitData;
}

export interface ZaiModelUsageData {
  totalTokens?: number;
  totalPrompts?: number;
  tokens?: number;
  prompts?: number;
  totalTokensUsage?: number;
  totalModelCallCount?: number;
  totalUsage?: {
    totalTokensUsage?: number;
    totalModelCallCount?: number;
    tokens?: number;
    prompts?: number;
  };
  tokensUsage?: number[];
  x_time?: string[];
  granularity?: string;
  modelDataList?: Array<{
    modelName: string;
    tokensUsage?: number[];
  }>;
}

export interface ZaiModelUsageResponse {
  code: number;
  msg?: string;
  message?: string;
  data?: ZaiModelUsageData;
}
