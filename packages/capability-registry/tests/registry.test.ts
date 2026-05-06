import { describe, it, expect, beforeEach } from "vitest";
import { CapabilityRegistry, globalRegistry } from "../src/index.js";
import { defineCapability } from "@pr-agent/capability-sdk";
import { z } from "zod";

function makeCap(name: string, version = "1.0.0") {
  return defineCapability({
    name,
    version,
    schema: {
      input: z.object({}),
      output: z.object({}),
    },
    async *run() {
      yield { type: "result", data: {} };
    },
  });
}

describe("CapabilityRegistry", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it("registers and retrieves capabilities", () => {
    const cap = makeCap("review");
    registry.register(cap);

    expect(registry.get("review")).toBe(cap);
    expect(registry.has("review")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("lists all registered capabilities", () => {
    registry.register(makeCap("a"));
    registry.register(makeCap("b"));
    registry.register(makeCap("c"));

    expect(registry.count()).toBe(3);
    expect(registry.listNames()).toEqual(["a", "b", "c"]);
  });

  it("throws on duplicate registration by default", () => {
    registry.register(makeCap("dup"));
    expect(() => registry.register(makeCap("dup"))).toThrow("already registered");
  });

  it("allows overwrite when configured", () => {
    const registry2 = new CapabilityRegistry({ allowOverwrite: true });
    registry2.register(makeCap("x", "1.0.0"));
    registry2.register(makeCap("x", "2.0.0"));

    expect(registry2.get("x")?.version).toBe("2.0.0");
  });

  it("getOrThrow throws on missing capability", () => {
    expect(() => registry.getOrThrow("nonexistent")).toThrow("not found");
  });

  it("unregisters capabilities", () => {
    registry.register(makeCap("temp"));
    expect(registry.unregister("temp")).toBe(true);
    expect(registry.get("temp")).toBeUndefined();
    expect(registry.unregister("nonexistent")).toBe(false);
  });

  it("clears all capabilities", () => {
    registry.register(makeCap("a"));
    registry.register(makeCap("b"));
    registry.clear();
    expect(registry.count()).toBe(0);
  });

  it("searches by name and description", () => {
    registry.register(defineCapability({
      name: "code-review",
      version: "1.0.0",
      description: "Reviews code for issues",
      schema: { input: z.object({}), output: z.object({}) },
      async *run() { yield { type: "result", data: {} }; },
    }));

    registry.register(defineCapability({
      name: "security-scan",
      version: "1.0.0",
      description: "Scans for vulnerabilities",
      schema: { input: z.object({}), output: z.object({}) },
      async *run() { yield { type: "result", data: {} }; },
    }));

    expect(registry.search("review")).toHaveLength(1);
    expect(registry.search("security")).toHaveLength(1);
    expect(registry.search("nonexistent")).toHaveLength(0);
  });

  it("finds by author", () => {
    registry.register(defineCapability({
      name: "a",
      version: "1.0.0",
      author: "alice",
      schema: { input: z.object({}), output: z.object({}) },
      async *run() { yield { type: "result", data: {} }; },
    }));

    registry.register(defineCapability({
      name: "b",
      version: "1.0.0",
      author: "bob",
      schema: { input: z.object({}), output: z.object({}) },
      async *run() { yield { type: "result", data: {} }; },
    }));

    expect(registry.findByAuthor("alice")).toHaveLength(1);
    expect(registry.findByAuthor("bob")).toHaveLength(1);
    expect(registry.findByAuthor("charlie")).toHaveLength(0);
  });
});

describe("globalRegistry", () => {
  it("is a singleton registry", () => {
    expect(globalRegistry).toBeDefined();
    expect(globalRegistry.count()).toBe(0);
  });
});
