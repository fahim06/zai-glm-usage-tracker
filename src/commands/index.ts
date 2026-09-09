import * as vscode from 'vscode';
import {
  COMMAND_SET_API_KEY,
  COMMAND_CLEAR_API_KEY,
  COMMAND_REFRESH,
  COMMAND_SHOW_MENU,
  COMMAND_SWITCH_ACCOUNT,
  COMMAND_ADD_ACCOUNT,
  COMMAND_REMOVE_ACCOUNT,
  COMMAND_OPEN_HISTORY
} from '../config/constants';
import { AccountManager } from '../services/accountManager';
import { ApiClient } from '../services/apiClient';
import { HistoryService } from '../services/historyService';
import { HistoryPanel } from '../ui/historyPanel';
import { setApiKeyCommand } from './setApiKeyCommand';
import { clearApiKeyCommand } from './clearApiKeyCommand';
import {
  switchAccountCommand,
  addAccountCommand,
  removeAccountCommand
} from './accountCommands';
import { registerReportCommands } from './reportCommands';

export interface CommandContext {
  accountManager: AccountManager;
  apiClient: ApiClient;
  historyService: HistoryService;
  refreshHandler?: () => Promise<void>;
  showMenuHandler?: () => Promise<void>;
  getCurrentMetrics?: () => import('../types/domain').UsageMetrics | undefined;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SET_API_KEY, async () => {
      await setApiKeyCommand(deps.accountManager, deps.apiClient, deps.refreshHandler);
    }),

    vscode.commands.registerCommand(COMMAND_CLEAR_API_KEY, async () => {
      await clearApiKeyCommand(deps.accountManager, deps.refreshHandler);
    }),

    vscode.commands.registerCommand(COMMAND_SWITCH_ACCOUNT, async () => {
      await switchAccountCommand(deps.accountManager, deps.apiClient);
    }),

    vscode.commands.registerCommand(COMMAND_ADD_ACCOUNT, async () => {
      await addAccountCommand(deps.accountManager, deps.apiClient);
    }),

    vscode.commands.registerCommand(COMMAND_REMOVE_ACCOUNT, async () => {
      await removeAccountCommand(deps.accountManager);
    }),

    vscode.commands.registerCommand(COMMAND_REFRESH, async () => {
      if (deps.refreshHandler) {
        await deps.refreshHandler();
      } else {
        vscode.window.showInformationMessage('Z.ai usage service not initialized.');
      }
    }),

    vscode.commands.registerCommand(COMMAND_SHOW_MENU, async () => {
      if (deps.showMenuHandler) {
        await deps.showMenuHandler();
      } else {
        await vscode.commands.executeCommand(COMMAND_SET_API_KEY);
      }
    }),

    vscode.commands.registerCommand(COMMAND_OPEN_HISTORY, () => {
      HistoryPanel.createOrShow(
        deps.historyService,
        deps.accountManager,
        async () => {
          if (deps.refreshHandler) {
            await deps.refreshHandler();
          }
        },
        deps.getCurrentMetrics
      );
    })
  );

  registerReportCommands(context, {
    accountManager: deps.accountManager,
    historyService: deps.historyService
  });
}
