/**
 * Wave 6: POST /emergency-stop, POST /control/reset.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server/index.js";
import { triggerKillSwitch, resetKillSwitch } from "../../src/governance/kill-switch.js";

const PORT = 3336;

describe("Control routes (Wave 6)", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;

  beforeEach(async () => {
    resetKillSwitch();
    server = await createServer({ port: PORT, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${PORT}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it("POST /emergency-stop triggers halt", async () => {
    const res = await fetch(`${baseUrl}/emergency-stop`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.state.halted).toBe(true);
  });

  it("GET /health shows killSwitch when halted", async () => {
    triggerKillSwitch("test-halt");
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.killSwitch).toBeDefined();
    expect(body.killSwitch.halted).toBe(true);
    expect(body.killSwitch.reason).toBe("test-halt");
  });

  it("POST /control/reset clears halt", async () => {
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST" });
    const res = await fetch(`${baseUrl}/control/reset`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.state.halted).toBe(false);
  });
});
