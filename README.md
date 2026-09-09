# Z.ai GLM Usage Tracker

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=fahim.zai-glm-usage-tracker">
    <img src="https://img.shields.io/badge/version-0.3.0-blue.svg?style=flat-square" alt="Extension Version" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=fahim.zai-glm-usage-tracker">
    <img src="https://img.shields.io/badge/vscode-^1.85.0-blueviolet.svg?style=flat-square" alt="VS Code Compatibility" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  </a>
  <a href="#automated-testing">
    <img src="https://img.shields.io/badge/tests-49%20passed-brightgreen.svg?style=flat-square" alt="Test Suite" />
  </a>
  <a href="#security--telemetry">
    <img src="https://img.shields.io/badge/dependencies-0%20runtime-success.svg?style=flat-square" alt="Zero Runtime Dependencies" />
  </a>
  <a href="https://z.ai">
    <img src="https://img.shields.io/badge/GLM--4-Z.ai%20Official%20API-informational.svg?style=flat-square" alt="Z.ai Official API" />
  </a>
</p>

<p align="center">
  <strong>The definitive usage intelligence, quota tracking, and multi-account monitor for the Z.ai GLM Coding Plan in VS Code and Google Antigravity IDE.</strong>
</p>

---

## 📖 Overview

**Z.ai GLM Usage Tracker** surfaces your GLM token consumption, rolling quota limits, and remaining reset countdowns directly inside your editor. Designed with enterprise-grade reliability, it combines real-time status bar metrics, native threshold warning notifications, token burn-velocity analytics, an interactive SVG history dashboard, and one-click expense reports into a clean, zero-dependency extension.

### 🌟 Key Highlights

- ⏱️ **Real-Time Status Bar with Live Reset Timer**: Monitor 5-hour rolling quota with a live second-by-second countdown clock (e.g. `[Work] $(zap) 5h: 16% (2h 15m)`).
- ⚡ **High-Frequency 10-Second Polling**: Rapid 10s auto-refresh interval (configurable down to 5s) guarantees up-to-date metrics during intensive pairing and coding sessions.
- 🔔 **Proactive Quota Alerts**: Configurable warning (80%) and critical (95%) notifications with per-window anti-spam deduplication and automatic re-arming on quota rollover.
- 👥 **Multi-Account & Multi-Profile Support**: Seamlessly toggle between Personal, Work, and Client credentials stored securely in VS Code's encrypted `SecretStorage`.
- 🔥 **Token Burn Velocity & Time-to-Exhaustion (TTE)**: Rolling consumption rate calculations (`+X.X%/hr`) and limit depletion predictions cross-referenced against your next reset timestamp.
- 📈 **Interactive Historical Analytics Dashboard**: Built-in Webview panel featuring a responsive, lightweight Vanilla SVG line & area chart across 24h, 7d, and 30d timeframes.
- 💤 **Activity-Aware Smart Polling**: Conserves API bandwidth by automatically throttling to 5-minute intervals when the editor loses focus or is idle, instantly resuming upon user keystrokes.
- 📑 **One-Click Usage & Expense Reports**: Export formatted Markdown (`.md`) executive summaries or structured CSV datasets (`.csv`) for accounting and client billing.
- 🔒 **Enterprise Security & Zero Telemetry**: Built entirely with native `fetch` and VS Code APIs—zero external npm runtime dependencies, strict Content Security Policy (CSP), and automatic secret sanitization.

---

## 🖥️ Visual Interface

### Status Bar Display States

The status bar item adapts its icon, account pill, and color palette dynamically based on current quota utilization:

```text
[Work] $(zap) 5h: 16% (2h 15m)        ── Normal (< 80%): Subtle, clean status bar integration
[Work] $(warning) 5h: 84% (42m 10s)   ── Warning (80%–94%): Amber warning alert styling
[Work] $(error) 5h: 96% (14m 02s)     ── Critical (≥ 95%): Red error alert styling
$(sync~spin) [Work] 5h: 16% (2h 15m)  ── Refreshing: Subtle spin indicator during active API call
$(warning) [Work] 5h: 16% (Stale)     ── Degraded: Cached data retained during network backoff
```

### Rich Markdown Hover Tooltip

Hovering over the status bar item displays a comprehensive, structured breakdown:

```markdown
### Z.ai GLM Usage • [Work] 🟢 Healthy
**Plan Tier**: Pro Plan • **Account**: Work

#### ⏱️ 5-Hour Rolling Quota
[▰▰▱▱▱▱▱▱▱▱] 16% (4,480 / 28,000 tokens)
- Status: **🟢 Healthy**
- Resets in: **2h 15m** (at 2:30 PM)
- Velocity: 🔥 Burn: **+14.2%/hr** • Time to Limit: **~5h 54m** (Resets before limit)

#### 🛠️ Monthly MCP Tool Calls
[▰▰▰▱▱▱▱▱▱▱] 28% (280 / 1,000 calls)

#### 📊 30-Day Activity Aggregate
- Prompts Sent: **1,240**
- Total Tokens Consumed: **4.2M**

*Last synced: Just now • Status: Connected (Click for menu)*
```

### Interactive Historical Analytics Dashboard (`HistoryPanel`)

Accessible via Command Palette (`Z.ai GLM: View Usage History & Charts`) or Quick Pick menu:
- **KPI Summary Cards**: Real-time metrics for Current 5h Usage, Burn Velocity, 30-Day Tokens, and 30-Day Prompts.
- **Vanilla SVG Visualization**: Smooth line and area chart rendering 5-Hour quota trajectory with visual threshold guidelines at 80% and 95%.
- **Timeframe Filtering**: Instantly toggle between **Last 24 Hours**, **Last 7 Days**, and **Last 30 Days**.
- **Data Portability**: One-click **Export JSON** and **Export Report** actions.

---

## 🚀 Quick Start

### 1. Retrieve Your Z.ai API Key
1. Sign in to your [Z.ai API Management Console](https://z.ai/manage-apikey/apikey-list) (or [open.bigmodel.cn](https://open.bigmodel.cn) if using mainland China regional servers).
2. Generate and copy your API key.

### 2. Configure the Extension
1. Click the status bar item: `$(key) Z.ai: Setup API Key`, or press `Ctrl+Shift+P` / `Cmd+Shift+P` and select:
   ```text
   Z.ai GLM: Add Account
   ```
2. Paste your API key.
3. The extension validates your key with an instant pre-flight request against Z.ai's quota endpoint:
   - **Valid**: Key is encrypted and stored in `SecretStorage`. Your active tier (Lite, Pro, Max) is detected automatically.
   - **Invalid**: A diagnostic prompt appears with direct links to retry or inspect credentials.

---

## ⚙️ Configuration Reference

Customize extension behavior through VS Code Settings (`Cmd+,` / `Ctrl+,` and search for `zaiUsage`):

| Setting | Type | Default | Options / Range | Description |
|---|---|---|---|---|
| `zaiUsage.refreshInterval` | `integer` | `10` | `5` – `3600` | Automated polling interval in seconds while actively editing. Minimum is 5 seconds. |
| `zaiUsage.statusBar.showResetTime` | `boolean` | `true` | `true`, `false` | Displays live countdown timer until quota reset in the status bar (e.g. `(2h 15m)`). |
| `zaiUsage.apiEndpoint` | `string` | `"https://api.z.ai"` | `"https://api.z.ai"`, `"https://open.bigmodel.cn"` | API base URL. Use `https://open.bigmodel.cn` for China regional accounts. |
| `zaiUsage.planTier` | `string` | `"auto"` | `"auto"`, `"lite"`, `"pro"`, `"max"` | Subscription tier used for quota estimation if not directly returned by the endpoint. |
| `zaiUsage.notifications.enabled` | `boolean` | `true` | `true`, `false` | Enable or disable native VS Code notification alerts when crossing thresholds. |
| `zaiUsage.notifications.thresholds` | `number[]` | `[80, 95]` | Array of `1` – `100` | Percentage thresholds that trigger warning alerts. |
| `zaiUsage.smartPolling.enabled` | `boolean` | `true` | `true`, `false` | Automatically slow down polling during inactivity or when the editor window loses focus. |
| `zaiUsage.smartPolling.idleTimeoutMinutes` | `integer` | `5` | `1` – `60` | Inactivity duration in minutes before entering idle power-saving mode. |
| `zaiUsage.smartPolling.idleInterval` | `integer` | `300` | `60` – `1800` | Polling cadence in seconds while the editor is idle (default: 5 minutes). |
| `zaiUsage.history.retentionDays` | `integer` | `30` | `1` – `90` | Number of days of historical usage snapshots retained for charts and analytics. |

---

## ⌨️ Commands Reference

All commands are accessible via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the `Z.ai Usage` category:

| Command Title | Command ID | Icon | Description |
|---|---|:---:|---|
| **Z.ai GLM: Show Usage Menu** | `zaiUsage.showMenu` | `$(list-unordered)` | Open the full interactive Quick Pick menu with stats and quick actions. |
| **Z.ai GLM: View Usage History & Charts** | `zaiUsage.openHistory` | `$(graph)` | Launch the dedicated Webview panel with SVG charts and historical metrics. |
| **Z.ai GLM: Export Usage & Expense Report** | `zaiUsage.exportReport` | `$(file-text)` | Export detailed Markdown or CSV reports for accounting and billing. |
| **Z.ai GLM: Switch Account** | `zaiUsage.switchAccount` | `$(arrow-swap)` | Quickly switch the active Z.ai account profile. |
| **Z.ai GLM: Add Account** | `zaiUsage.addAccount` | `$(plus)` | Add and authenticate a new profile with pre-flight verification. |
| **Z.ai GLM: Remove Account** | `zaiUsage.removeAccount` | `$(trash)` | Delete a profile and purge its encrypted secrets from `SecretStorage`. |
| **Z.ai GLM: Refresh Usage Data** | `zaiUsage.refresh` | `$(refresh)` | Trigger an immediate manual quota synchronization with Z.ai. |
| **Z.ai GLM: Set API Key** | `zaiUsage.setApiKey` | `$(key)` | Prompt for and update the API key for the current account. |
| **Z.ai GLM: Clear API Key** | `zaiUsage.clearApiKey` | `$(trash)` | Remove stored API key for the active account. |

### Optional Keyboard Shortcuts

You can assign custom keybindings in your `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+z",
    "command": "zaiUsage.showMenu"
  },
  {
    "key": "ctrl+alt+h",
    "command": "zaiUsage.openHistory"
  },
  {
    "key": "ctrl+alt+r",
    "command": "zaiUsage.refresh"
  }
]
```

---

## 🛠️ Architecture & Core Components

```text
┌────────────────────────────────────────────────────────┐
│                   VS Code Status Bar                   │
│             [Work] $(zap) 5h: 16% (2h 15m)             │
└───────────▲───────────────────────────────▲────────────┘
            │                               │
┌───────────┴──────────┐       ┌────────────┴────────────┐
│   StatusBarManager   │       │     TooltipBuilder      │
│  • Dynamic 1s Ticker │       │  • Block Progress Bars  │
│  • Severity Colors   │       │  • Token Burn Breakdown │
└───────────▲──────────┘       └────────────▲────────────┘
            │                               │
┌───────────┴───────────────────────────────┴────────────┐
│                      UsageService                      │
│  • Automated 10s Polling Loop                          │
│  • Exponential Backoff & Degraded State Caching        │
└───────▲───────────────▲────────────────▲───────────────┘
        │               │                │
┌───────┴───────┐ ┌─────┴──────────┐ ┌───┴───────────────┐
│ ApiClient     │ │ HistoryService │ │ ActivityTracker   │
│ • Native Fetch│ │ • SVG Charts   │ │ • Window Focus    │
│ • Unit Normal.│ │ • CSV/MD Export│ │ • Idle Throttling │
└───────▲───────┘ └────────────────┘ └───────────────────┘
        │
┌───────┴───────────────┐
│    AccountManager     │
│ • SecretStorage       │
│ • Zero-Loss Migration │
└───────────────────────┘
```

- **`StatusBarManager`**: Manages the status bar item lifecycle, severity color shifts (`warningBackground`, `errorBackground`), dynamic account badge pills, and a lightweight 1-second client-side ticker for smooth countdowns.
- **`UsageService`**: Orchestrates high-frequency 10s polling, handles authentication errors (pausing polling on HTTP 401/403 to prevent spam), coordinates exponential backoff, and caches metrics per account.
- **`AccountManager`**: Securely handles multi-account profile state using `context.secrets` (`SecretStorage`). Supports seamless account switching and automatic migration of legacy v1 credentials.
- **`AlertService`**: Evaluates active quotas against configured thresholds (`80%`, `95%`), enforces deduplication per 5h/7d reset window, auto-re-arms on rollover, and provides one-click toast actions ("Show Menu", "Mute Alerts").
- **`HistoryService` & `HistoryPanel`**: Persists local historical snapshots, performs automated retention pruning, and renders an interactive SVG chart dashboard under a strict Content Security Policy.
- **`ActivityTracker`**: Monitors VS Code window state, active tab changes, and typing events to scale polling back to 300s during idle periods and immediately resume on interaction.
- **`ReportGenerator`**: Transforms historical snapshot records into formatted Markdown summaries or CSV spreadsheets for expense and budget accounting.

---

## 🔒 Security & Telemetry

- **Zero External Runtime Dependencies**: The bundled extension contains **0 runtime dependencies**, relying solely on Node.js built-ins and official VS Code extension APIs.
- **Encrypted Secret Storage**: API keys are stored exclusively using VS Code's encrypted `SecretStorage` API (which leverages macOS Keychain, Windows Credential Manager, or Linux libsecret). Credentials are **never** written to `settings.json`, workspace state, or disk in plaintext.
- **Content Security Policy**: The Webview dashboard utilizes strict CSP restrictions with cryptographically generated per-render nonces (`script-src 'nonce-...'`).
- **Data Privacy & Telemetry**: Zero external analytics or telemetry SDKs are included. All API calls are made directly and solely to the official Z.ai backend (`api.z.ai` or `open.bigmodel.cn`).
- **Credential Masking**: Error diagnostics and logs automatically sanitize tokens to eliminate accidental credential leakage.

---

## 🔍 Troubleshooting & FAQ

<details>
<summary><strong>Why does the status bar say "$(key) Z.ai: Setup Key"?</strong></summary>

No valid API key has been detected for the active profile. Click the item or run `Z.ai GLM: Set API Key` to paste your key.
</details>

<details>
<summary><strong>Why does the status bar show "$(error) Z.ai: Error"?</strong></summary>

Your API key was rejected by the server (HTTP 401 Unauthorized or 403 Forbidden). The extension pauses automated polling to avoid API lockouts. Click the status bar item, select **Update API Key**, and ensure you copied the key correctly.
</details>

<details>
<summary><strong>Why does the status bar say "(Stale)"?</strong></summary>

The extension encountered a temporary network dropout or API timeout. Instead of blanking out, it displays your last known cached metrics with amber warning styling and backs off retries exponentially until connectivity recovers.
</details>

<details>
<summary><strong>I am located in mainland China and requests are timing out. What should I do?</strong></summary>

Open VS Code Settings (`Cmd+,` / `Ctrl+,`), search for `zaiUsage.apiEndpoint`, and select `https://open.bigmodel.cn`.
</details>

<details>
<summary><strong>Does polling every 10 seconds consume my quota or rate limit?</strong></summary>

No. The Z.ai quota monitoring endpoint (`/api/monitor/usage/quota/limit`) is a lightweight administrative read that does not consume token quota. Furthermore, the extension automatically throttles to 300 seconds when the editor is idle or unfocused.
</details>

---

## 🧪 Development & Testing

### Prerequisites
- Node.js `>= 18.0.0`
- VS Code `>= 1.85.0` or Antigravity IDE

### Setup & Build Commands

```bash
# Clone the repository
git clone https://github.com/fahim/zai-glm-usage-tracker.git
cd zai-glm-usage-tracker

# Install development dependencies
npm install

# Typecheck with TypeScript strict mode
npm run typecheck

# Bundle in development mode
npm run compile

# Run the full automated unit test suite
npm test

# Build production minified bundle (~60 KB)
npm run package
```

### Running the Extension Locally
1. Open this repository in VS Code or Antigravity IDE.
2. Press `F5` (or choose **Run > Start Debugging**).
3. An **Extension Development Host** window will open with the extension loaded and activated.

---

## 📄 License & Disclaimer

This project is open source and available under the [MIT License](LICENSE).

*Disclaimer: This extension is an independent developer tool and is not officially affiliated with or endorsed by Zhipu AI / Z.ai. All product names, trademarks, and registered trademarks belong to their respective owners.*
