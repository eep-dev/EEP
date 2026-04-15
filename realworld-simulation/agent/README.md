# Agent (Python)

- `run_demo.py` — orchestrates Next.js + EEP servers and runs both scenarios.
- `scenario_a/` — legacy HTML + Playwright (`OldWebScenarioAgent` for Google ADK).
- `scenario_b/` — EEP client with Ed25519 signing (`EEPScenarioAgent`).
- `agent/__agent__.py` — optional ADK discovery entry.

Install: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m playwright install chromium`

Run (from this directory, with provider servers up): `PYTHONPATH=. .venv/bin/python run_demo.py`

See [../README.md](../README.md) for the full story. High-level entry: [../../docs/guides/realworld-simulation.md](../../docs/guides/realworld-simulation.md).
