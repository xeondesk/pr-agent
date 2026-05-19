import type {
  CapabilityContext,
  CapabilityPermissions,
  AIClient,
  MemoryStore,
  Logger,
  StreamController,
  CapabilityEvent,
  RunFn,
} from "@pr-agent/capability-types";

interface ContextDeps {
  ai: AIClient;
  memory: MemoryStore;
  logger: Logger;
  env: Record<string, string>;
  stream: StreamController;
  abortSignal: AbortSignal;
  permissions: CapabilityPermissions;
  executor: { execute: (name: string, input: any) => AsyncGenerator<CapabilityEvent, void, unknown> };
}

export class DefaultCapabilityContext implements CapabilityContext {
  readonly ai: AIClient;
  readonly memory: MemoryStore;
  readonly logger: Logger;
  readonly env: Record<string, string>;
  readonly stream: StreamController;
  readonly abortSignal: AbortSignal;
  readonly permissions: Readonly<CapabilityPermissions>;
  readonly run: RunFn;

  constructor(deps: ContextDeps) {
    this.ai = deps.ai;
    this.memory = deps.memory;
    this.logger = deps.logger;
    this.env = deps.env;
    this.stream = deps.stream;
    this.abortSignal = deps.abortSignal;
    this.permissions = Object.freeze({ ...deps.permissions });
    this.run = ((name: string, input: any) => deps.executor.execute(name, input)) as RunFn;
  }

  requirePermission(permission: keyof CapabilityPermissions): void {
    if (!this.permissions[permission]) {
      throw new Error(
        `Permission denied: capability does not have "${permission}" permission. ` +
        `Add it to the capability's permissions config.`,
      );
    }
  }
}
