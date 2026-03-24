import type { DailyLossState } from "../governance/daily-loss-tracker.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export interface DailyLossRepository {
  kind: "file" | "memory";
  load(): Promise<DailyLossState | null>;
  save(state: DailyLossState): Promise<void>;
  loadSync(): DailyLossState | null;
  saveSync(state: DailyLossState): void;
}

export class FileSystemDailyLossRepository implements DailyLossRepository {
  kind = "file" as const;

  constructor(private readonly filePath: string) {}

  async load(): Promise<DailyLossState | null> {
    return this.loadSync();
  }

  save(state: DailyLossState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): DailyLossState | null {
    return readJsonFile<DailyLossState>(this.filePath);
  }

  saveSync(state: DailyLossState): void {
    writeJsonFile(this.filePath, state);
  }
}

export class InMemoryDailyLossRepository implements DailyLossRepository {
  kind = "memory" as const;

  private state: DailyLossState = {
    dateKey: "",
    tradesCount: 0,
    lossUsd: 0,
  };

  async load(): Promise<DailyLossState | null> {
    return this.loadSync();
  }

  save(state: DailyLossState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): DailyLossState | null {
    return { ...this.state };
  }

  saveSync(state: DailyLossState): void {
    this.state = { ...state };
  }
}
