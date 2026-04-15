import type { CloudEvent, EventBusAdapter } from "../core/request-handler.js";

export class InMemoryEventBusAdapter implements EventBusAdapter {
  private readonly events: CloudEvent[] = [];
  private readonly subscribers: Array<{ pattern: string; handler: (event: CloudEvent) => void }> = [];

  async publish(event: CloudEvent): Promise<void> {
    this.events.push(event);
    for (const subscriber of this.subscribers) {
      if (this.matches(subscriber.pattern, event.type)) {
        subscriber.handler(event);
      }
    }
  }

  async subscribe(pattern: string, handler: (event: CloudEvent) => void): Promise<void> {
    this.subscribers.push({ pattern, handler });
  }

  getPublishedEvents(): CloudEvent[] {
    return [...this.events];
  }

  private matches(pattern: string, eventType: string): boolean {
    if (pattern === "*") {
      return true;
    }
    if (!pattern.includes("*")) {
      return pattern === eventType;
    }
    const prefix = pattern.split("*")[0];
    return eventType.startsWith(prefix);
  }
}
