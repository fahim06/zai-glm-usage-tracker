import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AlertService } from '../src/services/alertService';
import { UsageState } from '../src/types/domain';
import { ExtensionSettings } from '../src/config/settings';

function createMockSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    apiEndpoint: 'https://api.z.ai',
    refreshInterval: 30,
    planTier: 'pro',
    statusBarDisplay: 'both',
    notificationsEnabled: true,
    notificationThresholds: [80, 95],
    ...overrides
  };
}

describe('AlertService Unit Tests', () => {
  it('fires notification when threshold is crossed', async () => {
    const notifications: string[] = [];
    const alertService = new AlertService(
      async (msg: string) => {
        notifications.push(msg);
        return undefined;
      },
      () => createMockSettings()
    );

    const state: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 82,
          nextResetTime: Date.now() + 2 * 3600 * 1000,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(state);

    assert.strictEqual(notifications.length, 1);
    assert.match(notifications[0], /5-Hour Quota reached 82%/);
    assert.match(notifications[0], /threshold: 80%/);
  });

  it('prevents repeat spam if percentage stays above threshold during same window', async () => {
    const notifications: string[] = [];
    const alertService = new AlertService(
      async (msg: string) => {
        notifications.push(msg);
        return undefined;
      },
      () => createMockSettings()
    );

    const resetTime = 1700000000000;
    const baseState: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 82,
          nextResetTime: resetTime,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    // First check: threshold 80% crossed -> fires
    await alertService.checkUsage(baseState);
    assert.strictEqual(notifications.length, 1);

    // Second check: usage increases to 84% in the same reset window -> should NOT re-fire
    const state2: UsageState = {
      ...baseState,
      metrics: {
        ...baseState.metrics!,
        fiveHourQuota: {
          ...baseState.metrics!.fiveHourQuota,
          percentage: 84
        }
      }
    };
    await alertService.checkUsage(state2);
    assert.strictEqual(notifications.length, 1, 'Should not fire duplicate alert for 80% threshold');

    // Third check: usage hits 96% -> crosses 95% threshold -> should fire
    const state3: UsageState = {
      ...baseState,
      metrics: {
        ...baseState.metrics!,
        fiveHourQuota: {
          ...baseState.metrics!.fiveHourQuota,
          percentage: 96
        }
      }
    };
    await alertService.checkUsage(state3);
    assert.strictEqual(notifications.length, 2);
    assert.match(notifications[1], /threshold: 95%/);
  });

  it('re-arms alert thresholds when reset window rolls over', async () => {
    const notifications: string[] = [];
    const alertService = new AlertService(
      async (msg: string) => {
        notifications.push(msg);
        return undefined;
      },
      () => createMockSettings()
    );

    const cycle1Reset = 1700000000000;
    const stateCycle1: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 85,
          nextResetTime: cycle1Reset,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(stateCycle1);
    assert.strictEqual(notifications.length, 1);

    // Window resets: nextResetTime advances by 5 hours, usage drops to 10%
    const cycle2Reset = cycle1Reset + 5 * 3600 * 1000;
    const stateAfterReset: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 10,
          nextResetTime: cycle2Reset,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(stateAfterReset);
    assert.strictEqual(notifications.length, 1); // no new alert at 10%

    // Later in cycle 2: usage rises to 81% -> should fire again because window reset
    const stateCycle2High: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 81,
          nextResetTime: cycle2Reset,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(stateCycle2High);
    assert.strictEqual(notifications.length, 2, 'Should fire alert in new cycle after reset');
    assert.match(notifications[1], /reached 81%/);
  });

  it('does not fire alerts when notifications are disabled in settings', async () => {
    const notifications: string[] = [];
    const alertService = new AlertService(
      async (msg: string) => {
        notifications.push(msg);
        return undefined;
      },
      () => createMockSettings({ notificationsEnabled: false })
    );

    const state: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 98,
          nextResetTime: 1700000000000,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(state);
    assert.strictEqual(notifications.length, 0);
  });

  it('tracks accounts independently and includes account label in notification', async () => {
    const notifications: string[] = [];
    const alertService = new AlertService(
      async (msg: string) => {
        notifications.push(msg);
        return undefined;
      },
      () => createMockSettings()
    );

    const account1State: UsageState = {
      status: 'connected',
      accountId: 'acc-1',
      accountLabel: 'Work',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 85,
          nextResetTime: 1700000000000,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    const account2State: UsageState = {
      status: 'connected',
      accountId: 'acc-2',
      accountLabel: 'Personal',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 88,
          nextResetTime: 1700000000000,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    await alertService.checkUsage(account1State);
    await alertService.checkUsage(account2State);

    assert.strictEqual(notifications.length, 2);
    assert.match(notifications[0], /\[Work\]/);
    assert.match(notifications[1], /\[Personal\]/);
  });
});
