/**
 * Utility functions for formatting tokens, countdowns, and progress bars.
 */

/**
 * Formats a raw number of tokens into a concise human-readable string (e.g. 14.6K, 1.2M).
 */
export function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null || isNaN(tokens)) {
    return '0';
  }

  const abs = Math.abs(tokens);
  if (abs >= 1_000_000) {
    const formatted = (tokens / 1_000_000).toFixed(1);
    return `${formatted.replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    const formatted = (tokens / 1_000).toFixed(1);
    return `${formatted.replace(/\.0$/, '')}K`;
  }
  return tokens.toLocaleString('en-US');
}

/**
 * Formats an epoch millisecond timestamp into a relative countdown (e.g. "2h 14m", "45s", "resetting now").
 */
export function formatCountdown(resetEpochMs: number | undefined, now: number = Date.now()): string {
  if (!resetEpochMs || isNaN(resetEpochMs)) {
    return 'unknown';
  }

  const diffMs = resetEpochMs - now;
  if (diffMs <= 0) {
    return 'resetting now';
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Returns a concise status badge representing quota health.
 */
export function getQuotaStatusBadge(percentage: number): string {
  const clamped = Math.min(100, Math.max(0, Math.round(percentage)));
  if (clamped >= 95) {
    return '🔴 Critical';
  }
  if (clamped >= 80) {
    return '🟡 Warning';
  }
  return '🟢 Healthy';
}

/**
 * Creates a modern text-based progress bar using sleek block characters (e.g. [▰▰▰▰▰▱▱▱▱▱] 50%).
 */
export function renderProgressBar(
  percentage: number,
  totalBlocks: number = 10,
  filledChar: string = '▰',
  emptyChar: string = '▱'
): string {
  const clamped = Math.min(100, Math.max(0, Math.round(percentage)));
  const filledBlocks = Math.round((clamped / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;

  const filled = filledChar.repeat(filledBlocks);
  const empty = emptyChar.repeat(emptyBlocks);

  return `[${filled}${empty}] ${clamped}%`;
}
