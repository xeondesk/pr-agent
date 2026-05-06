import type {
  AIClient,
  MemoryStore,
  Logger,
  CapabilityEvent,
  CapabilityPermissions,
} from "@pr-agent/capability-types";
import { DEFAULT_PERMISSIONS } from "@pr-agent/capability-types";
import type { CapabilityRegistry } from "@pr-agent/capability-registry";
import { CapabilityExecutor } from "./executor.js";
import { TelemetryCollector, globalTelemetry } from "./telemetry.js";

export interface RuntimeOptions {
  registry: CapabilityRegistry;
  ai?: AIClient;
  memory?: MemoryStore;
  logger?: Logger;
  env?: Record<string, string>;
  defaultPermissions?: CapabilityPermissions;
  timeoutMs?: number;
  maxTokens?: number;
}

function createNoOpAIClient(): AIClient {
  return {
    stream: async function* () {},
    complete: async () => "",
    countTokens: () => 0,
  };
}

function createNoOpMemoryStore(): MemoryStore {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    clear: async () => { store.clear(); },
  };
}

function createNoOpLogger(): Logger {
  return {
    info: (msg: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${msg}`, meta ?? ""),
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[WARN] ${msg}`, meta ?? ""),
    error: (msg: string, meta?: Record<string, unknown>) => console.error(`[ERROR] ${msg}`, meta ?? ""),
    debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[DEBUG] ${msg}`, meta ?? ""),
  };
}

export class CapabilityRuntime {
  private executor: CapabilityExecutor;
  readonly registry: CapabilityRegistry;
  readonly telemetry: TelemetryCollector;

  constructor(options: RuntimeOptions) {
    this.registry = options.registry;
    this.telemetry = globalTelemetry;

    this.executor = new CapabilityExecutor({
      registry: options.registry,
      ai: options.ai ?? createNoOpAIClient(),
      memory: options.memory ?? createNoOpMemoryStore(),
      logger: options.logger ?? createNoOpLogger(),
      env: options.env ?? process.env as Record<string, string>,
      telemetry: this.telemetry,
      defaultPermissions: options.defaultPermissions ?? DEFAULT_PERMISSIONS,
    });

    if (options.ai) {
      this.telemetry.register(async (record) => {
        options.logger?.debug(`Capability run: ${record.capability} (${record.latency}ms, ${record.tokens} tokens)`);
      });
    }
  }

  async *run<I, O>(name: string, input: I) {
    yield* this.executor.execute<I, O>(name, input);
  }

  async runToResult<I, O>(name: string, input: I) {
    return this.executor.executeToResult<I, O>(name, input);
  }

  listCapabilities() {
    return this.registry.list();
  }

  getCapability(name: string) {
    return this.registry.get(name);
  }
}
