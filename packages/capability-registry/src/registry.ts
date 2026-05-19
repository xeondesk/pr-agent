import type { Capability, RegistryOptions } from "@pr-agent/capability-types";

export class CapabilityRegistry {
  private map = new Map<string, Capability>();
  private strict: boolean;
  private allowOverwrite: boolean;

  constructor(options: RegistryOptions = {}) {
    this.strict = options.strict ?? false;
    this.allowOverwrite = options.allowOverwrite ?? false;
  }

  register(cap: Capability): void {
    if (!cap.name) {
      throw new Error("Cannot register a capability without a name");
    }

    const existing = this.map.get(cap.name);
    if (existing) {
      if (!this.allowOverwrite) {
        throw new Error(
          `Capability "${cap.name}" is already registered (v${existing.version}). ` +
          `Set allowOverwrite=true to replace it.`,
        );
      }
    }

    this.map.set(cap.name, cap);
  }

  unregister(name: string): boolean {
    return this.map.delete(name);
  }

  get(name: string): Capability | undefined {
    return this.map.get(name);
  }

  getOrThrow(name: string): Capability {
    const cap = this.get(name);
    if (!cap) {
      throw new Error(`Capability "${name}" not found in registry`);
    }
    return cap;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): ReadonlyArray<Capability> {
    return [...this.map.values()];
  }

  listNames(): string[] {
    return [...this.map.keys()];
  }

  count(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  findByAuthor(author: string): Capability[] {
    return this.list().filter((cap) => cap.author === author);
  }

  search(query: string): Capability[] {
    const lower = query.toLowerCase();
    return this.list().filter(
      (cap) =>
        cap.name.toLowerCase().includes(lower) ||
        cap.description?.toLowerCase().includes(lower),
    );
  }
}

export const globalRegistry = new CapabilityRegistry({ allowOverwrite: true });
