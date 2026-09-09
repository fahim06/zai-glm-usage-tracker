import { UsageSnapshot } from '../types/domain';

export type BurnRateStatus = 'idle' | 'moderate' | 'heavy' | 'critical';

export interface BurnRateEstimate {
  percentagePerHour: number;
  tokensPerHour?: number | undefined;
  status: BurnRateStatus;
  minutesToExhaustion?: number | undefined;
  isExhaustionBeforeReset: boolean;
  formattedSummary: string;
}

/**
 * Calculates token and quota consumption velocity (burn rate) from historical snapshots.
 *
 * @param snapshots Historical snapshots for an account
 * @param currentPercentage Current 5-hour quota percentage (0-100)
 * @param nextResetTime Optional timestamp (ms) when current 5-hour window resets
 * @param now Current timestamp in ms (defaults to Date.now())
 */
export function calculateBurnRate(
  snapshots: UsageSnapshot[],
  currentPercentage: number,
  nextResetTime?: number | undefined,
  now: number = Date.now()
): BurnRateEstimate {
  // Return idle estimate if not enough historical data
  if (!snapshots || snapshots.length < 2) {
    return {
      percentagePerHour: 0,
      status: 'idle',
      isExhaustionBeforeReset: false,
      formattedSummary: 'Burn: Stable / Idle'
    };
  }

  // Focus on snapshots within the last 60 minutes
  const windowMs = 60 * 60 * 1000;
  const recent = snapshots.filter((s) => s.timestamp >= now - windowMs);

  // Fall back to the last 5 snapshots if fewer than 2 snapshots occurred in the last hour
  const sample = recent.length >= 2 ? recent : snapshots.slice(-5);
  const oldest = sample[0];
  const newest = sample[sample.length - 1];

  if (!oldest || !newest || oldest === newest) {
    return {
      percentagePerHour: 0,
      status: 'idle',
      isExhaustionBeforeReset: false,
      formattedSummary: 'Burn: Stable / Idle'
    };
  }

  const elapsedMinutes = (newest.timestamp - oldest.timestamp) / (60 * 1000);
  if (elapsedMinutes < 1) {
    // Insufficient elapsed time for stable rate calculation
    return {
      percentagePerHour: 0,
      status: 'idle',
      isExhaustionBeforeReset: false,
      formattedSummary: 'Burn: Stable / Idle'
    };
  }

  const deltaPct = newest.fiveHourPercentage - oldest.fiveHourPercentage;
  const percentagePerHour = deltaPct > 0 ? Math.round(((deltaPct / elapsedMinutes) * 60) * 10) / 10 : 0;

  // Token burn calculation
  let tokensPerHour: number | undefined;
  if (oldest.thirtyDayTokens !== undefined && newest.thirtyDayTokens !== undefined) {
    const deltaTokens = newest.thirtyDayTokens - oldest.thirtyDayTokens;
    if (deltaTokens > 0) {
      tokensPerHour = Math.round((deltaTokens / elapsedMinutes) * 60);
    }
  }

  // Calculate projected minutes to exhaustion (100% quota limit)
  let minutesToExhaustion: number | undefined;
  let isExhaustionBeforeReset = false;

  if (percentagePerHour > 0 && currentPercentage < 100) {
    const remainingPct = 100 - currentPercentage;
    const hoursToExhaust = remainingPct / percentagePerHour;
    minutesToExhaustion = Math.max(1, Math.round(hoursToExhaust * 60));

    if (nextResetTime !== undefined && nextResetTime > now) {
      const minutesUntilReset = Math.max(0, Math.round((nextResetTime - now) / (60 * 1000)));
      isExhaustionBeforeReset = minutesToExhaustion < minutesUntilReset;
    } else {
      isExhaustionBeforeReset = true;
    }
  }

  // Status classification
  let status: BurnRateStatus = 'idle';
  if (percentagePerHour >= 25 || (minutesToExhaustion !== undefined && minutesToExhaustion <= 25)) {
    status = 'critical';
  } else if (percentagePerHour >= 12 || (minutesToExhaustion !== undefined && minutesToExhaustion <= 60)) {
    status = 'heavy';
  } else if (percentagePerHour >= 3) {
    status = 'moderate';
  }

  // Formatted string summary
  let formattedSummary: string;
  if (status === 'idle') {
    formattedSummary = 'Burn: Stable / Idle';
  } else if (minutesToExhaustion !== undefined) {
    const hours = Math.floor(minutesToExhaustion / 60);
    const mins = minutesToExhaustion % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    if (isExhaustionBeforeReset) {
      formattedSummary = `🔥 Burn: +${percentagePerHour.toFixed(1)}%/hr • Exhaustion: ~${timeStr}`;
    } else {
      formattedSummary = `🔥 Burn: +${percentagePerHour.toFixed(1)}%/hr • Quota resets before limit`;
    }
  } else {
    formattedSummary = `🔥 Burn: +${percentagePerHour.toFixed(1)}%/hr`;
  }

  return {
    percentagePerHour,
    ...(tokensPerHour !== undefined ? { tokensPerHour } : {}),
    status,
    ...(minutesToExhaustion !== undefined ? { minutesToExhaustion } : {}),
    isExhaustionBeforeReset,
    formattedSummary
  };
}
