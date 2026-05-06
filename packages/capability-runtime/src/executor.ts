import type {
  Capability,
  CapabilityContext,
  CapabilityEvent,
  CapabilityStream,
  ExecutorOptions,
  ExecutorResult,
  TelemetryCallback,
  AIClient,
  MemoryStore,
  Logger,
  CapabilityPermissions,
} from "@pr-agent/capability-types";
import { DEFAULT_PERMISSIONS } from "@pr-agent/capability-types";
import type { CapabilityRegistry } from "@pr-agent/capability-registry";
import { DefaultCapabilityContext } from "./context.js";
import { TelemetryCollector, extractTokens, estimateCost } from "./telemetry.js";

interface ExecutorDeps {
  registry: CapabilityRegistry;
  ai: AIClient;
  memory: MemoryStore;
  logger: Logger;
  env?: Record<string, string>;
  telemetry?: TelemetryCollector;
  defaultPermissions?: CapabilityPermissions;
}

export class CapabilityExecutor {
  private registry: CapabilityRegistry;
  private ai: AIClient;
  private memory: MemoryStore;
  private logger: Logger;
  private env: Record<string, string>;
  private telemetry: TelemetryCollector;
  private defaultPermissions: CapabilityPermissions;

  constructor(deps: ExecutorDeps) {
    this.registry = deps.registry;
    this.ai = deps.ai;
    this.memory = deps.memory;
    this.logger = deps.logger;
    this.env = deps.env ?? {};
    this.telemetry = deps.telemetry ?? new TelemetryCollector();
    this.defaultPermissions = deps.defaultPermissions ?? { ...DEFAULT_PERMISSIONS };
  }

  async *execute<I, O>(
    name: string,
    input: I,
    options: ExecutorOptions = {},
  ): CapabilityStream<O> {
    const cap = this.registry.getOrThrow(name);

    const startedAt = Date.now();
    const abortController = new AbortController();
    const timeoutMs = options.timeoutMs ?? 60_000;

    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      const validatedInput = cap.schema.input.parse(input);

      const permissions = { ...this.defaultPermissions, ...cap.permissions };

      const streamController = this.createStreamController();

      const executorSelf = this;
      const ctx = new DefaultCapabilityContext({
        ai: this.ai,
        memory: this.memory,
        logger: this.logger,
        env: this.env,
        stream: streamController,
        abortSignal: abortController.signal,
        permissions,
        executor: {
          execute: async function* (subName: string, subInput: any) {
            yield* executorSelf.execute(subName, subInput, {
              timeoutMs: Math.max(0, timeoutMs - (Date.now() - startedAt)),
            });
          },
        },
      });

      await this.runHook(cap.hooks?.onValidate, "validate", validatedInput, ctx);
      await this.runHook(cap.hooks?.onStart, "start", validatedInput, ctx);

      yield { type: "start" };

      const events: CapabilityEvent<O>[] = [];
      let resultData: O | null = null;

      const stream = cap.run(validatedInput, ctx);

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          throw new Error(`Capability "${name}" timed out after ${timeoutMs}ms`);
        }

        if (options.maxTokens) {
          const currentTokens = extractTokens([...events, event]);
          if (currentTokens > options.maxTokens) {
            throw new Error(
              `Capability "${name}" exceeded max token limit (${options.maxTokens})`,
            );
          }
        }

        events.push(event as CapabilityEvent<O>);
        yield event;

        if (event.type === "result") {
          resultData = event.data as O;
        }
      }

      if (cap.hooks?.onSuccess && resultData !== null) {
        await cap.hooks.onSuccess(resultData, ctx);
      }

      yield { type: "end" };

      const endedAt = Date.now();
      const tokens = extractTokens(events);
      const record = this.telemetry.createRecord(
        cap.name,
        cap.version,
        startedAt,
        endedAt,
        true,
        {
          tokens,
          cost: estimateCost(tokens),
          inputSize: JSON.stringify(validatedInput).length,
          outputSize: resultData !== null ? JSON.stringify(resultData).length : 0,
        },
      );

      await this.telemetry.emit(record);

      if (cap.hooks?.onFinalize) {
        await cap.hooks.onFinalize(resultData, ctx);
      }
    } catch (err) {
      const error = err as Error;

      if (cap.hooks?.onError) {
        const ctx = new DefaultCapabilityContext({
          ai: this.ai,
          memory: this.memory,
          logger: this.logger,
          env: this.env,
          stream: this.createStreamController(),
          abortSignal: abortController.signal,
          permissions: { ...this.defaultPermissions, ...cap.permissions },
          executor: {
            execute: async function* () {
              // no-op for error context
            },
          },
        });

        await cap.hooks.onError(error, ctx);
      }

      yield { type: "error", error: error.message };
      yield { type: "end" };

      const endedAt = Date.now();
      const record = this.telemetry.createRecord(
        cap.name,
        cap.version,
        startedAt,
        endedAt,
        false,
        { error: error.message },
      );

      await this.telemetry.emit(record);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async executeToResult<I, O>(
    name: string,
    input: I,
    options: ExecutorOptions = {},
  ): Promise<ExecutorResult<O>> {
    const events: CapabilityEvent<O>[] = [];
    let output: O | undefined;

    const stream = this.execute<I, O>(name, input, options);

    for await (const event of stream) {
      events.push(event as CapabilityEvent<O>);
      if (event.type === "result") {
        output = event.data as O;
      }
    }

    if (output === undefined) {
      throw new Error(`Capability "${name}" did not produce a result`);
    }

    const record = events.find((e) => e.type === "result")
      ? this.telemetry.createRecord(
          name,
          this.registry.getOrThrow(name).version,
          Date.now() - 1000,
          Date.now(),
          true,
          { tokens: extractTokens(events) },
        )
      : this.telemetry.createRecord(name, "unknown", Date.now() - 1000, Date.now(), false);

    return { output, events, record };
  }

  private createStreamController() {
    return {
      push: (_event: CapabilityEvent) => {},
      flush: async () => {},
    };
  }

  private async runHook<I, O>(
    hook: ((input: I, ctx: CapabilityContext) => Promise<void>) | undefined,
    name: string,
    input: I,
    ctx: CapabilityContext,
  ): Promise<void> {
    if (hook) {
      try {
        await hook(input, ctx);
      } catch (err) {
        this.logger.error(`Hook "${name}" failed: ${(err as Error).message}`);
        throw err;
      }
    }
  }
}
