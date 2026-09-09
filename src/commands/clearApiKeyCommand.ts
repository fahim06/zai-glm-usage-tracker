import * as vscode from 'vscode';
import { AccountManager } from '../services/accountManager';

export async function clearApiKeyCommand(
  accountManager: AccountManager,
  onKeyCleared?: () => Promise<void>
): Promise<boolean> {
  const activeAccount = accountManager.getActiveAccount();
  const existingKey = await accountManager.getActiveApiKey();

  if (!existingKey || !activeAccount) {
    vscode.window.showInformationMessage('No Z.ai API key is currently stored.');
    return false;
  }

  const answer = await vscode.window.showWarningMessage(
    `Are you sure you want to remove the stored API key for account "${activeAccount.label}"?`,
    { modal: true },
    'Remove Key'
  );

  if (answer !== 'Remove Key') {
    return false;
  }

  await accountManager.removeAccount(activeAccount.id);
  vscode.window.showInformationMessage(`Z.ai API key for "${activeAccount.label}" has been removed.`);

  if (onKeyCleared) {
    await onKeyCleared();
  }

  return true;
}
