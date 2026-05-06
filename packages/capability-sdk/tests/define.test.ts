import { describe, it, expect } from "vitest";
import { defineCapability } from "../src/index.js";
import { z } from "zod";

describe("defineCapability", () => {
  it("creates a valid capability with minimal config", () => {
    const cap = defineCapability({
      name: "test",
      version: "1.0.0",
      schema: {
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
      },
      async *run(_input, _ctx) {
        yield { type: "start" };
        yield { type: "result", data: { result: "ok" } };
        yield { type: "end" };
      },
    });

    expect(cap.name).toBe("test");
    expect(cap.version).toBe("1.0.0");
    expect(cap.permissions).toEqual({
      ai: false,
      network: false,
      filesystem: false,
      git: false,
      memory: false,
    });
  });

  it("throws on missing name", () => {
    expect(() =>
      defineCapability({
        name: "",
        version: "1.0.0",
        schema: {
          input: z.object({}),
          output: z.object({}),
        },
        async *run() {},
      }),
    ).toThrow("Capability must have a non-empty string name");
  });

  it("throws on missing version", () => {
    expect(() =>
      defineCapability({
        name: "test",
        version: "",
        schema: {
          input: z.object({}),
          output: z.object({}),
        },
        async *run() {},
      }),
    ).toThrow("Capability must have a non-empty string version");
  });

  it("throws on missing schemas", () => {
    expect(() =>
      defineCapability({
        name: "test",
        version: "1.0.0",
        schema: undefined as any,
        async *run() {},
      }),
    ).toThrow("must define both input and output schemas");
  });

  it("accepts custom permissions", () => {
    const cap = defineCapability({
      name: "ai-cap",
      version: "1.0.0",
      permissions: { ai: true, memory: true },
      schema: {
        input: z.object({ prompt: z.string() }),
        output: z.object({ response: z.string() }),
      },
      async *run(_input, ctx) {
        ctx.requirePermission("ai");
        yield { type: "result", data: { response: "done" } };
      },
    });

    expect(cap.permissions?.ai).toBe(true);
    expect(cap.permissions?.memory).toBe(true);
    expect(cap.permissions?.network).toBe(false);
  });

  it("accepts hooks", () => {
    const calls: string[] = [];

    const cap = defineCapability({
      name: "hooked",
      version: "1.0.0",
      schema: {
        input: z.object({ x: z.number() }),
        output: z.object({ y: z.number() }),
      },
      hooks: {
        onStart: async () => { calls.push("start"); },
        onSuccess: async () => { calls.push("success"); },
        onError: async () => { calls.push("error"); },
      },
      async *run(_input, _ctx) {
        yield { type: "result", data: { y: 42 } };
      },
    });

    expect(cap.hooks?.onStart).toBeDefined();
    expect(cap.hooks?.onSuccess).toBeDefined();
    expect(cap.hooks?.onError).toBeDefined();
  });

  it("streams events correctly", async () => {
    const cap = defineCapability({
      name: "streamer",
      version: "1.0.0",
      schema: {
        input: z.object({ text: z.string() }),
        output: z.object({ output: z.string() }),
      },
      async *run(input, _ctx) {
        yield { type: "start" };
        yield { type: "token", value: "hello" };
        yield { type: "token", value: " world" };
        yield { type: "result", data: { output: input.text.toUpperCase() } };
        yield { type: "end" };
      },
    });

    const events = [];
    for await (const event of cap.run({ text: "test" }, {} as any)) {
      events.push(event);
    }

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({ type: "start" });
    expect(events[1]).toEqual({ type: "token", value: "hello" });
    expect(events[2]).toEqual({ type: "token", value: " world" });
    expect(events[3]).toEqual({ type: "result", data: { output: "TEST" } });
    expect(events[4]).toEqual({ type: "end" });
  });
});
