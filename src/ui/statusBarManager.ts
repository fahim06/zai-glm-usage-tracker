import * as vscode from 'vscode';
import { COMMAND_SET_API_KEY, COMMAND_SHOW_MENU } from '../config/constants';
import { UsageState } from '../types/domain';
import { TooltipBuilder } from './tooltipBuilder';
import { Logger } from '../utils/logger';
import { SettingsManager } from '../config/settings';

import { formatCountdown } from '../utils/formatters';
import { BurnRateEstimate } from '../utils/burnRate';

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private isLoading: boolean = false;
  private currentState: UsageState = { status: 'unconfigured' };
  private currentBurnRate?: BurnRateEstimate | undefined;
  private countdownTicker?: NodeJS.Timeout | undefined;

  constructor() {
    // Priority 1000 ensures high visibility on the right of the status bar
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.statusBarItem.name = 'Z.ai GLM Usage Tracker';

    // Re-render immediately if status bar settings change
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('zaiUsage.statusBar.showResetTime')) {
          this.render();
        }
      })
    );

    Logger.info('Initializing StatusBarManager and rendering initial item.');
    this.render();
    this.statusBarItem.show();
  }

  public updateState(state: UsageState, burnRate?: BurnRateEstimate | undefined): void {
    Logger.info(`StatusBarManager received state update: status="${state.status}"`);
    this.currentState = state;
    this.currentBurnRate = burnRate;

    if (state.status === 'connected' && state.metrics?.fiveHourQuota.nextResetTime) {
      this.startCountdownTicker();
    } else {
      this.stopCountdownTicker();
    }

    this.render();
  }

  public setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.render();
  }

  public setTooltip(tooltip: vscode.MarkdownString | string): void {
    this.statusBarItem.tooltip = tooltip;
  }

  private render(): void {
    try {
      const { status, metrics } = this.currentState;

      // Dynamically build rich Markdown tooltip
      try {
        this.statusBarItem.tooltip = TooltipBuilder.build(this.currentState, this.currentBurnRate);
      } catch (err) {
        Logger.error('Failed to build rich tooltip. Falling back to plain text.', err);
        this.statusBarItem.tooltip = 'Z.ai GLM Usage Tracker (Click for menu)';
      }

      if (this.isLoading && !metrics) {
        this.statusBarItem.text = '$(sync~spin) Z.ai: Connecting...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        this.statusBarItem.command = COMMAND_SHOW_MENU;
        this.statusBarItem.show();
        return;
      }

      const accountBadge = this.currentState.accountLabel ? `[${this.currentState.accountLabel}] ` : '';

      switch (status) {
        case 'unconfigured': {
          this.statusBarItem.text = '$(key) Z.ai: Set Key';
          this.statusBarItem.backgroundColor = undefined;
          this.statusBarItem.color = undefined;
          this.statusBarItem.command = COMMAND_SET_API_KEY;
          break;
        }

        case 'connected': {
          if (!metrics) {
            this.statusBarItem.text = `$(zap) ${accountBadge}Z.ai: Connected`;
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
            this.statusBarItem.command = COMMAND_SHOW_MENU;
            break;
          }

          const settings = SettingsManager.getSettings();
          const spinIcon = this.isLoading ? '$(sync~spin) ' : '';
          const fiveHourPct = metrics.fiveHourQuota.percentage;

          const showResetTime = settings.statusBarShowResetTime;
          let fiveHourResetSuffix = '';
          if (showResetTime && metrics.fiveHourQuota.nextResetTime) {
            const countdown = formatCountdown(metrics.fiveHourQuota.nextResetTime);
            if (countdown !== 'unknown') {
              fiveHourResetSuffix = ` (${countdown})`;
            }
          }

          const label = `5h: ${fiveHourPct}%${fiveHourResetSuffix}`;

          // Dynamic severity icon and color shift based on 5-hour quota
          const maxPercentage = fiveHourPct;

          let stateIcon = '$(zap) ';
          if (maxPercentage >= 95) {
            stateIcon = '$(error) ';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
          } else if (maxPercentage >= 80) {
            stateIcon = '$(warning) ';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
          } else {
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
          }

          this.statusBarItem.text = `${spinIcon}${stateIcon}${accountBadge}${label}`;
          this.statusBarItem.command = COMMAND_SHOW_MENU;
          break;
        }

        case 'degraded': {
          const spinIcon = this.isLoading ? '$(sync~spin) ' : '';
          if (metrics) {
            const settings = SettingsManager.getSettings();
            const fiveHourPct = metrics.fiveHourQuota.percentage;

            const showResetTime = settings.statusBarShowResetTime;
            let fiveHourResetSuffix = '';
            if (showResetTime && metrics.fiveHourQuota.nextResetTime) {
              const countdown = formatCountdown(metrics.fiveHourQuota.nextResetTime);
              if (countdown !== 'unknown') {
                fiveHourResetSuffix = ` (${countdown})`;
              }
            }

            const label = `5h: ${fiveHourPct}%${fiveHourResetSuffix}`;
            this.statusBarItem.text = `${spinIcon}$(warning) ${accountBadge}${label} (Stale)`;
          } else {
            this.statusBarItem.text = `${spinIcon}$(warning) ${accountBadge}Z.ai: Stale`;
          }
          this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
          this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
          this.statusBarItem.command = COMMAND_SHOW_MENU;
          break;
        }

        case 'error': {
          this.statusBarItem.text = `$(error) ${accountBadge}Z.ai: Error`;
          this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
          this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
          this.statusBarItem.command = COMMAND_SHOW_MENU;
          break;
        }
      }

      // Always guarantee status bar visibility after render
      this.statusBarItem.show();
      Logger.info(`Status bar rendered: text="${this.statusBarItem.text}", status="${status}"`);
    } catch (renderError) {
      Logger.error('Unexpected error in StatusBarManager.render', renderError);
      this.statusBarItem.text = '$(key) Z.ai: Setup Key';
      this.statusBarItem.command = COMMAND_SET_API_KEY;
      this.statusBarItem.show();
    }
  }

  private startCountdownTicker(): void {
    if (this.countdownTicker) {
      return;
    }
    this.countdownTicker = setInterval(() => {
      if (this.currentState.status === 'connected' && this.currentState.metrics) {
        this.render();
      }
    }, 1000);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker);
      this.countdownTicker = undefined;
    }
  }

  public dispose(): void {
    Logger.info('StatusBarManager.dispose() called.');
    this.stopCountdownTicker();
    this.disposables.forEach((d) => d.dispose());
    this.statusBarItem.dispose();
  }
}
