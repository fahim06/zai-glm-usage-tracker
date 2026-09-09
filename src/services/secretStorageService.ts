import * as vscode from 'vscode';
import { SECRET_KEY_API_KEY } from '../config/constants';

export class SecretStorageService implements vscode.Disposable {
  private readonly _onDidChangeApiKey = new vscode.EventEmitter<void>();
  public readonly onDidChangeApiKey: vscode.Event<void> = this._onDidChangeApiKey.event;

  private readonly disposable: vscode.Disposable;

  constructor(private readonly secretStorage: vscode.SecretStorage) {
    this.disposable = this.secretStorage.onDidChange((event) => {
      if (event.key === SECRET_KEY_API_KEY) {
        this._onDidChangeApiKey.fire();
      }
    });
  }

  public async getApiKey(): Promise<string | undefined> {
    const raw = await this.secretStorage.get(SECRET_KEY_API_KEY);
    return raw?.trim() || undefined;
  }

  public async setApiKey(apiKey: string): Promise<void> {
    const sanitized = apiKey.trim();
    if (!sanitized) {
      await this.deleteApiKey();
      return;
    }
    await this.secretStorage.store(SECRET_KEY_API_KEY, sanitized);
  }

  public async deleteApiKey(): Promise<void> {
    await this.secretStorage.delete(SECRET_KEY_API_KEY);
  }

  public dispose(): void {
    this._onDidChangeApiKey.dispose();
    this.disposable.dispose();
  }
}
