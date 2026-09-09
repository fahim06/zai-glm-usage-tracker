/**
 * Minimal in-memory mock of the VS Code API for node:test runner environments.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');
const originalRequire = Module.prototype.require;

export const mockVscode = {
  window: {
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {}
    }),
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }),
    onDidChangeWindowState: (_listener: (e: { focused: boolean }) => void) => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: (_listener: (e: unknown) => void) => ({ dispose: () => {} })
  },
  commands: {
    executeCommand: async () => undefined,
    registerCommand: () => ({ dispose: () => {} })
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, def: unknown) => def,
      update: async () => undefined
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: (_listener: (e: unknown) => void) => ({ dispose: () => {} })
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },
  ThemeColor: class {
    constructor(public readonly id: string) {}
  },
  Disposable: class {
    constructor(private readonly callOnDispose?: () => void) {}
    dispose() {
      if (this.callOnDispose) {
        this.callOnDispose();
      }
    }
  },
  EventEmitter: class {
    private readonly listeners: ((e: unknown) => void)[] = [];
    public event = (listener: (e: unknown) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const idx = this.listeners.indexOf(listener);
          if (idx >= 0) {
            this.listeners.splice(idx, 1);
          }
        }
      };
    };
    public fire(data: unknown) {
      this.listeners.forEach((l) => l(data));
    }
    public dispose() {
      this.listeners.length = 0;
    }
  }
};

Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};
