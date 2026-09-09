import * as vscode from 'vscode';

export class Logger {
  private static channel?: vscode.OutputChannel;

  public static initialize(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel('Z.ai GLM Tracker');
    }
    return this.channel;
  }

  public static info(message: string, ...args: unknown[]): void {
    this.write('INFO', message, args);
  }

  public static warn(message: string, ...args: unknown[]): void {
    this.write('WARN', message, args);
  }

  public static error(message: string, error?: unknown): void {
    const errorDetails = error instanceof Error ? ` | ${error.stack || error.message}` : error ? ` | ${String(error)}` : '';
    this.write('ERROR', `${message}${errorDetails}`);
  }

  private static write(level: string, message: string, args: unknown[] = []): void {
    const timestamp = new Date().toLocaleTimeString();
    const formattedArgs = args.length > 0 ? ` ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}` : '';
    const line = `[${timestamp}] [${level}] ${message}${formattedArgs}`;

    console.log(`[Z.ai GLM Tracker] ${line}`);
    if (this.channel) {
      this.channel.appendLine(line);
    }
  }

  public static show(): void {
    this.channel?.show(true);
  }
}
