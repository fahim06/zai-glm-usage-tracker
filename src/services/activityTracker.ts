import * as vscode from 'vscode';
import { SettingsManager, ExtensionSettings } from '../config/settings';
import { Logger } from '../utils/logger';

export interface ActivityStateEvent {
  isIdle: boolean;
}

export class ActivityTracker implements vscode.Disposable {
  private readonly _onDidChangeActivityState = new vscode.EventEmitter<ActivityStateEvent>();
  public readonly onDidChangeActivityState: vscode.Event<ActivityStateEvent> = this._onDidChangeActivityState.event;

  private _isIdle: boolean = false;
  private _isWindowFocused: boolean = true;
  private idleTimer?: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly getSettings: () => ExtensionSettings;

  constructor(customSettings?: () => ExtensionSettings) {
    this.getSettings = customSettings ?? (() => SettingsManager.getSettings());

    // 1. Listen for window focus changes
    this.disposables.push(
      vscode.window.onDidChangeWindowState((e) => {
        this.handleWindowStateChanged(e.focused);
      })
    );

    // 2. Listen for document changes (typing/coding)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(() => {
        this.recordActivity();
      })
    );

    // 3. Listen for active editor changes (switching tabs/files)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.recordActivity();
      })
    );

    this.resetIdleTimer();
  }

  public get isIdle(): boolean {
    const settings = this.getSettings();
    if (!settings.smartPollingEnabled) {
      return false;
    }
    return this._isIdle || !this._isWindowFocused;
  }

  public get isWindowFocused(): boolean {
    return this._isWindowFocused;
  }

  /**
   * Records user activity (typing, switching tabs, focusing window).
   * Resets the idle countdown and transitions from idle to active if necessary.
   */
  public recordActivity(): void {
    const wasIdle = this.isIdle;
    this._isIdle = false;

    this.resetIdleTimer();

    if (wasIdle && !this.isIdle) {
      Logger.info('ActivityTracker: User resumed activity. Exiting idle mode.');
      this._onDidChangeActivityState.fire({ isIdle: false });
    }
  }

  public handleWindowStateChanged(focused: boolean): void {
    const wasIdle = this.isIdle;
    this._isWindowFocused = focused;

    if (focused) {
      this._isIdle = false;
      this.resetIdleTimer();
      if (wasIdle && !this.isIdle) {
        Logger.info('ActivityTracker: User resumed activity (window focused). Exiting idle mode.');
        this._onDidChangeActivityState.fire({ isIdle: false });
      }
    } else {
      Logger.info('ActivityTracker: VS Code window lost focus.');
      if (!wasIdle && this.isIdle) {
        this._onDidChangeActivityState.fire({ isIdle: true });
      }
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }

    const settings = this.getSettings();
    if (!settings.smartPollingEnabled) {
      return;
    }

    const timeoutMs = settings.smartPollingIdleTimeoutMinutes * 60 * 1000;
    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout();
    }, timeoutMs);
  }

  private handleIdleTimeout(): void {
    const wasIdle = this.isIdle;
    this._isIdle = true;

    if (!wasIdle && this.isIdle) {
      Logger.info('ActivityTracker: Inactivity timeout reached. Entering idle mode.');
      this._onDidChangeActivityState.fire({ isIdle: true });
    }
  }

  public dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    this._onDidChangeActivityState.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
