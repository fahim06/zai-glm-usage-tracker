import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildQuickPickItems } from '../src/ui/quickPickMenu';
import { UsageState } from '../src/types/domain';

describe('QuickPickMenu Unit Tests', () => {
  it('builds setup items when unconfigured', () => {
    const state: UsageState = { status: 'unconfigured' };
    const items = buildQuickPickItems(state);

    const setupItem = items.find((i) => i.actionType === 'update_key');
    assert.ok(setupItem);
    assert.match(setupItem.label, /No API Key Configured/);

    const refreshItem = items.find((i) => i.actionType === 'refresh');
    assert.ok(refreshItem);
    assert.match(refreshItem.label, /Refresh Now/);
  });

  it('builds full usage metrics and copyable summaries when connected', () => {
    const fixedNow = 1700000000000;
    const resetTime = fixedNow + 3600 * 1000 * 3; // 3 hours

    const state: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 40,
          used: 4800,
          nextResetTime: resetTime,
          type: 'TOKENS_LIMIT'
        },
        thirtyDayTokens: 85000,
        thirtyDayPrompts: 350,
        planTier: 'max',
        lastUpdated: new Date(fixedNow)
      }
    };

    const items = buildQuickPickItems(state, fixedNow);

    // Verify 5-hour item
    const fiveHourItem = items.find((i) => i.label.includes('5-Hour Quota'));
    assert.ok(fiveHourItem);
    assert.strictEqual(fiveHourItem.actionType, 'copy_summary');
    assert.match(fiveHourItem.copyText ?? '', /40% used/);
    assert.match(fiveHourItem.copyText ?? '', /resets in 3h 0m/);

    // Verify 30-day activity item
    const monthlyItem = items.find((i) => i.label.includes('30-Day Activity'));
    assert.ok(monthlyItem);
    assert.strictEqual(monthlyItem.actionType, 'copy_summary');
    assert.match(monthlyItem.copyText ?? '', /Tokens: 85K/);
    assert.match(monthlyItem.copyText ?? '', /Prompts: 350/);

    // Verify actions
    const switchAccountItem = items.find((i) => i.actionType === 'switch_account');
    assert.ok(switchAccountItem);
    const settingsItem = items.find((i) => i.actionType === 'settings');
    assert.ok(settingsItem);
    const updateKeyItem = items.find((i) => i.actionType === 'update_key');
    assert.ok(updateKeyItem);
    const clearKeyItem = items.find((i) => i.actionType === 'clear_key');
    assert.ok(clearKeyItem);
    const dashboardItem = items.find((i) => i.actionType === 'open_dashboard');
    assert.ok(dashboardItem);
  });
});
