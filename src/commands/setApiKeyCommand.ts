import * as vscode from 'vscode';
import { AccountManager } from '../services/accountManager';
import { ApiClient } from '../services/apiClient';
import { SettingsManager } from '../config/settings';

export async function setApiKeyCommand(
  accountManager: AccountManager,
  apiClient: ApiClient,
  onKeySaved?: () => Promise<void>
): Promise<boolean> {
  const activeAccount = accountManager.getActiveAccount();
  const existingKey = await accountManager.getActiveApiKey();

  const titleSuffix = activeAccount ? ` for "${activeAccount.label}"` : '';

  const apiKeyInput = await vscode.window.showInputBox({
    title: `Z.ai GLM Usage Tracker: Set API Key${titleSuffix}`,
    prompt: 'Enter your Z.ai API key (get one from https://z.ai/manage-apikey/apikey-list)',
    password: true,
    ignoreFocusOut: true,
    placeHolder: existingKey ? 'Enter new key to replace existing' : 'Paste your API key here',
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
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

  // Test the key against Z.ai API before saving
  const validation = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Z.ai Usage Tracker',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Validating API key against Z.ai servers...' });
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
      return setApiKeyCommand(accountManager, apiClient, onKeySaved);
    }

    if (action === 'Open Z.ai Dashboard') {
      await vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey/apikey-list'));
    }

    return false;
  }

  // Key is valid -> Persist to AccountManager
  if (activeAccount) {
    await accountManager.updateAccountKey(activeAccount.id, cleanKey);
  } else {
    await accountManager.addAccount('Default', cleanKey);
  }

  const planInfo = validation.tier ? ` (Plan: ${validation.tier.toUpperCase()})` : '';
  vscode.window.showInformationMessage(`Z.ai API key validated and saved successfully${planInfo}.`);

  if (onKeySaved) {
    await onKeySaved();
  }

  return true;
}
