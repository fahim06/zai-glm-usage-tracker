import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateTooltipMarkdown } from '../src/ui/tooltipBuilder';
import { UsageState } from '../src/types/domain';

describe('TooltipBuilder Unit Tests', () => {
  it('generates setup prompt when unconfigured', () => {
    const state: UsageState = { status: 'unconfigured' };
    const md = generateTooltipMarkdown(state);
    assert.match(md, /API Key Not Configured/);
    assert.match(md, /command:zaiUsage\.setApiKey/);
  });

  it('generates error diagnosis and retry link when in error state', () => {
    const state: UsageState = {
      status: 'error',
      errorMessage: 'Network timeout'
    };
    const md = generateTooltipMarkdown(state);
    assert.match(md, /Connection Error/);
    assert.match(md, /Network timeout/);
    assert.match(md, /command:zaiUsage\.refresh/);
  });

  it('generates rich breakdown with progress bars, reset countdowns, and 30-day stats', () => {
    const fixedNow = 1700000000000;
    const resetTime = fixedNow + 3600 * 1000 * 2; // 2 hours

    const state: UsageState = {
      status: 'connected',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 25,
          used: 3000,
          nextResetTime: resetTime,
          type: 'TOKENS_LIMIT'
        },
        thirtyDayTokens: 45200,
        thirtyDayPrompts: 120,
        planTier: 'pro',
        lastUpdated: new Date(fixedNow)
      }
    };

    const md = generateTooltipMarkdown(state, fixedNow);

    // Verify Title & Tier
    assert.match(md, /\[PRO\]/);

    // Verify 5-Hour limit
    assert.match(md, /5-Hour Token Quota/);
    assert.match(md, /75% remaining/);
    assert.match(md, /3K tokens \/ credits/);
    assert.match(md, /in 2h 0m/);

    // Verify 30-day activity
    assert.match(md, /30-Day Usage/);
    assert.match(md, /45\.2K/);
    assert.match(md, /120/);

    // Verify footer actions
    assert.match(md, /command:zaiUsage\.refresh/);
    assert.match(md, /command:zaiUsage\.showMenu/);
  });

  it('shows degraded warning banner when status is degraded', () => {
    const state: UsageState = {
      status: 'degraded',
      errorMessage: 'Rate limit hit',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 50,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'lite',
        lastUpdated: new Date()
      }
    };

    const md = generateTooltipMarkdown(state);
    assert.match(md, /Sync Degraded/);
    assert.match(md, /Rate limit hit/);
    assert.match(md, /Showing cached usage/);
  });

  it('renders active account label and status badges in tooltip', () => {
    const state: UsageState = {
      status: 'connected',
      accountLabel: 'Work Account',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 85,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'max',
        lastUpdated: new Date()
      }
    };

    const md = generateTooltipMarkdown(state);
    assert.match(md, /\(Work Account\)/);
    assert.match(md, /🟡 Warning/);
  });
});
