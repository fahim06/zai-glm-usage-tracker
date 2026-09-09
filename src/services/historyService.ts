import * as vscode from 'vscode';
import { UsageSnapshot, UsageState } from '../types/domain';
import { STORAGE_PREFIX_HISTORY } from '../config/constants';
import { SettingsManager, ExtensionSettings } from '../config/settings';
import { StorageLike } from './accountManager';
import { calculateBurnRate, BurnRateEstimate } from '../utils/burnRate';
import { Logger } from '../utils/logger';

export type TimeframePeriod = 'auto' | '5h' | '24h' | '7d' | '30d';

export class HistoryService implements vscode.Disposable {
  private readonly _onDidChangeHistory = new vscode.EventEmitter<{ accountId: string; snapshots: UsageSnapshot[] }>();
  public readonly onDidChangeHistory: vscode.Event<{ accountId: string; snapshots: UsageSnapshot[] }> = this._onDidChangeHistory.event;

  private readonly getSettings: () => ExtensionSettings;

  constructor(
    private readonly globalState: StorageLike,
    customSettings?: () => ExtensionSettings
  ) {
    this.getSettings = customSettings ?? (() => SettingsManager.getSettings());
  }

  /**
   * Records a snapshot of the latest usage state for the active account.
   */
  public async recordSnapshot(state: UsageState, now: number = Date.now()): Promise<boolean> {
    if (state.status !== 'connected' || !state.metrics) {
      return false;
    }

    const accountId = state.accountId ?? 'default';
    const metrics = state.metrics;
    const existing = this.getSnapshots(accountId);

    // Anti-duplication: Skip snapshot if unchanged and last record was within 5 minutes
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (last) {
        const timeDiff = now - last.timestamp;
        const sameFiveHour = last.fiveHourPercentage === metrics.fiveHourQuota.percentage;
        const sameTokens = last.thirtyDayTokens === metrics.thirtyDayTokens;

        if (timeDiff < 5 * 60 * 1000 && sameFiveHour && sameTokens) {
          return false;
        }
      }
    }

    const newSnapshot: UsageSnapshot = {
      timestamp: now,
      accountId,
      fiveHourPercentage: metrics.fiveHourQuota.percentage,
      ...(metrics.fiveHourQuota.used !== undefined ? { fiveHourUsed: metrics.fiveHourQuota.used } : {}),
      ...(metrics.thirtyDayTokens !== undefined ? { thirtyDayTokens: metrics.thirtyDayTokens } : {}),
      ...(metrics.thirtyDayPrompts !== undefined ? { thirtyDayPrompts: metrics.thirtyDayPrompts } : {})
    };

    const retentionDays = this.getSettings().historyRetentionDays;
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

    // Append and prune older than retentionDays or max 1,000 snapshots
    const pruned = [...existing, newSnapshot]
      .filter((s) => s.timestamp >= cutoff)
      .slice(-1000);

    const storageKey = `${STORAGE_PREFIX_HISTORY}${accountId}`;
    await this.globalState.update(storageKey, pruned);

    Logger.info(`HistoryService: Recorded usage snapshot for account "${accountId}" (Total snapshots: ${pruned.length}).`);
    this._onDidChangeHistory.fire({ accountId, snapshots: pruned });

    return true;
  }

  /**
   * Retrieves snapshots for a specific account, optionally filtered by timeframe.
   */
  public getSnapshots(accountId: string, timeframe?: TimeframePeriod, now: number = Date.now()): UsageSnapshot[] {
    const storageKey = `${STORAGE_PREFIX_HISTORY}${accountId}`;
    const raw = this.globalState.get<UsageSnapshot[]>(storageKey, []);
    const snapshots = Array.isArray(raw) ? raw : [];

    if (!timeframe || timeframe === 'auto') {
      return snapshots;
    }

    let cutoffMs: number;
    switch (timeframe) {
      case '5h':
        cutoffMs = now - 5 * 60 * 60 * 1000;
        break;
      case '24h':
        cutoffMs = now - 24 * 60 * 60 * 1000;
        break;
      case '7d':
        cutoffMs = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
      default:
        cutoffMs = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    return snapshots.filter((s) => s.timestamp >= cutoffMs);
  }

  /**
   * Calculates the current burn rate and time to exhaustion for a specific account.
   */
  public getBurnRate(accountId: string, currentPercentage: number, nextResetTime?: number, now?: number): BurnRateEstimate {
    const snapshots = this.getSnapshots(accountId);
    return calculateBurnRate(snapshots, currentPercentage, nextResetTime, now);
  }

  /**
   * Clears historical snapshots for a specific account.
   */
  public async clearHistory(accountId: string): Promise<void> {
    const storageKey = `${STORAGE_PREFIX_HISTORY}${accountId}`;
    await this.globalState.update(storageKey, []);
    Logger.info(`HistoryService: Cleared history for account "${accountId}".`);
    this._onDidChangeHistory.fire({ accountId, snapshots: [] });
  }

  public dispose(): void {
    this._onDidChangeHistory.dispose();
  }
}
