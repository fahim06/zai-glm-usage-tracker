import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AccountManager, SecretStorageLike, StorageLike } from '../src/services/accountManager';
import { SECRET_KEY_API_KEY, SECRET_PREFIX_API_KEY, STORAGE_KEY_ACCOUNTS, STORAGE_KEY_ACTIVE_ACCOUNT_ID } from '../src/config/constants';

class InMemorySecretStorage implements SecretStorageLike {
  public storeMap = new Map<string, string>();

  public async get(key: string): Promise<string | undefined> {
    return this.storeMap.get(key);
  }

  public async store(key: string, value: string): Promise<void> {
    this.storeMap.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.storeMap.delete(key);
  }
}

class InMemoryGlobalState implements StorageLike {
  public state = new Map<string, unknown>();

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.state.has(key)) {
      return this.state.get(key) as T;
    }
    return defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.state.delete(key);
    } else {
      this.state.set(key, value);
    }
  }
}

describe('AccountManager Unit Tests', () => {
  it('migrates legacy single API key to Default account on initialize', async () => {
    const secrets = new InMemorySecretStorage();
    const globalState = new InMemoryGlobalState();

    // Seed legacy key
    await secrets.store(SECRET_KEY_API_KEY, 'sk-legacy-test-key-12345');

    const manager = new AccountManager(secrets, globalState);
    await manager.initialize();

    const accounts = manager.getAccounts();
    assert.strictEqual(accounts.length, 1);
    assert.strictEqual(accounts[0].id, 'default');
    assert.strictEqual(accounts[0].label, 'Default');

    const active = manager.getActiveAccount();
    assert.strictEqual(active?.id, 'default');

    const storedMigratedKey = await secrets.get(`${SECRET_PREFIX_API_KEY}default`);
    assert.strictEqual(storedMigratedKey, 'sk-legacy-test-key-12345');

    const activeKey = await manager.getActiveApiKey();
    assert.strictEqual(activeKey, 'sk-legacy-test-key-12345');
  });

  it('adds new accounts and sets them as active', async () => {
    const secrets = new InMemorySecretStorage();
    const globalState = new InMemoryGlobalState();
    const manager = new AccountManager(secrets, globalState);

    const account1 = await manager.addAccount('Work Team', 'sk-work-111');
    assert.strictEqual(account1.label, 'Work Team');
    assert.ok(account1.id.startsWith('acc_'));

    assert.strictEqual(manager.getActiveAccount()?.id, account1.id);
    assert.strictEqual(await manager.getActiveApiKey(), 'sk-work-111');

    const account2 = await manager.addAccount('Personal', 'sk-personal-222');
    assert.strictEqual(account2.label, 'Personal');
    assert.strictEqual(manager.getAccounts().length, 2);
    assert.strictEqual(manager.getActiveAccount()?.id, account2.id);
    assert.strictEqual(await manager.getActiveApiKey(), 'sk-personal-222');
  });

  it('switches active account correctly', async () => {
    const secrets = new InMemorySecretStorage();
    const globalState = new InMemoryGlobalState();
    const manager = new AccountManager(secrets, globalState);

    const acc1 = await manager.addAccount('Work', 'key-work');
    const acc2 = await manager.addAccount('Personal', 'key-personal');

    assert.strictEqual(manager.getActiveAccount()?.id, acc2.id);

    const switched = await manager.switchAccount(acc1.id);
    assert.strictEqual(switched?.id, acc1.id);
    assert.strictEqual(manager.getActiveAccount()?.id, acc1.id);
    assert.strictEqual(await manager.getActiveApiKey(), 'key-work');
  });

  it('updates an existing account API key', async () => {
    const secrets = new InMemorySecretStorage();
    const globalState = new InMemoryGlobalState();
    const manager = new AccountManager(secrets, globalState);

    const acc = await manager.addAccount('Client A', 'key-old');
    assert.strictEqual(await manager.getActiveApiKey(), 'key-old');

    await manager.updateAccountKey(acc.id, 'key-new');
    assert.strictEqual(await manager.getActiveApiKey(), 'key-new');
  });

  it('removes account, deletes secret, and reassigns active account', async () => {
    const secrets = new InMemorySecretStorage();
    const globalState = new InMemoryGlobalState();
    const manager = new AccountManager(secrets, globalState);

    const acc1 = await manager.addAccount('Account 1', 'key-1');
    const acc2 = await manager.addAccount('Account 2', 'key-2');

    // Currently active is acc2
    assert.strictEqual(manager.getActiveAccount()?.id, acc2.id);

    // Remove acc2
    await manager.removeAccount(acc2.id);

    assert.strictEqual(manager.getAccounts().length, 1);
    assert.strictEqual(manager.getActiveAccount()?.id, acc1.id);
    assert.strictEqual(await manager.getActiveApiKey(), 'key-1');

    // Secret for acc2 should be deleted
    const deletedSecret = await secrets.get(`${SECRET_PREFIX_API_KEY}${acc2.id}`);
    assert.strictEqual(deletedSecret, undefined);
  });
});
