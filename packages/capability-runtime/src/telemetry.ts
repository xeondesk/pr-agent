import type { CapabilityRunRecord, TelemetryCallback, CapabilityEvent } from "@pr-agent/capability-types";

let idCounter = 0;

function generateRunId(): string {
  idCounter++;
  return `run_${Date.now()}_${idCounter.toString(36)}`;
}

export class TelemetryCollector {
  private callbacks: TelemetryCallback[] = [];

  register(cb: TelemetryCallback): void {
    this.callbacks.push(cb);
  }

  unregister(cb: TelemetryCallback): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  async emit(record: CapabilityRunRecord): Promise<void> {
    await Promise.all(this.callbacks.map((cb) => cb(record)));
  }

  createRecord(
    capability: string,
    version: string,
    startedAt: number,
    endedAt: number,
    success: boolean,
    options?: {
      tokens?: number;
      cost?: number;
      error?: string;
      inputSize?: number;
      outputSize?: number;
    },
  ): CapabilityRunRecord {
    return {
      id: generateRunId(),
      capability,
      version,
      startedAt,
      endedAt,
      latency: endedAt - startedAt,
      tokens: options?.tokens ?? 0,
      cost: options?.cost ?? 0,
      success,
      error: options?.error,
      inputSize: options?.inputSize ?? 0,
      outputSize: options?.outputSize ?? 0,
    };
  }
}

export function extractTokens(events: CapabilityEvent[]): number {
  return events.reduce((sum, e) => {
    if (e.type === "token") {
      return sum + e.value.length;
    }
    return sum;
  }, 0);
}

export function estimateCost(tokens: number, pricePer1k = 0.002): number {
  return (tokens / 1000) * pricePer1k;
}

export const globalTelemetry = new TelemetryCollector();
