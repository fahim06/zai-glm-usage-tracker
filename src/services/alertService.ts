import * as vscode from 'vscode';
import { UsageState, QuotaWindow } from '../types/domain';
import { SettingsManager, ExtensionSettings } from '../config/settings';
import { formatCountdown } from '../utils/formatters';
import { COMMAND_SHOW_MENU } from '../config/constants';
import { Logger } from '../utils/logger';

import { BurnRateEstimate } from '../utils/burnRate';

export interface AlertWindowRecord {
  lastResetTime?: number | undefined;
  lastPercentage: number;
  firedThresholds: Set<number>;
}

export type NotificationHandler = (
  message: string,
  ...items: string[]
) => Thenable<string | undefined>;

export class AlertService implements vscode.Disposable {
  private readonly windowStates = new Map<string, AlertWindowRecord>();
  private readonly firedExhaustionAlerts = new Set<string>();
  private notificationSender: NotificationHandler;
  private readonly getSettings: () => ExtensionSettings;

  constructor(
    customSender?: NotificationHandler,
    customSettings?: () => ExtensionSettings
  ) {
    this.notificationSender = customSender ?? (
      (msg, ...items) => vscode.window.showWarningMessage(msg, ...items)
    );
    this.getSettings = customSettings ?? (() => SettingsManager.getSettings());
  }

  /**
   * Evaluates the latest usage state and fires notifications if any configured thresholds are crossed.
   */
  public async checkUsage(state: UsageState, burnRate?: BurnRateEstimate | undefined): Promise<void> {
    if (state.status !== 'connected' || !state.metrics) {
      return;
    }

    const settings = this.getSettings();
    if (!settings.notificationsEnabled) {
      return;
    }

    const thresholds = settings.notificationThresholds;
    if (!thresholds || thresholds.length === 0) {
      return;
    }

    const accountId = state.accountId ?? 'default';
    const accountLabel = state.accountLabel;

    // 1. Evaluate 5-Hour Quota
    await this.evaluateQuotaWindow(
      accountId,
      accountLabel,
      state.metrics.fiveHourQuota,
      thresholds
    );

    // 2. Evaluate Rapid Exhaustion Risk
    if (
      burnRate &&
      burnRate.status === 'critical' &&
      burnRate.isExhaustionBeforeReset &&
      burnRate.minutesToExhaustion !== undefined &&
      burnRate.minutesToExhaustion <= 20
    ) {
      await this.evaluateExhaustionRisk(accountId, accountLabel, burnRate);
    }
  }

  private async evaluateExhaustionRisk(
    accountId: string,
    accountLabel: string | undefined,
    burnRate: BurnRateEstimate
  ): Promise<void> {
    const exhaustionKey = `${accountId}:${burnRate.minutesToExhaustion}`;
    if (this.firedExhaustionAlerts.has(exhaustionKey)) {
      return;
    }

    this.firedExhaustionAlerts.add(exhaustionKey);
    const accountBadge = accountLabel ? `[${accountLabel}] ` : '';
    const message = `Z.ai GLM Critical Warning: ${accountBadge}5-Hour quota projected to deplete in ~${burnRate.minutesToExhaustion}m at current burn (+${burnRate.percentagePerHour.toFixed(1)}%/hr).`;

    Logger.warn(`Triggering exhaustion alert notification: "${message}"`);
    const action = await this.notificationSender(message, 'Show Menu', 'Mute Alerts');
    if (action === 'Show Menu') {
      await vscode.commands.executeCommand(COMMAND_SHOW_MENU);
    } else if (action === 'Mute Alerts') {
      await vscode.workspace.getConfiguration('zaiUsage').update('notifications.enabled', false, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Z.ai GLM quota notifications have been muted.');
    }
  }

  private async evaluateQuotaWindow(
    accountId: string,
    accountLabel: string | undefined,
    quota: QuotaWindow,
    thresholds: number[]
  ): Promise<void> {
    const key = `${accountId}:${quota.unit}`;
    let record = this.windowStates.get(key);

    if (!record) {
      record = {
        lastResetTime: quota.nextResetTime,
        lastPercentage: quota.percentage,
        firedThresholds: new Set<number>()
      };
      this.windowStates.set(key, record);
    } else {
      // Detect reset cycle:
      // Case A: nextResetTime changed to a later time
      const resetTimeChanged =
        quota.nextResetTime !== undefined &&
        record.lastResetTime !== undefined &&
        quota.nextResetTime > record.lastResetTime;

      // Case B: percentage dropped significantly (e.g. rolled over from >=80% to <50%)
      const percentageDropped = quota.percentage < record.lastPercentage - 20;

      if (resetTimeChanged || percentageDropped) {
        Logger.info(`AlertService: Quota reset detected for ${quota.name} (${key}). Resetting alert thresholds.`);
        record.firedThresholds.clear();
      }

      record.lastResetTime = quota.nextResetTime;
      record.lastPercentage = quota.percentage;
    }

    // Determine newly crossed thresholds
    const crossedThresholds: number[] = [];
    for (const threshold of thresholds) {
      if (quota.percentage >= threshold && !record.firedThresholds.has(threshold)) {
        crossedThresholds.push(threshold);
        record.firedThresholds.add(threshold);
      }
    }

    if (crossedThresholds.length === 0) {
      return;
    }

    // Fire alert for the highest crossed threshold to prevent multiple stacked alerts
    const highestCrossed = Math.max(...crossedThresholds);
    await this.fireAlert(accountLabel, quota, highestCrossed);
  }

  private async fireAlert(
    accountLabel: string | undefined,
    quota: QuotaWindow,
    threshold: number
  ): Promise<void> {
    const accountBadge = accountLabel ? `[${accountLabel}] ` : '';
    const resetCountdown = formatCountdown(quota.nextResetTime);
    const resetInfo = resetCountdown !== 'unknown' ? ` Resets in ${resetCountdown}.` : '';

    const message = `Z.ai GLM Alert: ${accountBadge}${quota.name} reached ${quota.percentage}% (threshold: ${threshold}%).${resetInfo}`;

    Logger.warn(`Triggering quota alert notification: "${message}"`);

    const selected = await this.notificationSender(message, 'Show Menu', 'Mute Alerts');

    if (selected === 'Show Menu') {
      await vscode.commands.executeCommand(COMMAND_SHOW_MENU);
    } else if (selected === 'Mute Alerts') {
      await vscode.workspace
        .getConfiguration('zaiUsage')
        .update('notifications.enabled', false, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        'Z.ai GLM usage alert notifications have been disabled. You can re-enable them in settings.'
      );
    }
  }

  /**
   * Resets all tracked alert states (e.g. on account change or full reset).
   */
  public reset(): void {
    this.windowStates.clear();
  }

  public dispose(): void {
    this.reset();
  }
}
