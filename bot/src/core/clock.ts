/**
 * Clock abstraction for deterministic testing and governance compliance.
 * EXTRACTED from OrchestrAI_Labs packages/governance/src/runtime/clock.ts
 */
export interface Clock {
  now(): Date;
  /**
   * Parses an ISO-8601 timestamp string to Date.
   * Use this instead of new Date(str) for governance compliance.
   */
  parseISO(iso: string): Date;
  /**
   * Schedules a callback after ms milliseconds.
   * Use this instead of global setTimeout for governance compliance.
   */
  setTimeout(cb: () => void, ms: number): unknown;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  parseISO(iso: string): Date {
    return new Date(iso);
  }
  setTimeout(cb: () => void, ms: number): unknown {
    return globalThis.setTimeout(cb, ms);
  }
}

/**
 * Fake clock implementation for testing.
 * Allows setting a specific time for deterministic tests.
 */
export class FakeClock implements Clock {
  private currentTime: Date;
  private pendingTimeouts: Array<{ id: number; cb: () => void; ms: number }> = [];
  private nextId = 1;

  constructor(initialTime?: Date | number) {
    this.currentTime =
      initialTime !== undefined ? new Date(initialTime) : new Date();
  }

  set(date: Date): void {
    this.currentTime = new Date(date);
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  parseISO(iso: string): Date {
    return new Date(iso);
  }

  setTimeout(cb: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.pendingTimeouts.push({ id, cb, ms });
    return id;
  }
}
