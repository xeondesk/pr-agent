import type { CapabilityEvent, CapabilityStream } from "@pr-agent/capability-types";

export class EventStream {
  private buffer: CapabilityEvent[] = [];
  private closed = false;

  push(event: CapabilityEvent): void {
    if (this.closed) {
      throw new Error("Cannot push to a closed stream");
    }
    this.buffer.push(event);
  }

  async flush(controller: ReadableStreamDefaultController<CapabilityEvent>): Promise<void> {
    for (const event of this.buffer) {
      controller.enqueue(event);
    }
    this.buffer = [];
  }

  close(): void {
    this.closed = true;
  }

  get events(): ReadonlyArray<CapabilityEvent> {
    return [...this.buffer];
  }

  static createGenerator<I, O>(
    fn: (stream: EventStream, abortSignal: AbortSignal) => Promise<void>,
  ): CapabilityStream<O> {
    const stream = new EventStream();
    const abortController = new AbortController();

    return (async function* generator() {
      const promise = fn(stream, abortController.signal);

      let done = false;
      const checkInterval = setInterval(() => {
        if (stream.events.length > 0 || done) {
          clearInterval(checkInterval);
        }
      }, 10);

      void promise.finally(() => {
        done = true;
        stream.close();
      });

      let index = 0;
      while (!done || index < stream.events.length) {
        while (index < stream.events.length) {
          yield stream.events[index] as CapabilityEvent<O>;
          index++;
        }
        if (!done) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      clearInterval(checkInterval);
    })();
  }
}

export function createStream<I, O>(
  fn: (stream: EventStream, abortSignal: AbortSignal) => Promise<void>,
): CapabilityStream<O> {
  return EventStream.createGenerator<I, O>(fn);
}

export function eventStart(): CapabilityEvent {
  return { type: "start" };
}

export function eventToken(value: string): CapabilityEvent {
  return { type: "token", value };
}

export function eventLog(message: string, level: "info" | "warn" | "error" = "info"): CapabilityEvent {
  return { type: "log", level, message };
}

export function eventResult<D>(data: D): CapabilityEvent<D> {
  return { type: "result", data };
}

export function eventError(error: string, code?: string): CapabilityEvent {
  return { type: "error", error, code };
}

export function eventEnd(): CapabilityEvent {
  return { type: "end" };
}
