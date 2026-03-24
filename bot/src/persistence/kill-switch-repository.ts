import type { KillSwitchState } from "../governance/kill-switch.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export interface KillSwitchRepository {
  kind: "file" | "memory";
  load(): Promise<KillSwitchState | null>;
  save(state: KillSwitchState): Promise<void>;
  loadSync(): KillSwitchState | null;
  saveSync(state: KillSwitchState): void;
}

export class FileSystemKillSwitchRepository implements KillSwitchRepository {
  kind = "file" as const;

  constructor(private readonly filePath: string) {}

  async load(): Promise<KillSwitchState | null> {
    return this.loadSync();
  }

  save(state: KillSwitchState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): KillSwitchState | null {
    return readJsonFile<KillSwitchState>(this.filePath);
  }

  saveSync(state: KillSwitchState): void {
    writeJsonFile(this.filePath, state);
  }
}

export class InMemoryKillSwitchRepository implements KillSwitchRepository {
  kind = "memory" as const;

  private state: KillSwitchState = { halted: false };

  async load(): Promise<KillSwitchState | null> {
    return this.loadSync();
  }

  save(state: KillSwitchState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): KillSwitchState | null {
    return { ...this.state };
  }

  saveSync(state: KillSwitchState): void {
    this.state = { ...state };
  }
}
