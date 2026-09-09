import type * as vscode from 'vscode';
import { UsageState } from '../types/domain';
import { formatTokens, formatCountdown, renderProgressBar, getQuotaStatusBadge } from '../utils/formatters';
import { BurnRateEstimate } from '../utils/burnRate';

/**
 * Pure markdown generator for the usage tooltip, fully testable without VS Code API.
 */
export function generateTooltipMarkdown(
  state: UsageState,
  now: number = Date.now(),
  burnRate?: BurnRateEstimate | undefined
): string {
  if (state.status === 'unconfigured') {
    return [
      '### $(key) Z.ai GLM Usage Tracker\n',
      '**API Key Not Configured**\n',
      'Connect your Z.ai account to monitor 5-hour rolling quotas, token activity, and burn rate directly from your status bar.\n',
      '---\n',
      '[$(key) Set API Key](command:zaiUsage.setApiKey) &nbsp;•&nbsp; [Get API Key](https://z.ai/manage-apikey/apikey-list)'
    ].join('\n');
  }

  if (state.status === 'error') {
    return [
      '### $(error) Z.ai GLM Usage Tracker\n',
      '**Connection Error**\n',
      `> ${state.errorMessage || 'Unable to communicate with Z.ai servers.'}\n`,
      '---\n',
      '[$(refresh) Retry Now](command:zaiUsage.refresh) &nbsp;•&nbsp; [$(gear) Update API Key](command:zaiUsage.setApiKey)'
    ].join('\n');
  }

  const metrics = state.metrics;
  if (!metrics) {
    return '### Z.ai GLM Usage Tracker\n\n$(sync~spin) *Loading quota information...*';
  }

  const lines: string[] = [];

  // Header with Plan Tier
  const tierDisplay = metrics.planTier.toUpperCase();
  const accountInfo = state.accountLabel ? ` &nbsp;\`(${state.accountLabel})\`` : '';
  lines.push(`### Z.ai GLM Usage Tracker \`[${tierDisplay}]\`${accountInfo}\n`);

  // Warning Banner if in Degraded Mode
  if (state.status === 'degraded') {
    lines.push(`> $(warning) **Sync Degraded**: ${state.errorMessage || 'Network error'}. Showing cached usage.\n`);
  }

  // 1. 5-Hour Limit Section
  const fiveHour = metrics.fiveHourQuota;
  const fiveHourRemaining = Math.max(0, 100 - fiveHour.percentage);
  const fiveHourBar = renderProgressBar(fiveHour.percentage);
  const fiveHourResetCountdown = formatCountdown(fiveHour.nextResetTime, now);
  const fiveHourResetExact = fiveHour.nextResetTime
    ? new Date(fiveHour.nextResetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'unknown';
  const fiveHourBadge = getQuotaStatusBadge(fiveHour.percentage);

  lines.push(`#### ⚡ 5-Hour Token Quota &nbsp; ${fiveHourBadge}`);
  lines.push(`\`${fiveHourBar}\` &nbsp;**${fiveHourRemaining}% remaining**\n`);

  if (fiveHour.used !== undefined) {
    lines.push(`- **Usage**: ${formatTokens(fiveHour.used)} tokens / credits`);
  }
  lines.push(`- **Reset**: in ${fiveHourResetCountdown} (at ${fiveHourResetExact})`);

  if (burnRate && burnRate.status !== 'idle') {
    lines.push(`- **Velocity**: ${burnRate.formattedSummary}`);
  }
  lines.push('');

  // 2. Monthly MCP Tool Quota (if available)
  if (metrics.monthlyMcpQuota) {
    const mcp = metrics.monthlyMcpQuota;
    const mcpRemaining = Math.max(0, 100 - mcp.percentage);
    const mcpBar = renderProgressBar(mcp.percentage);
    lines.push('#### 🛠️ Monthly MCP Quota');
    lines.push(`\`${mcpBar}\` &nbsp;**${mcpRemaining}% remaining**\n`);
  }

  // 4. 30-Day Activity Section
  if (metrics.thirtyDayTokens !== undefined || metrics.thirtyDayPrompts !== undefined) {
    lines.push('#### 📊 30-Day Usage');
    if (metrics.thirtyDayTokens !== undefined) {
      lines.push(`- **Tokens Consumed**: ${formatTokens(metrics.thirtyDayTokens)}`);
    }
    if (metrics.thirtyDayPrompts !== undefined) {
      lines.push(`- **Total Prompts**: ${metrics.thirtyDayPrompts.toLocaleString()}`);
    }
    lines.push('');
  }

  // 5. Footer & Interactive Links
  lines.push('---');
  const updateTime = metrics.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const statusIcon = state.status === 'connected' ? '$(check)' : '$(warning)';
  lines.push(`${statusIcon} Last updated at ${updateTime} • [$(refresh) Refresh](command:zaiUsage.refresh) • [$(menu) Menu](command:zaiUsage.showMenu)`);

  return lines.join('\n');
}

export class TooltipBuilder {
  /**
   * Builds a rich, styled MarkdownString tooltip based on the current UsageState.
   */
  public static build(state: UsageState, burnRate?: BurnRateEstimate | undefined): vscode.MarkdownString {
    const rawMarkdown = generateTooltipMarkdown(state, Date.now(), burnRate);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscodeModule = require('vscode');
    const md = new vscodeModule.MarkdownString(rawMarkdown, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    return md;
  }
}
