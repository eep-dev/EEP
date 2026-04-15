import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:readline", () => {
  const answers = ["Acme", "api.acme.com", "https://api.acme.com", ""];
  let i = 0;
  return {
    createInterface: () => ({
      question: (_: string, cb: (s: string) => void) => {
        cb(answers[i++] ?? "");
      },
      close: () => {}
    })
  };
});

describe("promptIdentityOverrides (mocked readline)", () => {
  const prevCi = process.env.CI;
  const prevEepCi = process.env.EEP_SETUP_CI;

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.EEP_SETUP_CI;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    vi.resetModules();
  });

  afterEach(() => {
    process.env.CI = prevCi;
    process.env.EEP_SETUP_CI = prevEepCi;
  });

  it("collects identity when TTY + not CI", async () => {
    const { promptIdentityOverrides } = await import("./interactive.js");
    const partial = await promptIdentityOverrides();
    expect(partial.identity?.org_name).toBe("Acme");
    expect(partial.identity?.domain).toBe("api.acme.com");
    expect(partial.identity?.base_url).toBe("https://api.acme.com");
    expect(partial.identity?.did).toBe("did:web:api.acme.com");
  });
});
