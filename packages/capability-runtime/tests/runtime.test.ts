import { describe, it, expect, beforeEach } from "vitest";
import { defineCapability } from "@pr-agent/capability-sdk";
import { CapabilityRegistry } from "@pr-agent/capability-registry";
import {
  CapabilityExecutor,
  CapabilityRuntime,
  PermissionChecker,
  mergePermissions,
  restrictPermissions,
  TelemetryCollector,
  extractTokens,
  estimateCost,
  globalTelemetry,
} from "../src/index.js";
import { z } from "zod";
import type {
  AIClient,
  MemoryStore,
  Logger,
  CapabilityRunRecord,
  CapabilityPermissions,
} from "@pr-agent/capability-types";
import { DEFAULT_PERMISSIONS } from "@pr-agent/capability-types";

function createMockAi(): AIClient {
  return {
    stream: async function* (config: { prompt: string }) {
      const words = config.prompt.split(" ");
      for (const word of words) {
        yield word + " ";
      }
    },
    complete: async () => "mock response",
    countTokens: (text: string) => Math.ceil(text.length / 4),
  };
}

function createMockMemory(): MemoryStore {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    clear: async () => { store.clear(); },
  };
}

function createMockLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

describe("PermissionChecker", () => {
  it("checks individual permissions", () => {
    const checker = new PermissionChecker({ ...DEFAULT_PERMISSIONS, ai: true });
    expect(() => checker.check("ai")).not.toThrow();
    expect(() => checker.check("network")).toThrow();
  });

  it("checks multiple permissions", () => {
    const checker = new PermissionChecker({
      ...DEFAULT_PERMISSIONS,
      ai: true,
      memory: true,
    });
    expect(() => checker.checkAll(["ai", "memory"])).not.toThrow();
    expect(() => checker.checkAll(["ai", "network"])).toThrow();
  });

  it("has method works", () => {
    const checker = new PermissionChecker({ ...DEFAULT_PERMISSIONS, git: true });
    expect(checker.has("git")).toBe(true);
    expect(checker.has("ai")).toBe(false);
  });
});

describe("Permission helpers", () => {
  it("mergePermissions intersects permissions", () => {
    const base: CapabilityPermissions = { ...DEFAULT_PERMISSIONS, ai: true, network: true };
    const requested: CapabilityPermissions = { ...DEFAULT_PERMISSIONS, ai: true, memory: true };

    const merged = mergePermissions(base, requested);
    expect(merged.ai).toBe(true);
    expect(merged.network).toBe(false);
    expect(merged.memory).toBe(false);
  });

  it("restrictPermissions reduces permissions", () => {
    const base: CapabilityPermissions = { ...DEFAULT_PERMISSIONS, ai: true, network: true, memory: true };
    const restricted = restrictPermissions(base, { network: false });

    expect(restricted.ai).toBe(true);
    expect(restricted.network).toBe(false);
    expect(restricted.memory).toBe(true);
  });
});

describe("TelemetryCollector", () => {
  it("collects and emits telemetry", async () => {
    const collector = new TelemetryCollector();
    const records: CapabilityRunRecord[] = [];

    collector.register((record) => {
      records.push(record);
    });

    const record = collector.createRecord("test", "1.0.0", 1000, 1500, true, {
      tokens: 100,
      cost: 0.01,
    });

    await collector.emit(record);

    expect(records).toHaveLength(1);
    expect(records[0].capability).toBe("test");
    expect(records[0].latency).toBe(500);
    expect(records[0].tokens).toBe(100);
    expect(records[0].success).toBe(true);
  });

  it("extracts tokens from events", () => {
    const events = [
      { type: "start" as const },
      { type: "token" as const, value: "hello" },
      { type: "token" as const, value: " world" },
      { type: "result" as const, data: {} },
      { type: "end" as const },
    ];

    expect(extractTokens(events)).toBe(11);
  });

  it("estimates cost from tokens", () => {
    expect(estimateCost(1000)).toBeCloseTo(0.002);
    expect(estimateCost(5000, 0.01)).toBeCloseTo(0.05);
  });
});

describe("CapabilityExecutor", () => {
  let registry: CapabilityRegistry;
  let executor: CapabilityExecutor;

  beforeEach(() => {
    registry = new CapabilityRegistry();

    registry.register(defineCapability({
      name: "echo",
      version: "1.0.0",
      schema: {
        input: z.object({ message: z.string() }),
        output: z.object({ echoed: z.string() }),
      },
      async *run(input, _ctx) {
        yield { type: "start" };
        yield { type: "result", data: { echoed: input.message } };
        yield { type: "end" };
      },
    }));

    registry.register(defineCapability({
      name: "failing",
      version: "1.0.0",
      schema: {
        input: z.object({}),
        output: z.object({}),
      },
      async *run() {
        throw new Error("intentional failure");
      },
    }));

    executor = new CapabilityExecutor({
      registry,
      ai: createMockAi(),
      memory: createMockMemory(),
      logger: createMockLogger(),
    });
  });

  it("executes a capability and yields events", async () => {
    const events = [];
    for await (const event of executor.execute("echo", { message: "hello" })) {
      events.push(event);
    }

    expect(events).toHaveLength(5);
    expect(events[0].type).toBe("start");
    expect(events[1].type).toBe("start");
    expect(events[2].type).toBe("result");
    expect(events[3].type).toBe("end");
    expect(events[4].type).toBe("end");
  });

  it("validates input schema", async () => {
    await expect(async () => {
      const stream = executor.execute("echo", { message: 123 });
      for await (const _ of stream) {}
    }).rejects.toThrow();
  });

  it("throws when capability not found", async () => {
    await expect(async () => {
      const stream = executor.execute("nonexistent", {});
      for await (const _ of stream) {}
    }).rejects.toThrow("not found");
  });

  it("handles errors and emits error event", async () => {
    const events = [];
    await expect(async () => {
      for await (const event of executor.execute("failing", {})) {
        events.push(event);
      }
    }).rejects.toThrow("intentional failure");

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("executeToResult returns output and events", async () => {
    const result = await executor.executeToResult("echo", { message: "test" });

    expect(result.output).toEqual({ echoed: "test" });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.record.success).toBe(true);
  });
});

describe("CapabilityRuntime", () => {
  let runtime: CapabilityRuntime;

  beforeEach(() => {
    const registry = new CapabilityRegistry();

    registry.register(defineCapability({
      name: "greet",
      version: "1.0.0",
      description: "Greets a user",
      schema: {
        input: z.object({ name: z.string() }),
        output: z.object({ greeting: z.string() }),
      },
      async *run(input, _ctx) {
        yield { type: "start" };
        yield { type: "token", value: "Hello, " };
        yield { type: "token", value: input.name };
        yield { type: "token", value: "!" };
        yield { type: "result", data: { greeting: `Hello, ${input.name}!` } };
        yield { type: "end" };
      },
    }));

    runtime = new CapabilityRuntime({
      registry,
      ai: createMockAi(),
      memory: createMockMemory(),
      logger: createMockLogger(),
    });
  });

  it("runs a capability via runtime", async () => {
    const events = [];
    for await (const event of runtime.run("greet", { name: "World" })) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "start")).toBe(true);
    expect(events.some((e) => e.type === "token")).toBe(true);
    expect(events.some((e) => e.type === "end")).toBe(true);
  });

  it("runs to result via runtime", async () => {
    const result = await runtime.runToResult("greet", { name: "Alice" });
    expect(result.output).toEqual({ greeting: "Hello, Alice!" });
  });

  it("lists capabilities", () => {
    const caps = runtime.listCapabilities();
    expect(caps).toHaveLength(1);
    expect(caps[0].name).toBe("greet");
  });
});

describe("Capability Composition (ctx.run)", () => {
  it("composes multiple capabilities", async () => {
    const registry = new CapabilityRegistry();

    registry.register(defineCapability({
      name: "step-a",
      version: "1.0.0",
      schema: {
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
      },
      async *run(input, _ctx) {
        yield { type: "result", data: { result: `a:${input.value}` } };
      },
    }));

    registry.register(defineCapability({
      name: "step-b",
      version: "1.0.0",
      schema: {
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
      },
      async *run(input, _ctx) {
        yield { type: "result", data: { result: `b:${input.value}` } };
      },
    }));

    registry.register(defineCapability({
      name: "pipeline",
      version: "1.0.0",
      schema: {
        input: z.object({ value: z.string() }),
        output: z.object({ results: z.array(z.string()) }),
      },
      async *run(input, ctx) {
        yield { type: "start" };

        const results: string[] = [];
        for await (const event of ctx.run("step-a", { value: input.value })) {
          if (event.type === "result") {
            results.push(event.data.result);
          }
        }
        for await (const event of ctx.run("step-b", { value: input.value })) {
          if (event.type === "result") {
            results.push(event.data.result);
          }
        }

        yield { type: "result", data: { results } };
        yield { type: "end" };
      },
    }));

    const executor = new CapabilityExecutor({
      registry,
      ai: createMockAi(),
      memory: createMockMemory(),
      logger: createMockLogger(),
    });

    const result = await executor.executeToResult("pipeline", { value: "test" });
    expect(result.output.results).toEqual(["a:test", "b:test"]);
  });
});

describe("Lifecycle Hooks", () => {
  it("calls hooks in order", async () => {
    const calls: string[] = [];

    const registry = new CapabilityRegistry();

    registry.register(defineCapability({
      name: "hooked",
      version: "1.0.0",
      schema: {
        input: z.object({ x: z.number() }),
        output: z.object({ y: z.number() }),
      },
      hooks: {
        onValidate: async () => { calls.push("validate"); },
        onStart: async () => { calls.push("start"); },
        onSuccess: async () => { calls.push("success"); },
        onFinalize: async () => { calls.push("finalize"); },
      },
      async *run() {
        calls.push("run");
        yield { type: "result", data: { y: 42 } };
      },
    }));

    const executor = new CapabilityExecutor({
      registry,
      ai: createMockAi(),
      memory: createMockMemory(),
      logger: createMockLogger(),
    });

    for await (const _ of executor.execute("hooked", { x: 1 })) {}

    expect(calls).toEqual(["validate", "start", "run", "success", "finalize"]);
  });
});
