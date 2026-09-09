import './mockVscode';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ActivityTracker } from '../src/services/activityTracker';
import { ExtensionSettings } from '../src/config/settings';

const mockSettings = (overrides: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
  apiEndpoint: 'https://api.z.ai',
  refreshInterval: 30,
  planTier: 'pro',
  statusBarDisplay: 'both',
  notificationsEnabled: true,
  notificationThresholds: [80, 95],
  historyRetentionDays: 30,
  smartPollingEnabled: true,
  smartPollingIdleTimeoutMinutes: 5,
  smartPollingIdleInterval: 300,
  ...overrides
});

describe('ActivityTracker Unit Tests', () => {
  it('initializes in active state when window is focused', () => {
    const tracker = new ActivityTracker(() => mockSettings());
    assert.strictEqual(tracker.isIdle, false);
    assert.strictEqual(tracker.isWindowFocused, true);
    tracker.dispose();
  });

  it('marks state as idle when window loses focus', () => {
    const tracker = new ActivityTracker(() => mockSettings());
    let notifiedIdle: boolean | undefined;

    tracker.onDidChangeActivityState((e) => {
      notifiedIdle = e.isIdle;
    });

    tracker.handleWindowStateChanged(false);

    assert.strictEqual(tracker.isIdle, true);
    assert.strictEqual(tracker.isWindowFocused, false);
    assert.strictEqual(notifiedIdle, true);

    tracker.dispose();
  });

  it('transitions from idle back to active when activity is recorded', () => {
    const tracker = new ActivityTracker(() => mockSettings());
    tracker.handleWindowStateChanged(false);
    assert.strictEqual(tracker.isIdle, true);

    let notifiedActive = false;
    tracker.onDidChangeActivityState((e) => {
      if (!e.isIdle) {
        notifiedActive = true;
      }
    });

    tracker.handleWindowStateChanged(true);
    assert.strictEqual(tracker.isIdle, false);
    assert.strictEqual(notifiedActive, true);

    tracker.dispose();
  });

  it('respects smartPollingEnabled=false setting', () => {
    const tracker = new ActivityTracker(() => mockSettings({ smartPollingEnabled: false }));
    tracker.handleWindowStateChanged(false);

    assert.strictEqual(tracker.isIdle, false); // Always false when disabled

    tracker.dispose();
  });
});
