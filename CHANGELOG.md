# Changelog

All notable changes to the "Z.ai GLM Usage Tracker" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-09-09

### Feature Release (v0.3.0)

This release delivers an evolutionary update of the Z.ai GLM Usage Tracker from a single-account status bar counter into a comprehensive, multi-account usage intelligence suite with historical analytics, threshold notifications, and a refreshed status bar and tooltip interface.

### Added

- **Usage Alerts & Notification Engine** (`AlertService`):
  - Configurable quota warning thresholds (defaulting to 80% warning and 95% critical) for 5-hour rolling quota.
  - Per-reset-window deduplication to prevent notification spam while keeping developers informed.
  - Automatic re-arming when a quota window rolls over and resets.
  - Interactive notification actions: "Show Menu" (opens Quick Pick) and "Mute Alerts" (persists mute state directly into settings).
  - New settings: `zaiUsage.notifications.enabled` and `zaiUsage.notifications.thresholds`.

- **Multi-Account & Multi-API Key Support** (`AccountManager`):
  - Manage multiple Z.ai accounts (e.g. Personal, Work, Client Projects) within a single VS Code / Antigravity IDE instance.
  - Secure per-account credential storage using VS Code's encrypted `SecretStorage` (`zai.glm.apiKey.<accountId>`).
  - Seamless account switching via Command Palette (`zaiUsage.switchAccount`) and Quick Pick menu.
  - Account management commands: Add Account (`zaiUsage.addAccount`) with pre-flight API validation, and Remove Account (`zaiUsage.removeAccount`).
  - Zero-downtime, transparent migration: Automatically migrates existing v1 single API keys into the `"Default"` account upon first launch.
  - Per-account metric caching inside `UsageService` to prevent UI blanking or flickering during account switches.

- **Usage History & Charts Webview Panel** (`HistoryService`, `HistoryPanel`):
  - Interactive, dedicated webview dashboard opened via `zaiUsage.openHistory` or the Quick Pick menu (`$(graph) View Usage History & Charts`).
  - Lightweight, responsive, zero-dependency Vanilla SVG line and area chart rendering 5-Hour quota trajectory.
  - Multiple timeframe views: Last 24 Hours, Last 7 Days, and Last 30 Days.
  - Visual quota threshold reference lines at 80% (warning) and 95% (critical).
  - High-level KPI summary cards displaying Current 5h Quota, Burn Velocity, 30-Day Tokens, and 30-Day Prompts.
  - Switch active account or filter historical snapshots directly inside the Webview header.
  - One-click "Export JSON" action to save snapshot data locally.
  - Automated snapshot retention pruning configurable via `zaiUsage.history.retentionDays` (default: 30 days, capped at 1,000 points).
  - Strict Content Security Policy (CSP) with cryptographic nonce generation for optimal security.

- **Status Bar & Tooltip Visual Refresh**:
  - Live reset countdown ticker integrated directly into status bar text (e.g. `5h: 16% (2h 15m)`) with second-by-second client-side updating (`zaiUsage.statusBar.showResetTime`).
  - Accelerated 10-second default refresh interval (lowered minimum threshold to 5s) for near real-time tracking during intensive coding workflows (`zaiUsage.refreshInterval`).
  - Compact status bar account pill indicator (e.g., `[Work] $(zap) 5h: 16% (2h 15m)`).
  - State-driven status bar icons: `$(zap)` when healthy, `$(warning)` when in warning state, and `$(error)` when critical or degraded.
  - Modern Unicode progress bars in tooltips using `▰` and `▱` blocks (e.g., `[▰▰▰▰▰▱▱▱▱▱] 50%`).
  - Quota health status badges (`🟢 Healthy`, `🟡 Warning`, `🔴 Critical`) with clean typography and aligned Markdown tables.
  - Active account badge prominently rendered in tooltip headers.

- **Intelligent Polling & Activity-Aware Throttling** (`ActivityTracker`):
  - Monitors window focus (`window.onDidChangeWindowState`), editor switches, and document typing events.
  - Automatically scales back polling interval to idle cadence (default 300s) during inactivity or when VS Code is unfocused.
  - Instantly wakes up and refreshes metrics when the user resumes typing or refocuses the editor.
  - New settings: `zaiUsage.smartPolling.enabled`, `zaiUsage.smartPolling.idleTimeoutMinutes`, and `zaiUsage.smartPolling.idleInterval`.

- **Burn Rate & Time-to-Exhaustion (TTE) Predictor** (`burnRate.ts`):
  - Analyzes historical rolling snapshots to calculate quota percentage and token burn velocity per hour.
  - Extrapolates estimated time to quota limit depletion (TTE) and flags whether usage will naturally reset before exhaustion.
  - Surfaces real-time velocity in hover tooltips and displays a dedicated "Burn Velocity" KPI card in the Webview dashboard.
  - Proactive exhaustion warning alerts fired when quota is projected to deplete within 20 minutes.

- **One-Click Usage & Expense Reports** (`ReportGenerator`, `reportCommands`):
  - Command `zaiUsage.exportReport` (`Z.ai GLM: Export Usage & Expense Report`) accessible via Command Palette, Quick Pick, and Webview dashboard.
  - Generates comprehensive reports in two formats: formatted Markdown (`.md`) with tables and executive summaries, or spreadsheet-ready CSV (`.csv`).
  - Filterable by timeframe: Last 7 Days, Last 30 Days, or All Available History.
  - Export directly to a new VS Code editor tab for instant inspection or save to disk.

- **Automated Test Suite**:
  - 47 comprehensive unit tests running natively via Node's `node:test` runner, verifying alert thresholds, secret migration, history recording, activity tracking, burn rate velocity, report generation, and retry backoffs in ~70ms.

### Changed

- Status bar click action now presents enhanced Quick Pick options including "View Usage History & Charts" and "Switch Account".
- Background polling loop now targets the active account exclusively to conserve API quota and network bandwidth.
- Upgraded build pipeline with esbuild producing an optimized, self-contained bundle under 50 KB with zero external runtime dependencies.

---

## [0.1.0] - 2026-08-01

### Added
- Initial release of Z.ai GLM Usage Tracker.
- Real-time 5-hour rolling and 7-day quota monitoring in the VS Code status bar.
- Basic tooltip with ASCII progress bars and countdown timers.
- Interactive Quick Pick menu for manual refresh, settings, and credential management.
- Encrypted single API key storage via `SecretStorage`.
- Automated polling with exponential backoff on network errors.
