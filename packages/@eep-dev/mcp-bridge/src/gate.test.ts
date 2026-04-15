import { describe, expect, it } from "vitest";
import { evaluateMcpCallAccess } from "./gate.js";

const gateConfig = {
  version: "0.1",
  default_tier: "public",
  tiers: {
    public: {
      access: ["eep.services.list"],
      requirements: [],
    },
    tool_premium_search: {
      access: ["mcp.tools.call.premium_search"],
      requirements: [{ type: "payment", amount: 5, currency: "usd", per: "request" }],
    },
  },
};

describe("evaluateMcpCallAccess", () => {
  it("denies when proof is missing", async () => {
    const out = await evaluateMcpCallAccess(gateConfig as any, "premium_search", []);
    expect(out.granted).toBe(false);
    expect(out.status).toBe(402);
  });

  it("allows with payment proof", async () => {
    const out = await evaluateMcpCallAccess(
      gateConfig as any,
      "premium_search",
      [{ type: "payment", token: "x402-token" }] as any,
    );
    expect(out.granted).toBe(true);
    expect(out.status).toBe(200);
  });

  it("allows with credential proof when tier requires credential", async () => {
    const cfg = {
      version: "0.1",
      default_tier: "public",
      tiers: {
        public: { access: ["eep.services.list"], requirements: [] },
        tool_secured: {
          access: ["mcp.tools.call.secured"],
          requirements: [{ type: "credential", credential_type: "ReaderRole" }],
        },
      },
    };
    const out = await evaluateMcpCallAccess(
      cfg as any,
      "secured",
      [{ type: "credential", credential: "vc.jwt.payload", format: "jwt_vc" }] as any,
    );
    expect(out.status).toBe(200);
  });

  it("denies malformed payment proof", async () => {
    const out = await evaluateMcpCallAccess(
      gateConfig as any,
      "premium_search",
      [{ type: "payment" }] as any,
    );
    expect(out.status).toBe(402);
  });

  it("fails closed on unsupported alternative payment proof shapes", async () => {
    const viaTxHash = await evaluateMcpCallAccess(
      gateConfig as any,
      "premium_search",
      [{ type: "payment", tx_hash: "0xabc" }] as any,
    );
    expect(viaTxHash.status).toBe(402);

    const viaX402 = await evaluateMcpCallAccess(
      gateConfig as any,
      "premium_search",
      [{ type: "payment", x402_payload: { tx: "abc" } }] as any,
    );
    expect(viaX402.status).toBe(402);
  });

  it("allows with identity proof when required", async () => {
    const cfg = {
      version: "0.1",
      default_tier: "public",
      tiers: {
        public: { access: ["eep.services.list"], requirements: [] },
        tool_identity: {
          access: ["mcp.tools.call.identity"],
          requirements: [{ type: "identity", method: "did_verified" }],
        },
      },
    };
    const out = await evaluateMcpCallAccess(
      cfg as any,
      "identity",
      [{ type: "identity", did: "did:web:agent", method: "did_verified", signature: "sig" }] as any,
    );
    expect(out.status).toBe(200);
  });

  it("supports custom x- requirement types with fail-closed response", async () => {
    const cfg = {
      version: "0.1",
      default_tier: "public",
      tiers: {
        public: { access: ["eep.services.list"], requirements: [] },
        tool_custom: {
          access: ["mcp.tools.call.custom"],
          requirements: [{ type: "x-special-proof" }],
        },
      },
    };
    const out = await evaluateMcpCallAccess(cfg as any, "custom", [{ type: "x-special-proof" }] as any);
    expect(out.status).toBe(402);
  });
});
