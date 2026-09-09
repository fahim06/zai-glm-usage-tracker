import * as vscode from 'vscode';
import { AccountManager } from './services/accountManager';
import { ApiClient } from './services/apiClient';
import { UsageService } from './services/usageService';
import { AlertService } from './services/alertService';
import { HistoryService } from './services/historyService';
import { StatusBarManager } from './ui/statusBarManager';
import { QuickPickMenu } from './ui/quickPickMenu';
import { registerCommands } from './commands';
import { Logger } from './utils/logger';

let accountManager: AccountManager | undefined;
let apiClient: ApiClient | undefined;
let usageService: UsageService | undefined;
let statusBarManager: StatusBarManager | undefined;
let alertService: AlertService | undefined;
let historyService: HistoryService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = Logger.initialize();
  context.subscriptions.push(outputChannel);
  Logger.info('Z.ai GLM Usage Tracker is activating...');

  // 1. Initialize core services
  accountManager = new AccountManager(context.secrets, context.globalState);
  apiClient = new ApiClient();
  statusBarManager = new StatusBarManager();
  alertService = new AlertService();
  historyService = new HistoryService(context.globalState);
  usageService = new UsageService(accountManager, apiClient);

  // 2. Wire event listeners
  context.subscriptions.push(
    accountManager,
    statusBarManager,
    alertService,
    historyService,
    usageService,
    usageService.onDidChangeUsage((state) => {
      let burnRate;
      if (state.status === 'connected' && state.metrics && state.accountId && historyService) {
        burnRate = historyService.getBurnRate(
          state.accountId,
          state.metrics.fiveHourQuota.percentage,
          state.metrics.fiveHourQuota.nextResetTime
        );
      }

      statusBarManager?.updateState(state, burnRate);
      historyService?.recordSnapshot(state).catch((err) => {
        Logger.error('HistoryService error recording snapshot:', err);
      });
      alertService?.checkUsage(state, burnRate).catch((err) => {
        Logger.error('AlertService error checking usage:', err);
      });
    })
  );

  // 3. Register commands
  registerCommands(context, {
    accountManager: accountManager,
    apiClient: apiClient,
    historyService: historyService,
    getCurrentMetrics: () => usageService?.getState().metrics,
    refreshHandler: async () => {
      statusBarManager?.setLoading(true);
      try {
        await usageService?.refresh();
      } finally {
        statusBarManager?.setLoading(false);
      }
    },
    showMenuHandler: async () => {
      if (!usageService) {
        return;
      }
      await QuickPickMenu.show(
        usageService.getState(),
        async () => {
          statusBarManager?.setLoading(true);
          try {
            await usageService?.refresh();
          } finally {
            statusBarManager?.setLoading(false);
          }
        }
      );
    }
  });

  // 4. Initial load
  usageService.initialize().catch((err) => {
    Logger.error('Initial refresh failed:', err);
  });

  Logger.info('Z.ai GLM Usage Tracker activated successfully.');
}

export function deactivate(): void {
  Logger.warn('Z.ai GLM Usage Tracker is deactivating (extension host stopping or debug session ended).');
}
