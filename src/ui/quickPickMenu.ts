import type * as vscode from 'vscode';
import { UsageState } from '../types/domain';
import { formatTokens, formatCountdown, renderProgressBar } from '../utils/formatters';
import {
  COMMAND_SET_API_KEY,
  COMMAND_CLEAR_API_KEY,
  COMMAND_SWITCH_ACCOUNT,
  COMMAND_OPEN_HISTORY,
  COMMAND_EXPORT_REPORT
} from '../config/constants';

export type QuickPickActionType =
  | 'copy_summary'
  | 'refresh'
  | 'settings'
  | 'update_key'
  | 'clear_key'
  | 'open_dashboard'
  | 'switch_account'
  | 'open_history'
  | 'export_report';

export interface UsageQuickPickItem extends vscode.QuickPickItem {
  actionType?: QuickPickActionType;
  copyText?: string;
}

// Matches vscode.QuickPickItemKind.Separator (-1)
const SEPARATOR_KIND = -1;

/**
 * Builds the list of QuickPick items based on the current UsageState.
 * Can be tested in isolation without loading the VS Code runtime.
 */
export function buildQuickPickItems(state: UsageState, now: number = Date.now()): UsageQuickPickItem[] {
  const items: UsageQuickPickItem[] = [];

  const metrics = state.metrics;

  if (metrics) {
    // 1. Quota Breakdown Section
    items.push({
      label: `GLM Usage Breakdown [${metrics.planTier.toUpperCase()}]`,
      kind: SEPARATOR_KIND
    });

    // 5-Hour Limit
    const fiveHour = metrics.fiveHourQuota;
    const fiveHourRemaining = Math.max(0, 100 - fiveHour.percentage);
    const fiveHourReset = formatCountdown(fiveHour.nextResetTime, now);
    const fiveHourBar = renderProgressBar(fiveHour.percentage, 10);
    const fiveHourUsed = fiveHour.used !== undefined ? `Used: ${formatTokens(fiveHour.used)} • ` : '';

    items.push({
      label: `$(dashboard) 5-Hour Quota: ${fiveHour.percentage}% used`,
      description: fiveHourBar,
      detail: `${fiveHourUsed}${fiveHourRemaining}% remaining • Resets in ${fiveHourReset} (Click to copy)`,
      actionType: 'copy_summary',
      copyText: `Z.ai GLM 5-Hour Quota: ${fiveHour.percentage}% used (${fiveHourRemaining}% remaining), resets in ${fiveHourReset}`
    });

    // 30-Day Usage (if available)
    if (metrics.thirtyDayTokens !== undefined || metrics.thirtyDayPrompts !== undefined) {
      const tokenStr = metrics.thirtyDayTokens !== undefined ? `Tokens: ${formatTokens(metrics.thirtyDayTokens)}` : '';
      const promptStr = metrics.thirtyDayPrompts !== undefined ? `Prompts: ${metrics.thirtyDayPrompts.toLocaleString()}` : '';
      const detailStr = [tokenStr, promptStr].filter(Boolean).join(' • ');

      items.push({
        label: '$(graph) 30-Day Activity',
        detail: detailStr,
        actionType: 'copy_summary',
        copyText: `Z.ai GLM 30-Day Activity: ${detailStr}`
      });
    }
  } else if (state.status === 'unconfigured') {
    items.push({
      label: 'Setup Required',
      kind: SEPARATOR_KIND
    });
    items.push({
      label: '$(key) No API Key Configured',
      detail: 'Configure your Z.ai API key to start tracking token limits',
      actionType: 'update_key'
    });
  } else if (state.status === 'error') {
    items.push({
      label: 'Connection Error',
      kind: SEPARATOR_KIND
    });
    items.push({
      label: '$(error) Sync Failed',
      detail: state.errorMessage || 'Unable to reach Z.ai API servers',
      actionType: 'refresh'
    });
  }

  // 2. Actions Section
  items.push({
    label: 'Actions',
    kind: SEPARATOR_KIND
  });

  items.push({
    label: '$(graph) View Usage History & Charts',
    description: 'Open interactive timeline and quota charts in a webview panel',
    actionType: 'open_history'
  });

  items.push({
    label: '$(file-text) Export Usage & Expense Report',
    description: 'Export formatted Markdown or CSV reports for accounting and billing',
    actionType: 'export_report'
  });

  items.push({
    label: '$(arrow-swap) Switch Account',
    description: state.accountLabel ? `Active: ${state.accountLabel}` : 'Switch or add Z.ai accounts',
    actionType: 'switch_account'
  });

  items.push({
    label: '$(refresh) Refresh Now',
    description: 'Fetch latest quota and usage metrics from Z.ai',
    actionType: 'refresh'
  });

  items.push({
    label: '$(gear) Open Settings',
    description: 'Configure refresh interval, API endpoint, or plan tier',
    actionType: 'settings'
  });

  items.push({
    label: '$(key) Update API Key',
    description: 'Replace or validate your stored Z.ai API key',
    actionType: 'update_key'
  });

  items.push({
    label: '$(trash) Clear Stored API Key',
    description: 'Remove API key from secure SecretStorage',
    actionType: 'clear_key'
  });

  items.push({
    label: '$(globe) Open Z.ai Console',
    description: 'Manage API keys and account subscriptions on z.ai',
    actionType: 'open_dashboard'
  });

  return items;
}

export class QuickPickMenu {
  /**
   * Displays the interactive QuickPick menu.
   */
  public static async show(
    state: UsageState,
    onRefresh: () => Promise<void>
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const items = buildQuickPickItems(state);

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Z.ai GLM Usage Tracker',
      placeHolder: 'Select an action or click a usage summary to copy...',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected || !selected.actionType) {
      return;
    }

    switch (selected.actionType) {
      case 'copy_summary': {
        if (selected.copyText) {
          await vscode.env.clipboard.writeText(selected.copyText);
          vscode.window.showInformationMessage('Copied to clipboard: ' + selected.copyText);
        }
        break;
      }

      case 'open_history': {
        await vscode.commands.executeCommand(COMMAND_OPEN_HISTORY);
        break;
      }

      case 'export_report': {
        await vscode.commands.executeCommand(COMMAND_EXPORT_REPORT);
        break;
      }

      case 'switch_account': {
        await vscode.commands.executeCommand(COMMAND_SWITCH_ACCOUNT);
        break;
      }

      case 'refresh': {
        await onRefresh();
        break;
      }

      case 'settings': {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'zaiUsage');
        break;
      }

      case 'update_key': {
        await vscode.commands.executeCommand(COMMAND_SET_API_KEY);
        break;
      }

      case 'clear_key': {
        await vscode.commands.executeCommand(COMMAND_CLEAR_API_KEY);
        break;
      }

      case 'open_dashboard': {
        await vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey/apikey-list'));
        break;
      }
    }
  }
}
