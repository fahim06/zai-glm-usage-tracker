import * as vscode from 'vscode';
import { AccountManager } from '../services/accountManager';
import { ApiClient } from '../services/apiClient';
import { SettingsManager } from '../config/settings';

export async function switchAccountCommand(
  accountManager: AccountManager,
  apiClient: ApiClient
): Promise<boolean> {
  const accounts = accountManager.getAccounts();
  const active = accountManager.getActiveAccount();

  if (accounts.length === 0) {
    const action = await vscode.window.showInformationMessage(
      'No Z.ai accounts configured yet.',
      'Add Account'
    );
    if (action === 'Add Account') {
      return addAccountCommand(accountManager, apiClient);
    }
    return false;
  }

  interface AccountQuickPickItem extends vscode.QuickPickItem {
    accountId?: string;
    isAddAction?: boolean;
  }

  const items: AccountQuickPickItem[] = accounts.map((acc) => {
    const isActive = acc.id === active?.id;
    return {
      label: `${isActive ? '$(check) ' : '$(person) '}${acc.label}`,
      ...(isActive ? { description: 'Active Account' } : {}),
      detail: `ID: ${acc.id} • Added ${new Date(acc.createdAt).toLocaleDateString()}`,
      accountId: acc.id
    };
  });

  items.push(
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator
    },
    {
      label: '$(plus) Add New Account...',
      description: 'Configure another Z.ai API key with a custom label',
      isAddAction: true
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: 'Switch Z.ai Account',
    placeHolder: 'Select an active account or add a new one...'
  });

  if (!selected) {
    return false;
  }

  if (selected.isAddAction) {
    return addAccountCommand(accountManager, apiClient);
  }

  if (selected.accountId) {
    const switched = await accountManager.switchAccount(selected.accountId);
    if (switched) {
      vscode.window.showInformationMessage(`Switched active Z.ai account to: ${switched.label}`);
      return true;
    }
  }

  return false;
}

export async function addAccountCommand(
  accountManager: AccountManager,
  apiClient: ApiClient
): Promise<boolean> {
  const existingAccounts = accountManager.getAccounts();

  const labelInput = await vscode.window.showInputBox({
    title: 'Z.ai GLM: Add Account',
    prompt: 'Enter a label for this account (e.g. "Personal", "Work", "Client Project")',
    placeHolder: 'e.g. Personal',
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Account label cannot be empty';
      }
      if (existingAccounts.some((a) => a.label.toLowerCase() === trimmed.toLowerCase())) {
        return 'An account with this label already exists';
      }
      return null;
    }
  });

  if (!labelInput) {
    return false;
  }

  const cleanLabel = labelInput.trim();

  const apiKeyInput = await vscode.window.showInputBox({
    title: `Z.ai GLM: Set API Key for "${cleanLabel}"`,
    prompt: 'Paste your Z.ai API key (from https://z.ai/manage-apikey/apikey-list)',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) {
        return 'API key cannot be empty';
      }
      return null;
    }
  });

  if (!apiKeyInput) {
    return false;
  }

  const cleanKey = apiKeyInput.trim();
  const settings = SettingsManager.getSettings();

  // Validate the key against Z.ai API
  const validation = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Z.ai Usage Tracker',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: `Validating API key for "${cleanLabel}"...` });
      return await apiClient.validateApiKey(cleanKey, settings.apiEndpoint);
    }
  );

  if (!validation.valid) {
    const errorDetails = validation.error ?? 'Unknown validation error';
    const action = await vscode.window.showErrorMessage(
      `Failed to validate Z.ai API key: ${errorDetails}`,
      'Retry',
      'Open Z.ai Dashboard'
    );

    if (action === 'Retry') {
      return addAccountCommand(accountManager, apiClient);
    }
    if (action === 'Open Z.ai Dashboard') {
      await vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey/apikey-list'));
    }
    return false;
  }

  await accountManager.addAccount(cleanLabel, cleanKey);
  const planInfo = validation.tier ? ` (Plan: ${validation.tier.toUpperCase()})` : '';
  vscode.window.showInformationMessage(`Account "${cleanLabel}" added and activated successfully${planInfo}.`);
  return true;
}

export async function removeAccountCommand(
  accountManager: AccountManager
): Promise<boolean> {
  const accounts = accountManager.getAccounts();
  if (accounts.length === 0) {
    vscode.window.showInformationMessage('No Z.ai accounts to remove.');
    return false;
  }

  interface RemoveQuickPickItem extends vscode.QuickPickItem {
    accountId: string;
    accountLabel: string;
  }

  const items: RemoveQuickPickItem[] = accounts.map((acc) => ({
    label: `$(trash) ${acc.label}`,
    detail: `ID: ${acc.id} • Added ${new Date(acc.createdAt).toLocaleDateString()}`,
    accountId: acc.id,
    accountLabel: acc.label
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: 'Remove Z.ai Account',
    placeHolder: 'Select an account to remove from this extension...'
  });

  if (!selected) {
    return false;
  }

  const answer = await vscode.window.showWarningMessage(
    `Are you sure you want to remove account "${selected.accountLabel}" and delete its stored API key?`,
    { modal: true },
    'Remove Account'
  );

  if (answer !== 'Remove Account') {
    return false;
  }

  await accountManager.removeAccount(selected.accountId);
  vscode.window.showInformationMessage(`Account "${selected.accountLabel}" has been removed.`);
  return true;
}
