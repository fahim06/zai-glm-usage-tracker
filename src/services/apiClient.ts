import {
  DEFAULT_API_ENDPOINT,
  QUOTA_LIMIT_PATH,
  MODEL_USAGE_PATH,
  REQUEST_TIMEOUT_MS
} from '../config/constants';
import {
  ZaiQuotaLimitData,
  ZaiQuotaLimitResponse,
  ZaiModelUsageData,
  ZaiModelUsageResponse
} from '../types/api';

export interface ApiValidationResult {
  valid: boolean;
  tier?: string | undefined;
  error?: string | undefined;
  statusCode?: number | undefined;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isAuthError: boolean = false,
    public readonly isRateLimit: boolean = false
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  /**
   * Sanitizes any occurrences of the API key from an error message or string.
   */
  private static sanitize(text: string, apiKey?: string): string {
    if (!apiKey) {
      return text;
    }
    return text.replaceAll(apiKey, '[REDACTED_API_KEY]');
  }

  private static getHeaders(apiKey: string): Record<string, string> {
    const cleanKey = apiKey.trim();
    return {
      'Authorization': `Bearer ${cleanKey}`,
      'Accept': 'application/json',
      'User-Agent': 'VSCode-ZaiGLMTracker/0.1.0'
    };
  }

  /**
   * Validates an API key by probing the quota endpoint.
   * This is a lightweight call that simultaneously tests authentication and verifies the plan level.
   */
  public async validateApiKey(apiKey: string, baseUrl: string = DEFAULT_API_ENDPOINT): Promise<ApiValidationResult> {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      return { valid: false, error: 'API key cannot be empty.' };
    }

    try {
      const data = await this.fetchQuotaLimits(cleanKey, baseUrl);
      return {
        valid: true,
        tier: data.level
      };
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.isAuthError) {
          return {
            valid: false,
            statusCode: err.statusCode,
            error: 'Authentication failed. Please verify your Z.ai API key at z.ai/manage-apikey.'
          };
        }
        if (err.isRateLimit) {
          return {
            valid: false,
            statusCode: err.statusCode,
            error: 'Z.ai API rate limit reached. Please wait a moment before trying again.'
          };
        }
        return {
          valid: false,
          statusCode: err.statusCode,
          error: err.message
        };
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: ApiClient.sanitize(errorMsg, cleanKey)
      };
    }
  }

  /**
   * Fetches real-time quota limits (5-hour and MCP tool quotas).
   */
  public async fetchQuotaLimits(apiKey: string, baseUrl: string = DEFAULT_API_ENDPOINT): Promise<ZaiQuotaLimitData> {
    const cleanKey = apiKey.trim();
    const url = `${baseUrl.replace(/\/+$/, '')}${QUOTA_LIMIT_PATH}`;

    const json = await this.request<ZaiQuotaLimitResponse>(url, cleanKey);
    if (!json.data || !Array.isArray(json.data.limits)) {
      throw new ApiClientError('Unexpected API response structure: missing limits array.');
    }

    return json.data;
  }

  /**
   * Fetches historical model usage stats (e.g. 30-day usage window).
   */
  public async fetchModelUsage(
    apiKey: string,
    startTime: string,
    endTime: string,
    baseUrl: string = DEFAULT_API_ENDPOINT
  ): Promise<ZaiModelUsageData> {
    const cleanKey = apiKey.trim();
    const base = baseUrl.replace(/\/+$/, '');
    const query = new URLSearchParams({ startTime, endTime }).toString();
    const url = `${base}${MODEL_USAGE_PATH}?${query}`;

    const json = await this.request<ZaiModelUsageResponse | ZaiModelUsageData>(url, cleanKey);
    if (json && typeof json === 'object') {
      if ('data' in json && json.data && typeof json.data === 'object') {
        return json.data;
      }
      return json as ZaiModelUsageData;
    }
    return {};
  }

  /**
   * Internal HTTP request helper using global fetch with timeout and error classification.
   */
  private async request<T>(url: string, apiKey: string): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: ApiClient.getHeaders(apiKey),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new ApiClientError('Request timed out while contacting Z.ai API (10s timeout).');
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ApiClientError(`Network connection failed: ${ApiClient.sanitize(rawMsg, apiKey)}`);
    }

    if (!response.ok) {
      const status = response.status;
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        // Ignore read errors on body
      }

      if (status === 401 || status === 403) {
        throw new ApiClientError('Invalid or expired Z.ai API key.', status, true, false);
      }
      if (status === 429) {
        throw new ApiClientError('Z.ai API rate limit exceeded.', status, false, true);
      }
      if (status >= 500) {
        throw new ApiClientError(`Z.ai server error (HTTP ${status}). Please try again shortly.`, status);
      }

      const sanitizedBody = ApiClient.sanitize(bodyText.slice(0, 150), apiKey);
      throw new ApiClientError(
        `API request failed with HTTP ${status}${sanitizedBody ? `: ${sanitizedBody}` : ''}`,
        status
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiClientError('Failed to parse JSON response from Z.ai API.');
    }
  }
}
