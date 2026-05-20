import { getSettings } from './config.js';

export enum LoggingFormat {
  CONSOLE = 'CONSOLE',
  JSON = 'JSON',
}

export function jsonFormat(record: Record<string, unknown>): string {
  return String(record['message'] ?? '');
}

export function analyticsFilter(record: Record<string, unknown>): boolean {
  const extra = record['extra'] as Record<string, unknown> | undefined;
  return extra?.['analytics'] === true;
}

export function invAnalyticsFilter(record: Record<string, unknown>): boolean {
  const extra = record['extra'] as Record<string, unknown> | undefined;
  return extra?.['analytics'] !== true;
}

export interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  debug: (msg: string, ...args: unknown[]) => void;
  warning: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  exception: (msg: string, ...args: unknown[]) => void;
}

const consoleLogger: Logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  warning: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
  exception: (msg: string, ...args: unknown[]) => console.error(`[EXCEPTION] ${msg}`, ...args),
};

const jsonLogger: Logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.log(JSON.stringify({ level: 'INFO', message: msg, args }));
  },
  debug: (msg: string, ...args: unknown[]) => {
    console.debug(JSON.stringify({ level: 'DEBUG', message: msg, args }));
  },
  warning: (msg: string, ...args: unknown[]) => {
    console.warn(JSON.stringify({ level: 'WARN', message: msg, args }));
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(JSON.stringify({ level: 'ERROR', message: msg, args }));
  },
  exception: (msg: string, ...args: unknown[]) => {
    console.error(JSON.stringify({ level: 'EXCEPTION', message: msg, args }));
  },
};

let currentLogger: Logger = consoleLogger;

export function setupLogger(level: string = 'INFO', fmt: LoggingFormat = LoggingFormat.CONSOLE): Logger {
  if (fmt === LoggingFormat.JSON) {
    currentLogger = jsonLogger;
  } else {
    currentLogger = consoleLogger;
  }
  return currentLogger;
}

export function getLogger(): Logger {
  return currentLogger;
}
