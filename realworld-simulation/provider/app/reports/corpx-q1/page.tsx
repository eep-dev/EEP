import { CORPX_Q1_REPORT } from "@/lib/report-data";

/** Bloated marketing HTML shell — simulates real enterprise sites (nav, banners, trackers). */
export default function CorpXQ1ReportPage() {
  const embedded = JSON.stringify(CORPX_Q1_REPORT);
  return (
    <div className="corp-x-shell">
      <nav
        style={{
          padding: "1rem 2rem",
          borderBottom: "1px solid #2f3336",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700 }}>CorpX Analytics</span>
        <span style={{ fontSize: "0.85rem", color: "#71767b" }}>Enterprise Portal</span>
      </nav>

      {/* Cookie / consent banner (bloated copy) */}
      <div
        id="cookie-consent"
        style={{
          background: "#1d2a35",
          padding: "0.75rem 2rem",
          fontSize: "0.8rem",
          color: "#8b98a5",
        }}
      >
        We use cookies, pixels, session replay, and third-party analytics to personalize content and measure
        campaign performance across devices. By continuing you agree to our Terms, Privacy Policy, Cookie
        Statement, and Marketing Consent Framework v3.2.
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>CorpX Industries — Q1 2026 Earnings Summary</h1>
        <p style={{ color: "#8b98a5" }}>
          Institutional clients: sign in to unlock the full proprietary dataset. New subscribers save on
          annual plans.
        </p>

        {/* Login wall — visible in HTML; agent cannot complete without credentials */}
        <div
          id="login-wall"
          role="dialog"
          style={{
            marginTop: "2rem",
            padding: "2rem",
            background: "#16181c",
            borderRadius: 12,
            border: "1px solid #2f3336",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Sign in to continue</h2>
          <p>Please solve CAPTCHA after login. SSO and SAML supported for enterprise accounts.</p>
          <form action="/api/auth" method="post" style={{ opacity: 0.9 }}>
            <label>
              Email
              <input name="email" type="email" placeholder="you@company.com" style={{ display: "block", margin: "0.5rem 0", width: "100%", padding: "0.5rem" }} />
            </label>
            <label>
              Password
              <input name="password" type="password" style={{ display: "block", margin: "0.5rem 0", width: "100%", padding: "0.5rem" }} />
            </label>
            <button type="submit" style={{ padding: "0.5rem 1rem", marginTop: "0.5rem" }}>
              Sign in
            </button>
          </form>
        </div>

        {/* Subscription paywall */}
        <div
          id="subscription-paywall"
          style={{
            marginTop: "2rem",
            padding: "2rem",
            background: "linear-gradient(145deg, #1a2633, #121620)",
            borderRadius: 12,
            border: "1px solid #38444d",
          }}
        >
          <h2>Premium subscription required</h2>
          <p>
            Full Q1 segment drill-down, KPI reconciliation, and downloadable models are available for{" "}
            <strong>$99/month</strong> (billed annually). Credit card required — we do not accept agent or
            programmatic checkout on this legacy portal.
          </p>
          <form action="/api/subscribe" method="post">
            <input name="card" placeholder="Card number" style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
            <button type="submit">Subscribe now</button>
          </form>
        </div>

        {/* Teaser only for non-subscribers */}
        <section style={{ marginTop: "2rem" }} aria-hidden="false">
          <h3>Public teaser</h3>
          <p>
            CorpX delivered strong year-over-year growth in Q1. Detailed figures require a premium
            subscription.
          </p>
        </section>

        {/* Hidden structured data — Playwright can extract after &quot;human&quot; steps */}
        <script
          id="report-data"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: embedded }}
        />

        {/* Decorative filler paragraphs */}
        {Array.from({ length: 12 }).map((_, i) => (
          <p key={i} style={{ color: "#536471", fontSize: "0.85rem", marginTop: "1rem" }}>
            Marketing disclaimer {i + 1}: Past performance does not guarantee future results. This page
            contains forward-looking statements subject to risks including market volatility, regulatory
            change, and competition. Model assumptions may differ from actuals. Not investment advice.
          </p>
        ))}
      </div>

      <footer style={{ padding: "2rem", borderTop: "1px solid #2f3336", fontSize: "0.75rem", color: "#536471" }}>
        CorpX Financial Analytics — NYSE: CRPX — IR contact: ir@corp-x-demo.invalid
      </footer>
    </div>
  );
}
