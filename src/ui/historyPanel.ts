import * as vscode from 'vscode';
import { HistoryService, TimeframePeriod } from '../services/historyService';
import { AccountManager } from '../services/accountManager';
import { UsageSnapshot, AccountInfo } from '../types/domain';
import { formatTokens } from '../utils/formatters';
import { calculateBurnRate } from '../utils/burnRate';
import { COMMAND_EXPORT_REPORT } from '../config/constants';

export function renderSvgChart(
  snapshots: UsageSnapshot[],
  timeframe: TimeframePeriod = 'auto',
  width: number = 720,
  height: number = 240,
  now: number = Date.now()
): string {
  if (snapshots.length === 0) {
    return `
      <div class="empty-chart">
        <p>No usage data recorded for this timeframe yet.</p>
        <span class="hint">Snapshots are saved automatically when usage metrics are refreshed.</span>
      </div>
    `;
  }

  const padding = { top: 25, right: 30, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const bottomY = (padding.top + chartH).toFixed(1);
  const xLeft = padding.left;
  const xRight = padding.left + chartW;

  const lastSnapshot = snapshots[snapshots.length - 1]!;
  const firstSnapshot = snapshots[0]!;

  const isRecent = now - lastSnapshot.timestamp < 30 * 24 * 60 * 60 * 1000 && lastSnapshot.timestamp <= now + 60000;
  const maxTime = isRecent ? now : lastSnapshot.timestamp;

  let minTime: number;
  let timeframeMs: number;

  if (timeframe === 'auto') {
    const rawSpan = Math.max(1, maxTime - firstSnapshot.timestamp);
    // Ensure at least 30 minutes for auto view so recent/sparse points are clearly readable
    timeframeMs = Math.max(30 * 60 * 1000, rawSpan);
    minTime = maxTime - timeframeMs;
  } else {
    switch (timeframe) {
      case '5h':
        timeframeMs = 5 * 60 * 60 * 1000;
        break;
      case '24h':
        timeframeMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        timeframeMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
      default:
        timeframeMs = 30 * 24 * 60 * 60 * 1000;
        break;
    }
    minTime = maxTime - timeframeMs;
  }

  const getX = (t: number) => xLeft + Math.max(0, Math.min(1, (t - minTime) / (maxTime - minTime || 1))) * chartW;
  const getY = (pct: number) => padding.top + chartH - (Math.min(100, Math.max(0, pct)) / 100) * chartH;

  const formatPointTime = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  interface PointData {
    x: number;
    y: number;
    pct: number;
    timestamp: number;
    timeStr: string;
    tokensStr?: string | undefined;
  }

  const dataPoints: PointData[] = snapshots.map((s) => ({
    x: getX(s.timestamp),
    y: getY(s.fiveHourPercentage),
    pct: s.fiveHourPercentage,
    timestamp: s.timestamp,
    timeStr: formatPointTime(s.timestamp),
    tokensStr: s.fiveHourUsed !== undefined ? `${s.fiveHourUsed.toLocaleString()} tokens` : undefined
  }));

  let solidPath = '';
  let baselinePath = '';
  let fullAreaPath = '';
  let startMarker = '';
  let singleBadge = '';

  if (dataPoints.length === 1) {
    // Single snapshot: Render a clean horizontal current-quota line across full chart
    const p = dataPoints[0]!;
    const yStr = p.y.toFixed(1);
    solidPath = `M ${xLeft.toFixed(1)} ${yStr} L ${xRight.toFixed(1)} ${yStr}`;
    fullAreaPath = `M ${xLeft.toFixed(1)} ${yStr} L ${xRight.toFixed(1)} ${yStr} L ${xRight.toFixed(1)} ${bottomY} L ${xLeft.toFixed(1)} ${bottomY} Z`;
    singleBadge = `
      <g class="chart-badge">
        <rect x="${xLeft + 12}" y="${p.y > 60 ? (p.y - 28).toFixed(1) : (p.y + 10).toFixed(1)}" width="210" height="22" rx="4" fill="var(--vscode-badge-background, #0e639c)" opacity="0.9" />
        <text x="${xLeft + 20}" y="${p.y > 60 ? (p.y - 13).toFixed(1) : (p.y + 25).toFixed(1)}" font-size="11" font-weight="600" fill="var(--vscode-badge-foreground, #ffffff)">Current Quota: ${p.pct}% • Active</text>
      </g>
    `;
  } else {
    const firstPt = dataPoints[0]!;
    const lastPt = dataPoints[dataPoints.length - 1]!;

    // Build solid path between all recorded points
    const solidSegments = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    // Extend solid path horizontally to right edge (now) at last recorded quota level
    if (lastPt.x < xRight - 1) {
      solidSegments.push(`L ${xRight.toFixed(1)} ${lastPt.y.toFixed(1)}`);
    }
    solidPath = solidSegments.join(' ');

    // Check if tracking began partway through the timeframe window
    if (firstPt.x > xLeft + 6) {
      // Baseline dashed extension from chart left to first snapshot
      baselinePath = `
        <path d="M ${xLeft.toFixed(1)} ${firstPt.y.toFixed(1)} L ${firstPt.x.toFixed(1)} ${firstPt.y.toFixed(1)}" stroke="var(--vscode-charts-blue, #3794ff)" stroke-width="2" stroke-dasharray="3 3" opacity="0.45" />
      `;
      startMarker = `
        <line x1="${firstPt.x.toFixed(1)}" y1="${padding.top}" x2="${firstPt.x.toFixed(1)}" y2="${bottomY}" stroke="var(--vscode-widget-border, rgba(255,255,255,0.18))" stroke-dasharray="2 3" />
        <text x="${Math.min(xRight - 55, firstPt.x + 4).toFixed(1)}" y="${padding.top + 12}" font-size="9" fill="var(--vscode-descriptionForeground, #888)">Start: ${firstPt.pct}%</text>
      `;
      // Area fills from xLeft across baseline, then active points, to xRight, down to bottom
      fullAreaPath = `M ${xLeft.toFixed(1)} ${firstPt.y.toFixed(1)} L ${firstPt.x.toFixed(1)} ${firstPt.y.toFixed(1)} ` +
        dataPoints.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
        ` L ${xRight.toFixed(1)} ${lastPt.y.toFixed(1)} L ${xRight.toFixed(1)} ${bottomY} L ${xLeft.toFixed(1)} ${bottomY} Z`;
    } else {
      fullAreaPath = solidSegments.join(' ') +
        ` L ${xRight.toFixed(1)} ${bottomY} L ${firstPt.x.toFixed(1)} ${bottomY} Z`;
    }
  }

  // Grid lines & Y-axis labels (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 25, 50, 75, 100];
  const gridLines = yTicks.map((val) => {
    const y = getY(val).toFixed(1);
    return `
      <line x1="${xLeft}" y1="${y}" x2="${xRight}" y2="${y}" stroke="var(--vscode-widget-border, rgba(255,255,255,0.1))" stroke-dasharray="2 4" />
      <text x="${xLeft - 8}" y="${parseFloat(y) + 4}" font-size="10" text-anchor="end" fill="var(--vscode-descriptionForeground, #888)">${val}%</text>
    `;
  }).join('');

  // Threshold lines: 80% (Warning) and 95% (Critical)
  const y80 = getY(80).toFixed(1);
  const y95 = getY(95).toFixed(1);

  // X-axis time ticks: 5 points (0%, 25%, 50%, 75%, 100%)
  const xFractions = [0, 0.25, 0.5, 0.75, 1];
  const xLabels = xFractions.map((frac) => {
    const t = minTime + frac * timeframeMs;
    const x = xLeft + frac * chartW;
    const d = new Date(t);

    let label: string;
    if (timeframe === 'auto') {
      if (frac === 1) {
        label = 'Now';
      } else if (timeframeMs <= 24 * 60 * 60 * 1000) {
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } else if (timeframe === '5h' || timeframe === '24h') {
      if (frac === 1) {
        label = 'Now';
      } else {
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      if (frac === 1) {
        label = 'Today';
      } else {
        label = `${d.getMonth() + 1}/${d.getDate()}`;
      }
    }

    const anchor = frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle';
    return `
      <line x1="${x.toFixed(1)}" y1="${bottomY}" x2="${x.toFixed(1)}" y2="${(parseFloat(bottomY) + 4).toFixed(1)}" stroke="var(--vscode-widget-border, rgba(255,255,255,0.15))" />
      <text x="${x.toFixed(1)}" y="${(height - 8).toFixed(1)}" font-size="10" text-anchor="${anchor}" fill="var(--vscode-descriptionForeground, #888)">${label}</text>
    `;
  }).join('');

  // Interactive data markers
  const step = Math.max(1, Math.ceil(dataPoints.length / 50));
  const visibleDots = dataPoints.filter((_, idx) => idx % step === 0 || idx === dataPoints.length - 1);

  const circles = visibleDots.map((p) => `
    <circle
      cx="${p.x.toFixed(1)}"
      cy="${p.y.toFixed(1)}"
      r="4"
      fill="var(--vscode-charts-blue, #3794ff)"
      stroke="var(--vscode-editor-background, #1e1e1e)"
      stroke-width="2"
      class="chart-dot"
      data-time="${p.timeStr}"
      data-pct="${p.pct}%"
      data-tokens="${p.tokensStr ?? ''}"
    >
      <title>${p.pct}% at ${p.timeStr}${p.tokensStr ? ' (' + p.tokensStr + ')' : ''}</title>
    </circle>
  `).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="usage-chart-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="fiveHourGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--vscode-charts-blue, #3794ff)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--vscode-charts-blue, #3794ff)" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Background Grid -->
      ${gridLines}

      <!-- 80% Warning Threshold Line -->
      <line x1="${xLeft}" y1="${y80}" x2="${xRight}" y2="${y80}" stroke="var(--vscode-charts-orange, #d18616)" stroke-width="1.2" stroke-dasharray="4 4" />
      <text x="${xRight}" y="${parseFloat(y80) - 4}" font-size="9" text-anchor="end" fill="var(--vscode-charts-orange, #d18616)">80% Warning</text>

      <!-- 95% Critical Threshold Line -->
      <line x1="${xLeft}" y1="${y95}" x2="${xRight}" y2="${y95}" stroke="var(--vscode-charts-red, #f85149)" stroke-width="1.2" stroke-dasharray="4 4" />
      <text x="${xRight}" y="${parseFloat(y95) - 4}" font-size="9" text-anchor="end" fill="var(--vscode-charts-red, #f85149)">95% Critical</text>

      <!-- 5-Hour Area Fill -->
      <path d="${fullAreaPath}" fill="url(#fiveHourGrad)" />

      <!-- Baseline Dashed Extension (if started mid-window) -->
      ${baselinePath}

      <!-- Start marker -->
      ${startMarker}

      <!-- 5-Hour Line -->
      <path d="${solidPath}" fill="none" stroke="var(--vscode-charts-blue, #3794ff)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Single snapshot badge -->
      ${singleBadge}

      <!-- Data markers for 5-hour line -->
      ${circles}

      <!-- X-Axis Labels -->
      ${xLabels}
    </svg>
  `;
}

export function generateHistoryWebviewHtml(
  accounts: AccountInfo[],
  activeAccount: AccountInfo | undefined,
  snapshots: UsageSnapshot[],
  timeframe: TimeframePeriod,
  cspNonce: string,
  liveMetrics?: import('../types/domain').UsageMetrics | undefined
): string {
  // If snapshots is empty but we have live metrics, synthesize an initial point at now
  let displaySnapshots = snapshots;
  if (displaySnapshots.length === 0 && liveMetrics) {
    displaySnapshots = [{
      timestamp: Date.now(),
      accountId: activeAccount?.id ?? 'default',
      fiveHourPercentage: liveMetrics.fiveHourQuota.percentage,
      ...(liveMetrics.fiveHourQuota.used !== undefined ? { fiveHourUsed: liveMetrics.fiveHourQuota.used } : {}),
      ...(liveMetrics.thirtyDayTokens !== undefined ? { thirtyDayTokens: liveMetrics.thirtyDayTokens } : {}),
      ...(liveMetrics.thirtyDayPrompts !== undefined ? { thirtyDayPrompts: liveMetrics.thirtyDayPrompts } : {})
    }];
  }

  const chartHtml = renderSvgChart(displaySnapshots, timeframe);

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
  const latestFiveHour = latestSnapshot
    ? `${latestSnapshot.fiveHourPercentage}%`
    : (liveMetrics ? `${liveMetrics.fiveHourQuota.percentage}%` : '—');

  // Check live metrics first, then scan backwards across snapshots for latest known values
  let latestTokensVal: number | undefined = liveMetrics?.thirtyDayTokens;
  let latestPromptsVal: number | undefined = liveMetrics?.thirtyDayPrompts;

  if (latestTokensVal === undefined || latestPromptsVal === undefined) {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i];
      if (latestTokensVal === undefined && s?.thirtyDayTokens !== undefined) {
        latestTokensVal = s.thirtyDayTokens;
      }
      if (latestPromptsVal === undefined && s?.thirtyDayPrompts !== undefined) {
        latestPromptsVal = s.thirtyDayPrompts;
      }
      if (latestTokensVal !== undefined && latestPromptsVal !== undefined) {
        break;
      }
    }
  }

  const latestTokens = latestTokensVal !== undefined ? formatTokens(latestTokensVal) : '—';
  const latestPrompts = latestPromptsVal !== undefined ? latestPromptsVal.toLocaleString() : '—';

  const burnRate = calculateBurnRate(snapshots, latestSnapshot?.fiveHourPercentage ?? 0);

  const accountOptionsHtml = accounts.map((acc) => {
    const isSelected = acc.id === activeAccount?.id ? 'selected' : '';
    return `<option value="${acc.id}" ${isSelected}>${acc.label}</option>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${cspNonce}';">
  <title>Z.ai GLM Usage History</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-background, #1e1e1e);
      --card-border: var(--vscode-widget-border, #333333);
      --accent-color: var(--vscode-charts-blue, #3794ff);
      --warning-color: var(--vscode-charts-orange, #d29922);
      --critical-color: var(--vscode-charts-red, #f85149);
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      background-color: var(--vscode-sideBar-background, #181818);
      color: var(--vscode-foreground, #cccccc);
      margin: 0;
      padding: 20px;
      line-height: 1.4;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 12px;
    }
    h1 {
      font-size: 18px;
      margin: 0;
      font-weight: 600;
      color: var(--vscode-foreground, #ffffff);
    }
    .account-picker-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    select {
      background: var(--vscode-dropdown-background, #252526);
      color: var(--vscode-dropdown-foreground, #cccccc);
      border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px 14px;
    }
    .stat-card .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #888888);
      margin-bottom: 6px;
    }
    .stat-card .value {
      font-size: 18px;
      font-weight: 600;
    }
    .chart-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      position: relative;
    }
    .chart-dot {
      cursor: pointer;
      transition: r 0.15s ease, fill 0.15s ease;
    }
    .chart-dot:hover {
      r: 6 !important;
      fill: #ffffff !important;
      stroke: var(--vscode-charts-blue, #3794ff) !important;
    }
    .chart-tooltip {
      position: absolute;
      pointer-events: none;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      z-index: 100;
      white-space: nowrap;
      transform: translate(-50%, -125%);
      display: none;
      line-height: 1.4;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .chart-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--vscode-foreground, #ffffff);
    }
    .chart-legend {
      display: flex;
      gap: 16px;
      font-size: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .btn-group {
      display: flex;
      gap: 6px;
    }
    .btn-toggle {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--vscode-foreground, #cccccc);
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-toggle.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      border-color: var(--vscode-button-background, #0e639c);
    }
    .usage-chart-svg {
      width: 100%;
      height: auto;
      max-height: 280px;
      overflow: visible;
    }
    .empty-chart {
      text-align: center;
      padding: 48px 16px;
      color: var(--vscode-descriptionForeground, #888);
    }
    .empty-chart p {
      font-size: 15px;
      margin: 0 0 8px 0;
    }
    .empty-chart .hint {
      font-size: 12px;
    }
    .footer-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
    }
    button.action-btn {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    button.action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="title-group">
      <h1>⚡ Z.ai GLM Usage Trends</h1>
    </div>
    <div class="account-picker-group">
      <label for="accountSelect" style="font-size: 12px; color: var(--vscode-descriptionForeground);">Account:</label>
      <select id="accountSelect">
        ${accountOptionsHtml || '<option value="">No Accounts</option>'}
      </select>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">Current 5h Quota</div>
      <div class="value" id="valFiveHour" style="color: var(--accent-color);">${latestFiveHour}</div>
    </div>
    <div class="stat-card">
      <div class="label">Burn Velocity</div>
      <div class="value" id="valBurnRate" style="font-size: 13px; font-weight: 600;">${burnRate.formattedSummary}</div>
    </div>
    <div class="stat-card">
      <div class="label">30-Day Tokens</div>
      <div class="value" id="valTokens" title="${latestTokensVal !== undefined ? latestTokensVal.toLocaleString() + ' tokens' : 'Awaiting API model usage data'}">${latestTokens}</div>
      ${latestTokensVal === undefined ? '<div style="font-size: 10px; color: var(--vscode-descriptionForeground, #888); margin-top: 4px;">Awaiting API data</div>' : ''}
    </div>
    <div class="stat-card">
      <div class="label">30-Day Prompts</div>
      <div class="value" id="valPrompts" title="${latestPromptsVal !== undefined ? latestPromptsVal.toLocaleString() + ' prompts' : 'Awaiting API model usage data'}">${latestPrompts}</div>
      ${latestPromptsVal === undefined ? '<div style="font-size: 10px; color: var(--vscode-descriptionForeground, #888); margin-top: 4px;">Awaiting API data</div>' : ''}
    </div>
  </div>

  <div class="chart-container">
    <div id="chartTooltip" class="chart-tooltip"></div>
    <div class="chart-header">
      <div class="chart-title">Quota Usage Over Time</div>
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot" style="background: var(--accent-color);"></span>
          <span>5-Hour Rolling %</span>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn-toggle ${timeframe === 'auto' ? 'active' : ''}" id="btnAuto">Auto</button>
        <button class="btn-toggle ${timeframe === '5h' ? 'active' : ''}" id="btn5h">5 Hours</button>
        <button class="btn-toggle ${timeframe === '24h' ? 'active' : ''}" id="btn24h">24 Hours</button>
        <button class="btn-toggle ${timeframe === '7d' ? 'active' : ''}" id="btn7d">7 Days</button>
        <button class="btn-toggle ${timeframe === '30d' ? 'active' : ''}" id="btn30d">30 Days</button>
      </div>
    </div>

    <div id="chartContent">
      ${chartHtml}
    </div>
  </div>

  <div class="footer-actions">
    <div id="footerCount">Showing ${snapshots.length} recorded snapshots in timeframe</div>
    <div style="display: flex; gap: 8px;">
      <button class="action-btn" id="refreshBtn">🔄 Refresh Data</button>
      <button class="action-btn" id="exportReportBtn">📄 Export Report</button>
      <button class="action-btn" id="copyJsonBtn">📋 Export JSON</button>
    </div>
  </div>

  <script nonce="${cspNonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('btnAuto')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setTimeframe', timeframe: 'auto' });
    });
    document.getElementById('btn5h')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setTimeframe', timeframe: '5h' });
    });
    document.getElementById('btn24h')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setTimeframe', timeframe: '24h' });
    });
    document.getElementById('btn7d')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setTimeframe', timeframe: '7d' });
    });
    document.getElementById('btn30d')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setTimeframe', timeframe: '30d' });
    });

    document.getElementById('accountSelect')?.addEventListener('change', (e) => {
      const accountId = e.target.value;
      vscode.postMessage({ command: 'switchAccount', accountId });
    });

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    document.getElementById('exportReportBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportReport' });
    });

    document.getElementById('copyJsonBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportJson' });
    });

    function attachDotListeners() {
      const tooltip = document.getElementById('chartTooltip');
      const container = document.querySelector('.chart-container');
      const dots = document.querySelectorAll('.chart-dot');

      dots.forEach(dot => {
        dot.addEventListener('mouseenter', () => {
          const time = dot.getAttribute('data-time');
          const pct = dot.getAttribute('data-pct');
          const tokens = dot.getAttribute('data-tokens');
          if (tooltip && container) {
            tooltip.innerHTML = '<strong>5h Quota:</strong> ' + pct + '<br/><span style="color:var(--vscode-descriptionForeground)">' + time + '</span>' + (tokens ? '<br/>' + tokens : '');
            tooltip.style.display = 'block';

            const dotRect = dot.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            let leftPos = dotRect.left - containerRect.left + dotRect.width / 2;
            let transformX = '-50%';
            if (leftPos < 70) {
              transformX = '0%';
            } else if (leftPos > containerRect.width - 70) {
              transformX = '-100%';
            }
            tooltip.style.transform = 'translate(' + transformX + ', -110%)';
            tooltip.style.left = leftPos + 'px';
            tooltip.style.top = (dotRect.top - containerRect.top) + 'px';
          }
        });
        dot.addEventListener('mouseleave', () => {
          if (tooltip) tooltip.style.display = 'none';
        });
      });
    }

    attachDotListeners();

    // Signal readiness for in-place streaming updates
    vscode.postMessage({ command: 'webviewReady' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'updateContent') {
        const chartWrapper = document.getElementById('chartContent');
        if (chartWrapper) {
          chartWrapper.innerHTML = msg.chartSvg;
        }

        const val5h = document.getElementById('valFiveHour');
        if (val5h) val5h.textContent = msg.latestFiveHour;

        const valBurn = document.getElementById('valBurnRate');
        if (valBurn) valBurn.textContent = msg.burnSummary;

        const valTok = document.getElementById('valTokens');
        if (valTok) valTok.textContent = msg.latestTokens;

        const valProm = document.getElementById('valPrompts');
        if (valProm) valProm.textContent = msg.latestPrompts;

        const footer = document.getElementById('footerCount');
        if (footer) footer.textContent = msg.snapshotsCountText;

        // Update button active state
        ['auto', '5h', '24h', '7d', '30d'].forEach(tf => {
          const btn = document.getElementById('btn' + tf.charAt(0).toUpperCase() + tf.slice(1));
          if (btn) {
            if (tf === msg.timeframe) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          }
        });

        attachDotListeners();
      }
    });
  </script>
</body>
</html>`;
}

export class HistoryPanel implements vscode.Disposable {
  public static currentPanel: HistoryPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private currentTimeframe: TimeframePeriod = 'auto';
  private isWebviewReady: boolean = false;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly historyService: HistoryService,
    private readonly accountManager: AccountManager,
    private readonly onRefreshRequested: () => Promise<void>,
    private readonly getCurrentMetrics?: () => import('../types/domain').UsageMetrics | undefined
  ) {
    this.panel = panel;

    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'webviewReady': {
            this.isWebviewReady = true;
            break;
          }
          case 'setTimeframe': {
            this.currentTimeframe = message.timeframe;
            this.update();
            break;
          }
          case 'switchAccount': {
            if (message.accountId) {
              await this.accountManager.switchAccount(message.accountId);
              this.update();
            }
            break;
          }
          case 'refresh': {
            await this.onRefreshRequested();
            this.update();
            break;
          }
          case 'exportReport': {
            await vscode.commands.executeCommand(COMMAND_EXPORT_REPORT);
            break;
          }
          case 'exportJson': {
            const active = this.accountManager.getActiveAccount();
            const snapshots = this.historyService.getSnapshots(active?.id ?? 'default', this.currentTimeframe);
            const json = JSON.stringify(snapshots, null, 2);
            await vscode.env.clipboard.writeText(json);
            vscode.window.showInformationMessage(`Copied ${snapshots.length} usage snapshots to clipboard as JSON.`);
            break;
          }
        }
      },
      null,
      this.disposables
    );

    // Re-render when history or active account changes
    this.disposables.push(
      this.historyService.onDidChangeHistory(() => this.update()),
      this.accountManager.onDidChangeActiveAccount(() => this.update()),
      this.accountManager.onDidChangeAccounts(() => this.update())
    );
  }

  public static createOrShow(
    historyService: HistoryService,
    accountManager: AccountManager,
    onRefreshRequested: () => Promise<void>,
    getCurrentMetrics?: () => import('../types/domain').UsageMetrics | undefined
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (HistoryPanel.currentPanel) {
      HistoryPanel.currentPanel.panel.reveal(column);
      HistoryPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'zaiUsage.historyView',
      'Z.ai GLM Usage History',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    HistoryPanel.currentPanel = new HistoryPanel(
      panel,
      historyService,
      accountManager,
      onRefreshRequested,
      getCurrentMetrics
    );
  }

  public update(): void {
    const activeAccount = this.accountManager.getActiveAccount();
    const accounts = this.accountManager.getAccounts();
    const snapshots = this.historyService.getSnapshots(
      activeAccount?.id ?? 'default',
      this.currentTimeframe
    );
    const liveMetrics = this.getCurrentMetrics ? this.getCurrentMetrics() : undefined;

    let displaySnapshots = snapshots;
    if (displaySnapshots.length === 0 && liveMetrics) {
      displaySnapshots = [{
        timestamp: Date.now(),
        accountId: activeAccount?.id ?? 'default',
        fiveHourPercentage: liveMetrics.fiveHourQuota.percentage,
        ...(liveMetrics.fiveHourQuota.used !== undefined ? { fiveHourUsed: liveMetrics.fiveHourQuota.used } : {}),
        ...(liveMetrics.thirtyDayTokens !== undefined ? { thirtyDayTokens: liveMetrics.thirtyDayTokens } : {}),
        ...(liveMetrics.thirtyDayPrompts !== undefined ? { thirtyDayPrompts: liveMetrics.thirtyDayPrompts } : {})
      }];
    }

    const chartSvg = renderSvgChart(displaySnapshots, this.currentTimeframe);
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
    const latestFiveHour = latestSnapshot
      ? `${latestSnapshot.fiveHourPercentage}%`
      : (liveMetrics ? `${liveMetrics.fiveHourQuota.percentage}%` : '—');

    let latestTokensVal: number | undefined = liveMetrics?.thirtyDayTokens;
    let latestPromptsVal: number | undefined = liveMetrics?.thirtyDayPrompts;

    if (latestTokensVal === undefined || latestPromptsVal === undefined) {
      for (let i = snapshots.length - 1; i >= 0; i--) {
        const s = snapshots[i];
        if (latestTokensVal === undefined && s?.thirtyDayTokens !== undefined) {
          latestTokensVal = s.thirtyDayTokens;
        }
        if (latestPromptsVal === undefined && s?.thirtyDayPrompts !== undefined) {
          latestPromptsVal = s.thirtyDayPrompts;
        }
        if (latestTokensVal !== undefined && latestPromptsVal !== undefined) {
          break;
        }
      }
    }

    const burnRate = calculateBurnRate(snapshots, latestSnapshot?.fiveHourPercentage ?? 0);

    // If webview is initialized and ready, send message for flicker-free in-place DOM update
    if (this.isWebviewReady) {
      this.panel.webview.postMessage({
        command: 'updateContent',
        chartSvg,
        timeframe: this.currentTimeframe,
        latestFiveHour,
        burnSummary: burnRate.formattedSummary,
        latestTokens: latestTokensVal !== undefined ? formatTokens(latestTokensVal) : '—',
        latestPrompts: latestPromptsVal !== undefined ? latestPromptsVal.toLocaleString() : '—',
        snapshotsCountText: `Showing ${snapshots.length} recorded snapshots in timeframe`
      });
      return;
    }

    const nonce = Math.random().toString(36).substring(2, 15);
    this.panel.webview.html = generateHistoryWebviewHtml(
      accounts,
      activeAccount,
      snapshots,
      this.currentTimeframe,
      nonce,
      liveMetrics
    );
  }

  public dispose(): void {
    HistoryPanel.currentPanel = undefined;
    this.isWebviewReady = false;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
