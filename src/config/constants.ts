/**
 * Application constants and configuration defaults.
 */

export const SECRET_KEY_API_KEY = 'zai.glm.apiKey';
export const SECRET_PREFIX_API_KEY = 'zai.glm.apiKey.';
export const STORAGE_KEY_ACCOUNTS = 'zai.glm.accounts';
export const STORAGE_KEY_ACTIVE_ACCOUNT_ID = 'zai.glm.activeAccountId';
export const STORAGE_PREFIX_HISTORY = 'zai.glm.history.';

export const DEFAULT_API_ENDPOINT = 'https://api.z.ai';
export const CN_API_ENDPOINT = 'https://open.bigmodel.cn';

export const QUOTA_LIMIT_PATH = '/api/monitor/usage/quota/limit';
export const MODEL_USAGE_PATH = '/api/monitor/usage/model-usage';

// Quota Unit Identifiers
export const UNIT_5_HOUR = 3;
export const UNIT_MONTHLY_MCP = 5;

// Command Identifiers
export const COMMAND_SET_API_KEY = 'zaiUsage.setApiKey';
export const COMMAND_CLEAR_API_KEY = 'zaiUsage.clearApiKey';
export const COMMAND_REFRESH = 'zaiUsage.refresh';
export const COMMAND_SHOW_MENU = 'zaiUsage.showMenu';
export const COMMAND_SWITCH_ACCOUNT = 'zaiUsage.switchAccount';
export const COMMAND_ADD_ACCOUNT = 'zaiUsage.addAccount';
export const COMMAND_REMOVE_ACCOUNT = 'zaiUsage.removeAccount';
export const COMMAND_OPEN_HISTORY = 'zaiUsage.openHistory';
export const COMMAND_EXPORT_REPORT = 'zaiUsage.exportReport';

// Defaults
export const DEFAULT_REFRESH_INTERVAL_SEC = 10;
export const MIN_REFRESH_INTERVAL_SEC = 5;
export const REQUEST_TIMEOUT_MS = 10000;
