import { parseGateConfig, type GateConfig } from "@eep-dev/gates";

/** EEP gate configuration — payment tier validated by @eep-dev/gates; agreement enforced in server.ts. */
export const DEMO_GATE_CONFIG: GateConfig = parseGateConfig({
  default_tier: "public",
  tiers: {
    public: {
      label: "Public",
      access: ["reports.public.teaser"],
      requirements: [],
    },
    premium: {
      label: "Premium",
      description: "Full Q1 report via machine-verifiable payment",
      access: ["reports.corpx.q1.full"],
      requirements: [{ type: "payment", amount: 0.01, currency: "usd", per: "request" }],
    },
  },
});

export const DEMO_RESOURCE = "reports.corpx.q1.full";
