import type { Capability, CapabilityHooks, CapabilityPermissions, CapabilityStream, CapabilityContext, ZodSchema } from "@pr-agent/capability-types";
import { DEFAULT_PERMISSIONS } from "@pr-agent/capability-types";

export interface CapabilityConfig<I = any, O = any> {
  name: string;
  version: string;
  description?: string;
  author?: string;
  schema: {
    input: ZodSchema<I>;
    output: ZodSchema<O>;
  };
  permissions?: Partial<CapabilityPermissions>;
  hooks?: CapabilityHooks<I, O>;
  run(input: I, ctx: CapabilityContext): CapabilityStream<O>;
}

export function defineCapability<I = any, O = any>(config: CapabilityConfig<I, O>): Capability<I, O> {
  const { name, version, description, author, schema, permissions, hooks, run } = config;

  if (!name || typeof name !== "string") {
    throw new Error("Capability must have a non-empty string name");
  }

  if (!version || typeof version !== "string") {
    throw new Error("Capability must have a non-empty string version");
  }

  if (!schema || !schema.input || !schema.output) {
    throw new Error(`Capability "${name}" must define both input and output schemas`);
  }

  const resolvedPermissions: CapabilityPermissions = {
    ...DEFAULT_PERMISSIONS,
    ...permissions,
  };

  return {
    name,
    version,
    description,
    author,
    schema,
    permissions: resolvedPermissions,
    hooks,
    run,
  };
}
