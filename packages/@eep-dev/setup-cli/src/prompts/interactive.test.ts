import { describe, expect, it } from "vitest";
import { deriveDidFromDomain, hostnameFromUserInput, identityFieldsToConfig } from "./interactive.js";

describe("interactive identity helpers", () => {
  it("deriveDidFromDomain maps host to did:web", () => {
    expect(deriveDidFromDomain("api.acme.com")).toBe("did:web:api.acme.com");
    expect(deriveDidFromDomain("example.com")).toBe("did:web:example.com");
    expect(deriveDidFromDomain("")).toBe("did:web:example.com");
  });

  it("hostnameFromUserInput parses URL or falls back on invalid URL", () => {
    expect(hostnameFromUserInput("api.acme.com")).toBe("api.acme.com");
    expect(hostnameFromUserInput("https://api.acme.com/v1")).toBe("api.acme.com");
    expect(hostnameFromUserInput("https://[bad")).toBe("[bad");
  });

  it("identityFieldsToConfig builds partial config", () => {
    const partial = identityFieldsToConfig({
      org_name: "Acme",
      domain: "api.acme.com",
      base_url: "https://api.acme.com",
      did: "did:web:api.acme.com"
    });
    expect(partial.identity?.org_name).toBe("Acme");
    expect(partial.identity?.did).toBe("did:web:api.acme.com");
  });
});
