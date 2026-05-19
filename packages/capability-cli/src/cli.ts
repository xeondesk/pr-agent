import type { Capability } from "@pr-agent/capability-types";
import { CapabilityRegistry, globalRegistry } from "@pr-agent/capability-registry";
import { CapabilityRuntime, globalTelemetry } from "@pr-agent/capability-runtime";

function printTable(capabilities: ReadonlyArray<Capability>): void {
  console.log("");
  console.log("Name".padEnd(30), "Version".padEnd(10), "Description");
  console.log("─".repeat(80));

  for (const cap of capabilities) {
    console.log(
      cap.name.padEnd(30),
      cap.version.padEnd(10),
      cap.description ?? "",
    );
  }

  console.log("");
  console.log(`Total: ${capabilities.length} capabilities`);
}

async function cmdList(): Promise<void> {
  const caps = globalRegistry.list();
  if (caps.length === 0) {
    console.log("No capabilities registered.");
    return;
  }
  printTable(caps);
}

async function cmdRun(name: string, inputJson: string): Promise<void> {
  const registry = new CapabilityRegistry();

  for (const cap of globalRegistry.list()) {
    registry.register(cap);
  }

  const runtime = new CapabilityRuntime({ registry });

  let input: unknown;
  try {
    input = JSON.parse(inputJson);
  } catch {
    console.error(`Invalid JSON input: ${inputJson}`);
    process.exit(1);
  }

  console.log(`Running capability "${name}"...`);

  let error: Error | null = null;
  const events: string[] = [];

  try {
    const stream = runtime.run(name, input);
    for await (const event of stream) {
      const serialized = JSON.stringify(event, null, 2);
      events.push(serialized);
      if (event.type === "token") {
        process.stdout.write(event.value);
      } else {
        console.log(`[${event.type}]`, serialized);
      }
    }
  } catch (err) {
    error = err as Error;
    console.error(`\nError: ${error.message}`);
  }

  if (!error) {
    console.log("\nDone.");
  }
}

async function cmdInfo(name: string): Promise<void> {
  const cap = globalRegistry.get(name);
  if (!cap) {
    console.error(`Capability "${name}" not found.`);
    process.exit(1);
  }

  console.log("");
  console.log(`Name:        ${cap.name}`);
  console.log(`Version:     ${cap.version}`);
  console.log(`Description: ${cap.description ?? "—"}`);
  console.log(`Author:      ${cap.author ?? "—"}`);
  console.log("");
  console.log("Permissions:");
  if (cap.permissions) {
    for (const [key, value] of Object.entries(cap.permissions)) {
      console.log(`  ${key}: ${value ? "yes" : "no"}`);
    }
  }
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "list":
    case "ls":
      await cmdList();
      break;

    case "run":
    case "exec": {
      const name = args[1];
      const input = args[2];
      if (!name || !input) {
        console.error("Usage: capability run <name> '<input-json>'");
        process.exit(1);
      }
      await cmdRun(name, input);
      break;
    }

    case "info": {
      const name = args[1];
      if (!name) {
        console.error("Usage: capability info <name>");
        process.exit(1);
      }
      await cmdInfo(name);
      break;
    }

    default:
      console.log("Usage: capability <command> [args]");
      console.log("");
      console.log("Commands:");
      console.log("  list              List registered capabilities");
      console.log("  run <name> <json> Execute a capability");
      console.log("  info <name>       Show capability details");
      console.log("");
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
