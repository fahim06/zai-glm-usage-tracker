import * as vscode from 'vscode';
import { AccountManager } from './accountManager';
import { ApiClient, ApiClientError } from './apiClient';
import { ActivityTracker } from './activityTracker';
import { UsageNormalizer } from './usageNormalizer';
import { SettingsManager } from '../config/settings';
import { UsageState, UsageMetrics, AccountInfo } from '../types/domain';
import { calculateBackoffDelay } from '../utils/backoff';
import { Logger } from '../utils/logger';

export class UsageService implements vscode.Disposable {
  private readonly _onDidChangeUsage = new vscode.EventEmitter<UsageState>();
  public readonly onDidChangeUsage: vscode.Event<UsageState> = this._onDidChangeUsage.event;

  private currentState: UsageState = { status: 'unconfigured' };
  private readonly cachedMetrics = new Map<string, UsageMetrics>();
  private isRefreshing: boolean = false;
  private consecutiveFailures: number = 0;
  private isPaused: boolean = false;
  private pollTimer?: NodeJS.Timeout | undefined;
  private lastSuccessfulRefreshTime: number = 0;

  private readonly activityTracker: ActivityTracker;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly accountManager: AccountManager,
    private readonly apiClient: ApiClient,
    customActivityTracker?: ActivityTracker
  ) {
    this.activityTracker = customActivityTracker ?? new ActivityTracker();
    this.disposables.push(this.activityTracker);

    // 1. Listen for active account changes or key modifications
    this.disposables.push(
      this.accountManager.onDidChangeActiveAccount(async (account) => {
        await this.handleActiveAccountChanged(account);
      })
    );

    // 2. Listen for user activity/idle state changes
    this.disposables.push(
      this.activityTracker.onDidChangeActivityState(async ({ isIdle }) => {
        if (!isIdle) {
          const settings = SettingsManager.getSettings();
          const elapsedMs = Date.now() - this.lastSuccessfulRefreshTime;
          if (elapsedMs >= settings.refreshInterval * 1000) {
            Logger.info('UsageService: Resuming from idle with stale data. Triggering immediate refresh.');
            await this.refresh();
          } else {
            this.scheduleNextPoll();
          }
        } else {
          Logger.info('UsageService: Entering idle mode. Throttling polling interval.');
          this.scheduleNextPoll();
        }
      })
    );

    // 3. Listen for setting updates (e.g. interval or endpoint changes)
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('zaiUsage')) {
          await this.handleConfigurationChanged();
        }
      })
    );
  }

  public getState(): UsageState {
    return this.currentState;
  }

  public async initialize(): Promise<void> {
    await this.accountManager.initialize();
    await this.refresh();
  }

  /**
   * Refreshes usage metrics for the active account from the Z.ai API.
   * Resets and reschedules the automatic polling timer.
   */
  public async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.cancelPollTimer();
    this.isRefreshing = true;

    const activeAccount = this.accountManager.getActiveAccount();

    try {
      Logger.info('UsageService.refresh() starting...');
      const apiKey = await this.accountManager.getActiveApiKey();

      if (!apiKey || !activeAccount) {
        Logger.info('UsageService: No active account or API key found. State set to unconfigured.');
        this.currentState = { status: 'unconfigured' };
        this.isPaused = true;
        this._onDidChangeUsage.fire(this.currentState);
        return;
      }

      const settings = SettingsManager.getSettings();
      Logger.info(`UsageService: Fetching quota limits for account "${activeAccount.label}" from endpoint "${settings.apiEndpoint}"...`);

      // Query real-time quota limit
      const quotaData = await this.apiClient.fetchQuotaLimits(apiKey, settings.apiEndpoint);

      // Query 30-day model usage in parallel
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const formatDateTime = (d: Date): string => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      const startDateTime = new Date(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate(), 0, 0, 0);
      const endDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      let modelUsageData;
      try {
        modelUsageData = await this.apiClient.fetchModelUsage(
          apiKey,
          formatDateTime(startDateTime),
          formatDateTime(endDateTime),
          settings.apiEndpoint
        );
      } catch (err) {
        Logger.warn('Model usage fetch failed (non-fatal):', err);
      }

      const metrics = UsageNormalizer.normalize(quotaData, modelUsageData, settings.planTier);
      this.cachedMetrics.set(activeAccount.id, metrics);
      this.consecutiveFailures = 0;
      this.isPaused = false;

      this.currentState = {
        status: 'connected',
        metrics,
        accountId: activeAccount.id,
        accountLabel: activeAccount.label,
        lastAttempt: new Date()
      };

      this.lastSuccessfulRefreshTime = Date.now();
      Logger.info(`UsageService: Connected successfully. 5-hour quota: ${metrics.fiveHourQuota.percentage}%`);
      this._onDidChangeUsage.fire(this.currentState);
    } catch (err) {
      Logger.error('UsageService.refresh() failed:', err);
      const isAuthError = err instanceof ApiClientError && err.isAuthError;
      const message = err instanceof Error ? err.message : String(err);

      if (isAuthError) {
        this.isPaused = true;
        this.consecutiveFailures = 0;
        this.currentState = {
          status: 'error',
          errorMessage: 'Invalid API key. Please update your key.',
          accountId: activeAccount?.id,
          accountLabel: activeAccount?.label,
          lastAttempt: new Date()
        };
      } else {
        this.consecutiveFailures++;
        const cached = activeAccount ? this.cachedMetrics.get(activeAccount.id) : undefined;
        if (cached) {
          this.currentState = {
            status: 'degraded',
            metrics: cached,
            errorMessage: message,
            accountId: activeAccount?.id,
            accountLabel: activeAccount?.label,
            lastAttempt: new Date()
          };
        } else {
          this.currentState = {
            status: 'error',
            errorMessage: message,
            accountId: activeAccount?.id,
            accountLabel: activeAccount?.label,
            lastAttempt: new Date()
          };
        }
      }

      this._onDidChangeUsage.fire(this.currentState);
    } finally {
      this.isRefreshing = false;
      this.scheduleNextPoll();
    }
  }

  private scheduleNextPoll(): void {
    this.cancelPollTimer();

    if (this.isPaused) {
      return;
    }

    const settings = SettingsManager.getSettings();
    const isIdle = this.activityTracker.isIdle;
    const baseInterval = isIdle ? settings.smartPollingIdleInterval : settings.refreshInterval;
    const delayMs = calculateBackoffDelay(baseInterval, this.consecutiveFailures);

    this.pollTimer = setTimeout(async () => {
      await this.refresh();
    }, delayMs);
  }

  private cancelPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async handleActiveAccountChanged(account: AccountInfo | undefined): Promise<void> {
    this.consecutiveFailures = 0;
    this.isPaused = false;

    if (!account) {
      this.cancelPollTimer();
      this.currentState = { status: 'unconfigured' };
      this.isPaused = true;
      this._onDidChangeUsage.fire(this.currentState);
      return;
    }

    // Immediately display cached metrics for this account if available
    const cached = this.cachedMetrics.get(account.id);
    if (cached) {
      this.currentState = {
        status: 'connected',
        metrics: cached,
        accountId: account.id,
        accountLabel: account.label,
        lastAttempt: new Date()
      };
      this._onDidChangeUsage.fire(this.currentState);
    }

    // Trigger fresh pull in background
    await this.refresh();
  }

  private async handleConfigurationChanged(): Promise<void> {
    this.consecutiveFailures = 0;
    this.isPaused = false;
    await this.refresh();
  }

  public dispose(): void {
    this.cancelPollTimer();
    this._onDidChangeUsage.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
