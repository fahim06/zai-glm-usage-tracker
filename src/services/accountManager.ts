import * as vscode from 'vscode';
import { AccountInfo } from '../types/domain';
import {
  SECRET_KEY_API_KEY,
  SECRET_PREFIX_API_KEY,
  STORAGE_KEY_ACCOUNTS,
  STORAGE_KEY_ACTIVE_ACCOUNT_ID
} from '../config/constants';
import { Logger } from '../utils/logger';

export interface StorageLike {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
  onDidChange?: vscode.Event<vscode.SecretStorageChangeEvent>;
}

export class AccountManager implements vscode.Disposable {
  private readonly _onDidChangeActiveAccount = new vscode.EventEmitter<AccountInfo | undefined>();
  public readonly onDidChangeActiveAccount: vscode.Event<AccountInfo | undefined> = this._onDidChangeActiveAccount.event;

  private readonly _onDidChangeAccounts = new vscode.EventEmitter<AccountInfo[]>();
  public readonly onDidChangeAccounts: vscode.Event<AccountInfo[]> = this._onDidChangeAccounts.event;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly secretStorage: SecretStorageLike,
    private readonly globalState: StorageLike
  ) {
    if (this.secretStorage.onDidChange) {
      this.disposables.push(
        this.secretStorage.onDidChange(async (event) => {
          const active = this.getActiveAccount();
          if (active && (event.key === `${SECRET_PREFIX_API_KEY}${active.id}` || event.key === SECRET_KEY_API_KEY)) {
            this._onDidChangeActiveAccount.fire(active);
          }
        })
      );
    }
  }

  /**
   * Initializes the manager and migrates any legacy single API key if needed.
   */
  public async initialize(): Promise<void> {
    const existingAccounts = this.getAccounts();
    if (existingAccounts.length === 0) {
      // Check legacy single key
      const legacyKey = await this.secretStorage.get(SECRET_KEY_API_KEY);
      if (legacyKey && legacyKey.trim()) {
        Logger.info('AccountManager: Migrating legacy API key to "Default" account...');
        const defaultAccount: AccountInfo = {
          id: 'default',
          label: 'Default',
          createdAt: Date.now()
        };
        await this.secretStorage.store(`${SECRET_PREFIX_API_KEY}default`, legacyKey.trim());
        await this.globalState.update(STORAGE_KEY_ACCOUNTS, [defaultAccount]);
        await this.globalState.update(STORAGE_KEY_ACTIVE_ACCOUNT_ID, 'default');
        Logger.info('AccountManager: Migration completed successfully.');
      }
    }
  }

  public getAccounts(): AccountInfo[] {
    const raw = this.globalState.get<AccountInfo[]>(STORAGE_KEY_ACCOUNTS, []);
    return Array.isArray(raw) ? raw : [];
  }

  public getActiveAccount(): AccountInfo | undefined {
    const accounts = this.getAccounts();
    if (accounts.length === 0) {
      return undefined;
    }

    const activeId = this.globalState.get<string>(STORAGE_KEY_ACTIVE_ACCOUNT_ID);
    if (activeId) {
      const matched = accounts.find((a) => a.id === activeId);
      if (matched) {
        return matched;
      }
    }

    // Default to the first account if none explicitly active
    return accounts[0];
  }

  public async getActiveApiKey(): Promise<string | undefined> {
    const active = this.getActiveAccount();
    if (!active) {
      // Check legacy fallback
      const legacy = await this.secretStorage.get(SECRET_KEY_API_KEY);
      return legacy?.trim() || undefined;
    }
    return this.getApiKeyForAccount(active.id);
  }

  public async getApiKeyForAccount(accountId: string): Promise<string | undefined> {
    const key = await this.secretStorage.get(`${SECRET_PREFIX_API_KEY}${accountId}`);
    return key?.trim() || undefined;
  }

  public async addAccount(label: string, apiKey: string): Promise<AccountInfo> {
    const cleanLabel = label.trim();
    const cleanKey = apiKey.trim();

    if (!cleanLabel) {
      throw new Error('Account label cannot be empty.');
    }
    if (!cleanKey) {
      throw new Error('API key cannot be empty.');
    }

    const accounts = this.getAccounts();
    const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAccount: AccountInfo = {
      id,
      label: cleanLabel,
      createdAt: Date.now()
    };

    await this.secretStorage.store(`${SECRET_PREFIX_API_KEY}${id}`, cleanKey);
    const updatedAccounts = [...accounts, newAccount];
    await this.globalState.update(STORAGE_KEY_ACCOUNTS, updatedAccounts);
    await this.globalState.update(STORAGE_KEY_ACTIVE_ACCOUNT_ID, id);

    Logger.info(`AccountManager: Added account "${cleanLabel}" (ID: ${id}) and set as active.`);

    this._onDidChangeAccounts.fire(updatedAccounts);
    this._onDidChangeActiveAccount.fire(newAccount);

    return newAccount;
  }

  public async updateAccountKey(accountId: string, apiKey: string): Promise<void> {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      throw new Error('API key cannot be empty.');
    }

    const accounts = this.getAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Account with ID "${accountId}" not found.`);
    }

    await this.secretStorage.store(`${SECRET_PREFIX_API_KEY}${accountId}`, cleanKey);
    Logger.info(`AccountManager: Updated API key for account "${account.label}".`);

    const active = this.getActiveAccount();
    if (active && active.id === accountId) {
      this._onDidChangeActiveAccount.fire(active);
    }
  }

  public async switchAccount(accountId: string): Promise<AccountInfo | undefined> {
    const accounts = this.getAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) {
      return undefined;
    }

    await this.globalState.update(STORAGE_KEY_ACTIVE_ACCOUNT_ID, target.id);
    Logger.info(`AccountManager: Switched active account to "${target.label}" (ID: ${target.id}).`);

    this._onDidChangeActiveAccount.fire(target);
    return target;
  }

  public async removeAccount(accountId: string): Promise<void> {
    const accounts = this.getAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) {
      return;
    }

    await this.secretStorage.delete(`${SECRET_PREFIX_API_KEY}${accountId}`);
    const remaining = accounts.filter((a) => a.id !== accountId);
    await this.globalState.update(STORAGE_KEY_ACCOUNTS, remaining);

    Logger.info(`AccountManager: Removed account "${target.label}" (ID: ${accountId}).`);

    const currentActiveId = this.globalState.get<string>(STORAGE_KEY_ACTIVE_ACCOUNT_ID);
    let newActive: AccountInfo | undefined;
    if (currentActiveId === accountId) {
      newActive = remaining.length > 0 ? remaining[0] : undefined;
      await this.globalState.update(
        STORAGE_KEY_ACTIVE_ACCOUNT_ID,
        newActive ? newActive.id : undefined
      );
    } else {
      newActive = this.getActiveAccount();
    }

    this._onDidChangeAccounts.fire(remaining);
    this._onDidChangeActiveAccount.fire(newActive);
  }

  public dispose(): void {
    this._onDidChangeActiveAccount.dispose();
    this._onDidChangeAccounts.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
