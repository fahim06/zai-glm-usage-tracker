import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ReportGenerator } from '../src/services/reportGenerator';
import { UsageSnapshot } from '../src/types/domain';

describe('ReportGenerator Unit Tests', () => {
  const baseTime = 1700000000000;

  const sampleSnapshots: UsageSnapshot[] = [
    {
      timestamp: baseTime - 2 * 24 * 60 * 60 * 1000,
      accountId: 'acc1',
      fiveHourPercentage: 45,
      thirtyDayTokens: 250000,
      thirtyDayPrompts: 120
    },
    {
      timestamp: baseTime - 1 * 24 * 60 * 60 * 1000,
      accountId: 'acc1',
      fiveHourPercentage: 75,
      thirtyDayTokens: 350000,
      thirtyDayPrompts: 180
    },
    {
      timestamp: baseTime,
      accountId: 'acc1',
      fiveHourPercentage: 60,
      thirtyDayTokens: 420000,
      thirtyDayPrompts: 210
    }
  ];

  it('generates a formatted Markdown report', () => {
    const md = ReportGenerator.generateMarkdown('Work Team', 'pro', sampleSnapshots, '7d', baseTime);

    assert.match(md, /# Z\.ai GLM Usage & Expense Report/);
    assert.match(md, /\*\*Account\*\*: Work Team/);
    assert.match(md, /\*\*Plan Tier\*\*: PRO/);
    assert.match(md, /## Executive Summary/);
    assert.match(md, /## Daily Activity Log/);
    assert.match(md, /75%/); // Peak 5h quota
  });

  it('generates a valid CSV spreadsheet dataset', () => {
    const csv = ReportGenerator.generateCsv('Personal Pro', 'max', sampleSnapshots, '30d', baseTime);
    const lines = csv.trim().split('\n');

    assert.strictEqual(lines[0], 'Date,Account,PlanTier,Peak5HourPct,Tokens30dRolling,SampleCount');
    assert.strictEqual(lines.length, 4); // Header + 3 daily rows

    assert.match(lines[1] ?? '', /"Personal Pro",max,45,250000,1/);
  });

  it('filters snapshots by timeframe correctly', () => {
    const oldSnapshot: UsageSnapshot = {
      timestamp: baseTime - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      accountId: 'acc1',
      fiveHourPercentage: 90
    };

    const all = [...sampleSnapshots, oldSnapshot];

    // 7d timeframe should exclude the 15-day-old snapshot
    const md7d = ReportGenerator.generateMarkdown('Work', 'pro', all, '7d', baseTime);
    assert.match(md7d, /Total Snapshots Analyzed\*\* \| 3/);

    // 30d timeframe should include the 15-day-old snapshot
    const md30d = ReportGenerator.generateMarkdown('Work', 'pro', all, '30d', baseTime);
    assert.match(md30d, /Total Snapshots Analyzed\*\* \| 4/);
  });
});
