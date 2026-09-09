import * as vscode from 'vscode';
import { AccountManager } from '../services/accountManager';
import { HistoryService } from '../services/historyService';
import { ReportGenerator, ReportTimeframe } from '../services/reportGenerator';
import { SettingsManager } from '../config/settings';
import { Logger } from '../utils/logger';

export interface ReportCommandDependencies {
  accountManager: AccountManager;
  historyService: HistoryService;
}

export function registerReportCommands(
  context: vscode.ExtensionContext,
  deps: ReportCommandDependencies
): void {
  const exportReportDisposable = vscode.commands.registerCommand(
    'zaiUsage.exportReport',
    async () => {
      try {
        await handleExportReport(deps);
      } catch (err) {
        Logger.error('Failed to export usage report:', err);
        vscode.window.showErrorMessage(`Failed to generate report: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  context.subscriptions.push(exportReportDisposable);
}

async function handleExportReport(deps: ReportCommandDependencies): Promise<void> {
  const accounts = deps.accountManager.getAccounts();
  const activeAccount = deps.accountManager.getActiveAccount();

  if (accounts.length === 0) {
    vscode.window.showInformationMessage('No Z.ai accounts configured. Please add an account first.');
    return;
  }

  // 1. Pick Account (if multiple)
  let targetAccount = activeAccount;
  if (accounts.length > 1) {
    const accountItems: (vscode.QuickPickItem & { accountId: string })[] = accounts.map((acc) => ({
      label: acc.label,
      accountId: acc.id,
      ...(acc.id === activeAccount?.id ? { description: '(Active)' } : {})
    }));

    const picked = await vscode.window.showQuickPick(accountItems, {
      placeHolder: 'Select account for the usage report'
    });
    if (!picked) {
      return;
    }
    targetAccount = accounts.find((a) => a.id === picked.accountId) ?? activeAccount;
  }

  if (!targetAccount) {
    return;
  }

  // 2. Pick Timeframe
  const timeframePick = await vscode.window.showQuickPick([
    { label: 'Last 7 Days', description: 'Recent 7-day trend', value: '7d' as ReportTimeframe },
    { label: 'Last 30 Days', description: 'Full monthly billing period', value: '30d' as ReportTimeframe },
    { label: 'All Available History', description: 'Complete snapshot archive', value: 'all' as ReportTimeframe }
  ], {
    placeHolder: 'Select reporting timeframe'
  });

  if (!timeframePick) {
    return;
  }

  // 3. Pick Format
  const formatPick = await vscode.window.showQuickPick([
    { label: 'Markdown (.md)', description: 'Human-readable summary with tables', ext: 'md', lang: 'markdown' },
    { label: 'CSV (.csv)', description: 'Spreadsheet-ready tabular dataset', ext: 'csv', lang: 'csv' }
  ], {
    placeHolder: 'Select export format'
  });

  if (!formatPick) {
    return;
  }

  // 4. Generate Content
  const snapshots = deps.historyService.getSnapshots(targetAccount.id);
  const settings = SettingsManager.getSettings();

  const reportContent = formatPick.ext === 'md'
    ? ReportGenerator.generateMarkdown(targetAccount.label, settings.planTier, snapshots, timeframePick.value)
    : ReportGenerator.generateCsv(targetAccount.label, settings.planTier, snapshots, timeframePick.value);

  // 5. Output Destination
  const destPick = await vscode.window.showQuickPick([
    { label: 'Open in Editor (Instant Preview)', value: 'preview' },
    { label: 'Save to File...', value: 'save' }
  ], {
    placeHolder: 'Choose how to export the report'
  });

  if (!destPick) {
    return;
  }

  if (destPick.value === 'preview') {
    const doc = await vscode.workspace.openTextDocument({
      content: reportContent,
      language: formatPick.lang
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    Logger.info(`Report exported to new editor tab (${formatPick.lang}).`);
  } else {
    const defaultUri = vscode.Uri.file(
      `zai-glm-report-${targetAccount.label.toLowerCase().replace(/\s+/g, '-')}-${timeframePick.value}.${formatPick.ext}`
    );
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: formatPick.ext === 'md' ? { 'Markdown': ['md'] } : { 'CSV': ['csv'] }
    });

    if (saveUri) {
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(reportContent, 'utf-8'));
      vscode.window.showInformationMessage(`Report saved successfully to ${saveUri.fsPath}`);
      Logger.info(`Report saved to ${saveUri.fsPath}.`);
    }
  }
}
