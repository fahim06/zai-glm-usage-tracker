import * as vscode from 'vscode';
import {
  DEFAULT_API_ENDPOINT,
  DEFAULT_REFRESH_INTERVAL_SEC,
  MIN_REFRESH_INTERVAL_SEC
} from './constants';
import { PlanTier } from '../types/domain';

export interface ExtensionSettings {
  apiEndpoint: string;
  refreshInterval: number;
  planTier: PlanTier;
  notificationsEnabled: boolean;
  notificationThresholds: number[];
  historyRetentionDays: number;
  smartPollingEnabled: boolean;
  smartPollingIdleTimeoutMinutes: number;
  smartPollingIdleInterval: number;
  statusBarShowResetTime: boolean;
}

export class SettingsManager {
  private static readonly SECTION = 'zaiUsage';

  public static getSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(this.SECTION);
    const rawEndpoint = config.get<string>('apiEndpoint', DEFAULT_API_ENDPOINT);
    const endpoint = rawEndpoint.trim().replace(/\/+$/, '') || DEFAULT_API_ENDPOINT;

    const rawInterval = config.get<number>('refreshInterval', DEFAULT_REFRESH_INTERVAL_SEC);
    const refreshInterval = Math.max(MIN_REFRESH_INTERVAL_SEC, rawInterval);

    const planTier = config.get<PlanTier>('planTier', 'auto');

    const notificationsEnabled = config.get<boolean>('notifications.enabled', true);
    const rawThresholds = config.get<number[]>('notifications.thresholds', [80, 95]);
    const notificationThresholds = Array.isArray(rawThresholds)
      ? rawThresholds
          .filter((t): t is number => typeof t === 'number' && !isNaN(t) && t > 0 && t <= 100)
          .sort((a, b) => a - b)
      : [80, 95];

    const rawRetention = config.get<number>('history.retentionDays', 30);
    const historyRetentionDays = Math.min(90, Math.max(1, rawRetention || 30));

    const smartPollingEnabled = config.get<boolean>('smartPolling.enabled', true);
    const rawIdleTimeout = config.get<number>('smartPolling.idleTimeoutMinutes', 5);
    const smartPollingIdleTimeoutMinutes = Math.min(60, Math.max(1, rawIdleTimeout || 5));

    const rawIdleInterval = config.get<number>('smartPolling.idleInterval', 300);
    const smartPollingIdleInterval = Math.min(1800, Math.max(60, rawIdleInterval || 300));

    const statusBarShowResetTime = config.get<boolean>('statusBar.showResetTime', true);

    return {
      apiEndpoint: endpoint,
      refreshInterval,
      planTier,
      notificationsEnabled,
      notificationThresholds: notificationThresholds.length > 0 ? notificationThresholds : [80, 95],
      historyRetentionDays,
      smartPollingEnabled,
      smartPollingIdleTimeoutMinutes,
      smartPollingIdleInterval,
      statusBarShowResetTime
    };
  }
}
