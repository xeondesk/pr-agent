import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SettingsManager {
  private store: Record<string, unknown> = {};
  private static instance: SettingsManager;

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  loadTomlFiles(settingsDir: string, filenames: string[]): void {
    for (const filename of filenames) {
      const filePath = path.join(settingsDir, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this._mergeToml(content);
      }
    }
  }

  private _mergeToml(content: string): void {
    const lines = content.split('\n');
    let currentSection = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toUpperCase();
        if (!this.store[currentSection]) {
          this.store[currentSection] = {};
        }
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim().toUpperCase();
      let value: unknown = trimmed.slice(eqIdx + 1).trim();
      value = this._parseTomlValue(value as string);
      if (currentSection) {
        (this.store[currentSection] as Record<string, unknown>)[key] = value;
      } else {
        this.store[key] = value;
      }
    }
  }

  private _parseTomlValue(value: string): unknown {
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      if (!inner.trim()) return [];
      return inner.split(',').map(s => this._parseTomlValue(s.trim()));
    }
    return value;
  }

  get(key: string): unknown {
    const parts = key.split('.');
    let current: unknown = this.store;
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (current && typeof current === 'object' && upper in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[upper];
      } else {
        return undefined;
      }
    }
    return current;
  }

  set(key: string, value: unknown): void {
    const parts = key.split('.');
    let current: unknown = this.store;
    for (let i = 0; i < parts.length - 1; i++) {
      const upper = parts[i].toUpperCase();
      if (!(current as Record<string, unknown>)[upper]) {
        (current as Record<string, unknown>)[upper] = {};
      }
      current = (current as Record<string, unknown>)[upper];
    }
    const lastKey = parts[parts.length - 1].toUpperCase();
    (current as Record<string, unknown>)[lastKey] = value;
  }

  get config(): Record<string, unknown> {
    return (this.store['CONFIG'] as Record<string, unknown>) ?? {};
  }

  get ignore(): Record<string, unknown> {
    return (this.store['IGNORE'] as Record<string, unknown>) ?? {};
  }

  get bad_extensions(): Record<string, unknown> {
    return (this.store['BAD_EXTENSIONS'] as Record<string, unknown>) ?? {};
  }
}

const currentDir = __dirname;
const settingsDir = path.resolve(currentDir, '../../pr_agent/settings');

const defaultSettingsFiles = [
  'configuration.toml',
  'ignore.toml',
  'generated_code_ignore.toml',
  'language_extensions.toml',
];

const settingsManager = SettingsManager.getInstance();

try {
  if (fs.existsSync(settingsDir)) {
    settingsManager.loadTomlFiles(settingsDir, defaultSettingsFiles);
  }
} catch {
  // settings dir may not exist in some setups
}

export function getSettings(useContext: boolean = false): SettingsManager {
  return settingsManager;
}

export function applySecretsManagerConfig(): void {
  try {
    const settings = getSettings();
    const secretProvider = settings.get('config.secret_provider');
    if (secretProvider === 'aws_secrets_manager') {
      applySecretsToConfig({});
    }
  } catch {
    // silently fail
  }
}

export function applySecretsToConfig(secrets: Record<string, string>): void {
  const settings = getSettings();
  for (const [key, value] of Object.entries(secrets)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      if (parts.length === 2) {
        const section = parts[0].toUpperCase();
        const setting = parts[1].toUpperCase();
        const currentValue = settings.get(`${section}.${setting}`);
        if (currentValue === undefined || currentValue === '' || currentValue === null) {
          settings.set(`${section}.${setting}`, value);
        }
      }
    }
  }
}
