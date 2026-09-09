import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HistoryService } from '../src/services/historyService';
import { StorageLike } from '../src/services/accountManager';
import { UsageState } from '../src/types/domain';
import { renderSvgChart, generateHistoryWebviewHtml } from '../src/ui/historyPanel';

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

describe('HistoryService Unit Tests', () => {
  it('records snapshots and retrieves them by account', async () => {
    const globalState = new InMemoryGlobalState();
    const service = new HistoryService(globalState);

    const now = 1700000000000;
    const state: UsageState = {
      status: 'connected',
      accountId: 'test-acc',
      accountLabel: 'Test Account',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 45,
          used: 5400,
          type: 'TOKENS_LIMIT'
        },
        thirtyDayTokens: 250000,
        thirtyDayPrompts: 1200,
        planTier: 'pro',
        lastUpdated: new Date(now)
      }
    };

    const recorded = await service.recordSnapshot(state, now);
    assert.strictEqual(recorded, true);

    const snapshots = service.getSnapshots('test-acc');
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].fiveHourPercentage, 45);
    assert.strictEqual(snapshots[0].fiveHourUsed, 5400);
    assert.strictEqual(snapshots[0].thirtyDayTokens, 250000);
  });

  it('skips duplicate consecutive snapshots within 5 minutes', async () => {
    const globalState = new InMemoryGlobalState();
    const service = new HistoryService(globalState);

    const now = 1700000000000;
    const state: UsageState = {
      status: 'connected',
      accountId: 'test-acc',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: 50,
          type: 'TOKENS_LIMIT'
        },
        thirtyDayTokens: 100000,
        planTier: 'pro',
        lastUpdated: new Date(now)
      }
    };

    // First record
    const rec1 = await service.recordSnapshot(state, now);
    assert.strictEqual(rec1, true);

    // 2 minutes later with exact same percentages
    const rec2 = await service.recordSnapshot(state, now + 2 * 60 * 1000);
    assert.strictEqual(rec2, false, 'Duplicate snapshot within 5m should be skipped');

    // But if percentage changed 1 minute later -> should record
    const stateChanged: UsageState = {
      ...state,
      metrics: {
        ...state.metrics!,
        fiveHourQuota: {
          ...state.metrics!.fiveHourQuota,
          percentage: 55
        }
      }
    };
    const rec3 = await service.recordSnapshot(stateChanged, now + 3 * 60 * 1000);
    assert.strictEqual(rec3, true);

    assert.strictEqual(service.getSnapshots('test-acc').length, 2);
  });

  it('filters snapshots by 24h, 7d, and 30d timeframes', async () => {
    const globalState = new InMemoryGlobalState();
    const service = new HistoryService(globalState);

    const now = 1700000000000;
    const hour = 3600 * 1000;
    const day = 24 * hour;

    const makeState = (pct: number) => ({
      status: 'connected' as const,
      accountId: 'acc-time',
      metrics: {
        fiveHourQuota: {
          unit: 3,
          name: '5-Hour Quota',
          percentage: pct,
          type: 'TOKENS_LIMIT'
        },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    });

    // 2 hours ago (inside 5h, 24h)
    await service.recordSnapshot(makeState(5), now - 2 * hour);
    // 10 hours ago (outside 5h, inside 24h)
    await service.recordSnapshot(makeState(10), now - 10 * hour);
    // 3 days ago (outside 24h, inside 7d)
    await service.recordSnapshot(makeState(20), now - 3 * day);
    // 15 days ago (outside 7d, inside 30d)
    await service.recordSnapshot(makeState(30), now - 15 * day);

    assert.strictEqual(service.getSnapshots('acc-time', '5h', now).length, 1);
    assert.strictEqual(service.getSnapshots('acc-time', '24h', now).length, 2);
    assert.strictEqual(service.getSnapshots('acc-time', '7d', now).length, 3);
    assert.strictEqual(service.getSnapshots('acc-time', '30d', now).length, 4);
    assert.strictEqual(service.getSnapshots('acc-time', 'auto', now).length, 4);
  });

  it('prunes snapshots older than retention days', async () => {
    const globalState = new InMemoryGlobalState();
    const service = new HistoryService(globalState, () => ({
      apiEndpoint: 'https://api.z.ai',
      refreshInterval: 30,
      planTier: 'pro',
      statusBarDisplay: 'both',
      notificationsEnabled: true,
      notificationThresholds: [80, 95],
      historyRetentionDays: 7 // 7-day retention
    }));

    const now = 1700000000000;
    const day = 24 * 3600 * 1000;

    const state = {
      status: 'connected' as const,
      accountId: 'acc-prune',
      metrics: {
        fiveHourQuota: { unit: 3, name: '5h', percentage: 40, type: 'TOKENS_LIMIT' },
        planTier: 'pro',
        lastUpdated: new Date()
      }
    };

    // 10 days ago (older than 7 days)
    await service.recordSnapshot(state, now - 10 * day);
    // 2 days ago
    await service.recordSnapshot(state, now - 2 * day);
    // Now
    await service.recordSnapshot({
      ...state,
      metrics: {
        ...state.metrics,
        fiveHourQuota: { ...state.metrics.fiveHourQuota, percentage: 60 }
      }
    }, now);

    const snapshots = service.getSnapshots('acc-prune');
    assert.strictEqual(snapshots.length, 2, 'Snapshot older than 7 days should be pruned');
  });

  it('renders SVG chart and HTML structure correctly', () => {
    const emptyChart = renderSvgChart([], '24h');
    assert.match(emptyChart, /No usage data recorded/);

    const snapshots = [
      {
        timestamp: 1700000000000,
        accountId: 'acc-1',
        fiveHourPercentage: 20,
        thirtyDayTokens: 50000,
        thirtyDayPrompts: 100
      },
      {
        timestamp: 1700003600000,
        accountId: 'acc-1',
        fiveHourPercentage: 85,
        thirtyDayTokens: 55000,
        thirtyDayPrompts: 110
      }
    ];

    const chart = renderSvgChart(snapshots, '24h');
    assert.match(chart, /<svg/);
    assert.match(chart, /80% Warning/);
    assert.match(chart, /95% Critical/);
    assert.match(chart, /fiveHourGrad/);

    // Test single snapshot rendering (draws full-width horizontal baseline with badge)
    const singleSnapshot = [{
      timestamp: Date.now() - 60000,
      accountId: 'acc-1',
      fiveHourPercentage: 45
    }];
    const singleChart = renderSvgChart(singleSnapshot, 'auto');
    assert.match(singleChart, /Current Quota: 45%/);
    assert.match(singleChart, /chart-badge/);

    // Test mid-window tracking start (baseline dashed line and start marker)
    const midWindowChart = renderSvgChart(snapshots, '24h', 720, 240, 1700003600000 + 20 * 3600 * 1000);
    assert.match(midWindowChart, /stroke-dasharray="3 3"/);

    const html = generateHistoryWebviewHtml(
      [{ id: 'acc-1', label: 'Main Account', createdAt: 1700000000000 }],
      { id: 'acc-1', label: 'Main Account', createdAt: 1700000000000 },
      snapshots,
      'auto',
      'test-nonce-123'
    );

    assert.match(html, /nonce="test-nonce-123"/);
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /Main Account/);
    assert.match(html, /85%/);
    assert.match(html, /btnAuto/);
    assert.match(html, /btn5h/);
  });
});
