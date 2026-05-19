// Re-export zod for consumers who need it
export type { z } from "zod";

// Opaque schema type that accepts any zod validator
// Using 'unknown' avoids compatibility issues across zod versions
export type ZodSchema<T = unknown> = {
  parse: (data: unknown) => T;
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: Error };
};

// ─────────────────────────────────────────────────────────────────────────────
// Capability Event Stream
// ─────────────────────────────────────────────────────────────────────────────

export type CapabilityEvent<D = any> =
  | { type: "start" }
  | { type: "token"; value: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "result"; data: D }
  | { type: "error"; error: string; code?: string }
  | { type: "end" };

export type CapabilityStream<O = any> = AsyncGenerator<CapabilityEvent<O>, void, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Capability Context
// ─────────────────────────────────────────────────────────────────────────────

export interface AIClient {
  stream(config: { prompt: string; model?: string }): AsyncGenerator<string, void, unknown>;
  complete(config: { prompt: string; model?: string }): Promise<string>;
  countTokens(text: string): number;
}

export interface MemoryStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface StreamController {
  push(event: CapabilityEvent): void;
  flush(): Promise<void>;
}

export type RunFn = <I, O>(name: string, input: I) => CapabilityStream<O>;

export interface CapabilityContext {
  ai: AIClient;
  memory: MemoryStore;
  logger: Logger;
  env: Record<string, string>;
  stream: StreamController;
  abortSignal: AbortSignal;
  run: RunFn;
  permissions: Readonly<CapabilityPermissions>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability Hooks
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityHooks<I, O> {
  onValidate?: (input: I, ctx: CapabilityContext) => Promise<void>;
  onStart?: (input: I, ctx: CapabilityContext) => Promise<void>;
  onSuccess?: (output: O, ctx: CapabilityContext) => Promise<void>;
  onError?: (error: Error, ctx: CapabilityContext) => Promise<void>;
  onFinalize?: (output: O | null, ctx: CapabilityContext) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface Capability<I = any, O = any> {
  name: string;
  version: string;
  description?: string;
  author?: string;

  schema: {
    input: ZodSchema<I>;
    output: ZodSchema<O>;
  };

  permissions?: CapabilityPermissions;
  hooks?: CapabilityHooks<I, O>;

  run(input: I, ctx: CapabilityContext): CapabilityStream<O>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityPermissions {
  ai: boolean;
  network: boolean;
  filesystem: boolean;
  git: boolean;
  memory: boolean;
}

export const DEFAULT_PERMISSIONS: Readonly<CapabilityPermissions> = Object.freeze({
  ai: false,
  network: false,
  filesystem: false,
  git: false,
  memory: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability Manifest (for marketplace / packaging)
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  entry: string;
  permissions: CapabilityPermissions;
  dependencies?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityRunRecord {
  id: string;
  capability: string;
  version: string;
  startedAt: number;
  endedAt: number;
  latency: number;
  tokens: number;
  cost: number;
  success: boolean;
  error?: string;
  inputSize: number;
  outputSize: number;
}

export type TelemetryCallback = (record: CapabilityRunRecord) => void | Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryOptions {
  strict?: boolean;
  allowOverwrite?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  timeoutMs?: number;
  maxTokens?: number;
  telemetry?: TelemetryCallback;
}

export interface ExecutorResult<O> {
  output: O;
  events: CapabilityEvent<O>[];
  record: CapabilityRunRecord;
}
