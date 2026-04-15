# Realworld simulation (HTML vs EEP)

This guide points to the **deterministic** “current web vs EEP” demo in the monorepo. It is for **talks, onboarding, and side-by-side comparison** — not a production deployment template.

## What you get

- **Scenario A — Current web:** a Next.js HTML surface with paywalls; a Python agent uses **Playwright** to scrape embedded JSON (high bytes, simulated human steps).
- **Scenario B — EEP:** the same fictional publisher exposes **`@eep-dev/gates`** on HTTP (**402** + structured proofs); the agent signs an NDA hash, submits a mock payment proof, and receives **JSON** without HTML parsing.

Orchestration uses **Google ADK**-shaped agents but **does not call a hosted LLM** — runs are reproducible.

## Run it

From the package directory (see [realworld-simulation/README.md](../../realworld-simulation/README.md) for prerequisites and layout):

```bash
cd realworld-simulation
npm run demo
```

That bootstraps Node + Python, starts **:3401** (Next.js) and **:3402** (EEP Express), runs both scenarios, then prints a **comparison** table.

If servers are already running:

```bash
cd realworld-simulation/agent
PYTHONPATH=. SKIP_SERVER_START=1 .venv/bin/python run_demo.py
```

## When to use this vs other paths

| Path | Use when |
|------|----------|
| [Five-minute proof](./five-minute-proof.md) | You want the **reference stack**, **setup-cli**, or **minimal Express** in minutes. |
| **Realworld simulation** | You want a **narrated terminal story** contrasting legacy HTML scraping with gate-based JSON. |
| [Reference deployment](./reference-deployment-eep-api.md) | You need **Dockerized** Node + Python APIs and infra patterns. |

## Tunables (summary)

Full list and defaults: **[realworld-simulation/README.md](../../realworld-simulation/README.md)**. Commonly adjusted:

| Variable | Role |
|----------|------|
| `DEMO_SPLIT_SCREEN` | Parallel **left/right** panes (wide terminal). |
| `DEMO_PHASE_PAUSE_SEC` | Pause between major beats. |
| `DEMO_EXPORT_SECTION_PAUSE_SEC` | Pause between KPI / segments / JSON blocks (Scenario A exports). |
| `DEMO_COMPARISON_DELAY_SEC` | Pause before the final comparison table. |
| `DEMO_VIEWPORT_STEP_SEC` / `DEMO_HTML_VIEWPORT_STEP_SEC` / `DEMO_JSON_VIEWPORT_STEP_SEC` | Scroll animation speed. |

## Source layout

| Path | Contents |
|------|----------|
| `realworld-simulation/provider/` | Next.js “CorpX” app + `eep-server/` Express publisher |
| `realworld-simulation/agent/` | `run_demo.py`, Scenario A (Playwright), Scenario B (EEP client) |

## License

Apache-2.0, same as the EEP repository.
