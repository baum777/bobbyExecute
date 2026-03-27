import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("render topology", () => {
  it("declares public bot, private control, and runtime worker services", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const renderYaml = readFileSync(resolve(currentDir, "../../../render.yaml"), "utf8");

    expect(renderYaml).toContain("bobbyexecute-control-staging");
    expect(renderYaml).toContain("bobbyexecute-control-production");
    expect(renderYaml).toContain("bobbyexecute-runtime-staging");
    expect(renderYaml).toContain("bobbyexecute-runtime-production");
    expect(renderYaml).toContain("type: worker");
    expect(renderYaml).toContain("start:control");
    expect(renderYaml).toContain("start:worker");
    expect(renderYaml).toContain("RUNTIME_CONFIG_ENV");
    expect(renderYaml).toContain("CONTROL_SERVICE_HOSTNAME");
    expect(renderYaml).toContain("CONTROL_SERVICE_PORT");
    expect(renderYaml).toContain("CONTROL_TOKEN");
    expect(renderYaml).not.toContain("bobbyexecute-bot-staging-data");
    expect(renderYaml).not.toContain("bobbyexecute-bot-production-data");
  });
});
