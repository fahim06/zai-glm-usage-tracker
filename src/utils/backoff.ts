import { MIN_REFRESH_INTERVAL_SEC } from '../config/constants';

/**
 * Calculates polling delay with exponential backoff on repeated failures.
 *
 * @param baseIntervalSec - Configured interval in seconds (minimum 5s)
 * @param consecutiveFailures - Number of consecutive network/server failures
 * @param maxBackoffMs - Maximum allowed delay in milliseconds (default: 5 minutes)
 */
export function calculateBackoffDelay(
  baseIntervalSec: number,
  consecutiveFailures: number,
  maxBackoffMs: number = 300_000,
  minIntervalSec: number = MIN_REFRESH_INTERVAL_SEC
): number {
  const baseMs = Math.max(minIntervalSec, baseIntervalSec) * 1000;

  if (consecutiveFailures <= 0) {
    return baseMs;
  }

  // 2^1 = 2x, 2^2 = 4x, 2^3 = 8x, 2^4 = 16x (capped at 4)
  const exponent = Math.min(consecutiveFailures, 4);
  const backoffMs = baseMs * Math.pow(2, exponent);

  return Math.min(maxBackoffMs, backoffMs);
}
