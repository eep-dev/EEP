# Screencast runbook (≤ 60s, day-0)

**Goal:** A **reproducible** recording that shows: clone or open a repo → one natural-language or one-command **adopt EEP** flow → **`EEP_ADOPTION_REPORT.md`** and (optional) **compliance** output.

## Preconditions (one machine, clean shell)

- Node **18+** (use **22+** for `@eep-dev/compliance-cli` per its `engines` field).  
- Git.  
- EEP repo checked out, or `npx` against **published** packages once released.

## Script (talk track ≈ 45–55s)

1. **(2s)** “This is EEP—Entity Engagement Protocol. I’m going to have an agent wire my app using the same path any contributor can run.”
2. **(10s)** Open terminal in **target app repo** (or a minimal clone). Show [AGENTS.md](../../AGENTS.md) exists or paste its first lines from the EEP repo.
3. **(20s)** Run:  
   `npx @eep-dev/agent-adopt --project .`  
   (Or your harness’s one-liner that delegates to the same command.)
4. **(10s)** Open **`EEP_ADOPTION_REPORT.md`**; scroll to `verify` result.
5. **(10s)** (Optional) If a **public staging URL** exists: show  
   `npx @eep-dev/compliance-cli --target <url> --api-key … --entity … --report-md ./out.md`  
   and the summary line. **If no URL**, say so honestly—**artifact verify** is still valid for day zero.

## Repro for a stranger (≈ 5 min)

1. `git clone` the EEP repo; `cd EEP`.  
2. `bash scripts/bootstrap.sh` (per [agent-onboarding.md](../guides/agent-onboarding.md)).  
3. In **another** directory: create a **minimal** Express or FastAPI app, or use `examples/eep-middleware-express-mini` as the target.  
4. From target: `npm install` / `pip install` as needed, then `npx @eep-dev/agent-adopt --project .` (path to local `agent-adopt` if unpublished: `node path/to/EEP/packages/@eep-dev/agent-adidge/dist/...`—document exact path in the published README).  
5. Confirm `eep-setup.json`, `eep-generated/`, and `EEP_ADOPTION_REPORT.md` exist.  
6. (Optional) Run compliance against [reference stack](../../examples/eep-reference-implementation/) URL when it is up.

## Quality bar

- If **step 4** fails on a default OS without undocumented env—**do not** ship the screencast as the main launch asset; fix the CLI or docs first. **Evidence before success claims.**

## Deliverable

- **Video file** and **link** in release notes; keep this runbook in sync with any CLI flag changes.
