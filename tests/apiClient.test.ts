import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApiClient, ApiClientError } from '../src/services/apiClient';

describe('ApiClient Unit Tests', () => {
  it('validates empty API key returns false without making network call', async () => {
    const client = new ApiClient();
    const result = await client.validateApiKey('   ');
    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? '', /cannot be empty/);
  });

  it('classifies 401/403 status as authentication error', () => {
    const error = new ApiClientError('Invalid key', 401, true, false);
    assert.strictEqual(error.isAuthError, true);
    assert.strictEqual(error.isRateLimit, false);
    assert.strictEqual(error.statusCode, 401);
  });

  it('classifies 429 status as rate limit error', () => {
    const error = new ApiClientError('Rate limited', 429, false, true);
    assert.strictEqual(error.isAuthError, false);
    assert.strictEqual(error.isRateLimit, true);
    assert.strictEqual(error.statusCode, 429);
  });
});
