/** Canonical report payload (same semantic data as EEP JSON endpoint). */
export const CORPX_Q1_REPORT = {
  report: "corpx-q1-2026",
  company: "CorpX Industries",
  revenue: "$4.2B",
  net_income: "$890M",
  yoy_growth: "23%",
  segments: [
    { name: "Cloud", revenue: "$2.1B", growth: "31%" },
    { name: "Enterprise", revenue: "$1.4B", growth: "18%" },
    { name: "Consumer", revenue: "$0.7B", growth: "9%" },
  ],
  guidance: "FY2026 revenue outlook $17.5B–$18.2B",
  generated_at: "2026-04-12T12:00:00.000Z",
} as const;
