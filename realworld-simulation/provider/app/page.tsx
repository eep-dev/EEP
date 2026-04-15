import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>CorpX Financial Analytics</h1>
        <p style={{ color: "#8b98a5", marginTop: "0.5rem" }}>
          Premium Reports for Enterprise — Institutional-grade coverage, human-readable dashboards, and
          compliance-ready exports.
        </p>
      </header>
      <section style={{ background: "#16181c", padding: "1.5rem", borderRadius: 12, marginBottom: "1.5rem" }}>
        <h2>Featured: Q1 2026 Coverage</h2>
        <p>
          Access proprietary earnings summaries, segment breakdowns, and forward guidance extracted from
          filings — before the market moves.
        </p>
        <Link
          href="/reports/corpx-q1"
          style={{
            display: "inline-block",
            marginTop: "1rem",
            padding: "0.6rem 1.2rem",
            background: "#1d9bf0",
            color: "#fff",
            borderRadius: 999,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          View CorpX Q1 report page
        </Link>
      </section>
      <footer style={{ fontSize: "0.85rem", color: "#71767b" }}>
        © 2026 CorpX Demo — For EEP realworld simulation only.
      </footer>
    </main>
  );
}
