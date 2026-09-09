import { UsageSnapshot, PlanTier } from '../types/domain';
import { formatTokens } from '../utils/formatters';

export type ReportTimeframe = '7d' | '30d' | 'all';

export interface DailyReportRow {
  date: string;
  peakFiveHour: number;
  sampleCount: number;
  tokens?: number | undefined;
  prompts?: number | undefined;
}

export class ReportGenerator {
  /**
   * Generates a comprehensive Markdown report.
   */
  public static generateMarkdown(
    accountLabel: string,
    planTier: PlanTier,
    snapshots: UsageSnapshot[],
    timeframe: ReportTimeframe,
    now: number = Date.now()
  ): string {
    const { filtered, dailyRows, stats } = this.processSnapshots(snapshots, timeframe, now);

    const timeframeLabel = timeframe === '7d' ? 'Last 7 Days' : timeframe === '30d' ? 'Last 30 Days' : 'All Available History';
    const reportDate = new Date(now).toLocaleString();

    const lines: string[] = [];
    lines.push(`# Z.ai GLM Usage & Expense Report`);
    lines.push(`**Account**: ${accountLabel}  `);
    lines.push(`**Plan Tier**: ${planTier.toUpperCase()}  `);
    lines.push(`**Timeframe**: ${timeframeLabel}  `);
    lines.push(`**Generated**: ${reportDate}  \n`);
    lines.push(`---`);

    // Executive Summary
    lines.push(`## Executive Summary\n`);
    lines.push(`| Metric | Value |`);
    lines.push(`|:---|:---|`);
    lines.push(`| **Total Snapshots Analyzed** | ${filtered.length.toLocaleString()} |`);
    lines.push(`| **Active Days Recorded** | ${dailyRows.length} |`);
    lines.push(`| **Peak 5-Hour Quota** | ${stats.peakFiveHour}% |`);
    if (stats.latestTokens !== undefined) {
      lines.push(`| **30-Day Tokens Consumed** | ${formatTokens(stats.latestTokens)} |`);
    }
    if (stats.latestPrompts !== undefined) {
      lines.push(`| **30-Day Total Prompts** | ${stats.latestPrompts.toLocaleString()} |`);
    }
    lines.push('');

    // Daily Activity Breakdown
    lines.push(`## Daily Activity Log\n`);
    if (dailyRows.length === 0) {
      lines.push(`*No usage recorded during this timeframe.*\n`);
    } else {
      lines.push(`| Date | Peak 5-Hour % | 30d Rolling Tokens | Samples |`);
      lines.push(`|:---|:---:|:---:|:---:|`);
      for (const row of dailyRows) {
        const tokensStr = row.tokens !== undefined ? formatTokens(row.tokens) : '—';
        lines.push(`| ${row.date} | ${row.peakFiveHour}% | ${tokensStr} | ${row.sampleCount} |`);
      }
      lines.push('');
    }

    lines.push(`---`);
    lines.push(`*Report generated automatically by Z.ai GLM Usage Tracker for VS Code & Antigravity IDE.*`);

    return lines.join('\n');
  }

  /**
   * Generates a CSV spreadsheet dataset.
   */
  public static generateCsv(
    accountLabel: string,
    planTier: PlanTier,
    snapshots: UsageSnapshot[],
    timeframe: ReportTimeframe,
    now: number = Date.now()
  ): string {
    const { dailyRows } = this.processSnapshots(snapshots, timeframe, now);

    const headers = ['Date', 'Account', 'PlanTier', 'Peak5HourPct', 'Tokens30dRolling', 'SampleCount'];
    const rows: string[] = [headers.join(',')];

    for (const row of dailyRows) {
      const escapedAccount = `"${accountLabel.replace(/"/g, '""')}"`;
      const tokens = row.tokens !== undefined ? row.tokens : '';
      rows.push([
        row.date,
        escapedAccount,
        planTier,
        row.peakFiveHour,
        tokens,
        row.sampleCount
      ].join(','));
    }

    return rows.join('\n');
  }

  private static processSnapshots(
    snapshots: UsageSnapshot[],
    timeframe: ReportTimeframe,
    now: number
  ) {
    let cutoffMs = 0;
    if (timeframe === '7d') {
      cutoffMs = now - 7 * 24 * 60 * 60 * 1000;
    } else if (timeframe === '30d') {
      cutoffMs = now - 30 * 24 * 60 * 60 * 1000;
    }

    const filtered = snapshots
      .filter((s) => s.timestamp >= cutoffMs)
      .sort((a, b) => a.timestamp - b.timestamp);

    const dailyMap = new Map<string, {
      peakFiveHour: number;
      sampleCount: number;
      latestTokens?: number;
      latestPrompts?: number;
    }>();

    let peakFiveHour = 0;

    for (const s of filtered) {
      const dateStr = new Date(s.timestamp).toISOString().split('T')[0] ?? 'unknown';
      const existing = dailyMap.get(dateStr) ?? {
        peakFiveHour: 0,
        sampleCount: 0
      };

      existing.peakFiveHour = Math.max(existing.peakFiveHour, s.fiveHourPercentage);
      if (s.thirtyDayTokens !== undefined) {
        existing.latestTokens = s.thirtyDayTokens;
      }
      if (s.thirtyDayPrompts !== undefined) {
        existing.latestPrompts = s.thirtyDayPrompts;
      }
      existing.sampleCount++;
      dailyMap.set(dateStr, existing);

      peakFiveHour = Math.max(peakFiveHour, s.fiveHourPercentage);
    }

    const dailyRows: DailyReportRow[] = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      peakFiveHour: val.peakFiveHour,
      sampleCount: val.sampleCount,
      ...(val.latestTokens !== undefined ? { tokens: val.latestTokens } : {}),
      ...(val.latestPrompts !== undefined ? { prompts: val.latestPrompts } : {})
    }));

    const lastSnap = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;

    return {
      filtered,
      dailyRows,
      stats: {
        peakFiveHour,
        latestTokens: lastSnap?.thirtyDayTokens,
        latestPrompts: lastSnap?.thirtyDayPrompts
      }
    };
  }
}
