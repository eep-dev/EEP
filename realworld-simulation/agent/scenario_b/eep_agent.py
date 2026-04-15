"""Scenario B — EEP: manifest, 402, sign NDA, mock payment, POST proofs."""

from __future__ import annotations

import json
import os
import time
import urllib.parse
from dataclasses import dataclass

import httpx
import websockets
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from rich.console import Console
from rich.markup import escape

from scenario_b.policy import payment_allowed
from scenario_b.wallet import AgentWallet
from utils.demo_export import demo_phase_pause, print_eep_final_json
from utils.terminal_ui import agent_say, eep_say, http_line, note, wire_in
from utils.token_counter import estimate_tokens_from_text


@dataclass
class ScenarioResult:
    label: str
    seconds: float
    bytes_processed: int
    tokens_est: int
    human_interventions: int
    automation: str
    legal_signed: bool
    payment_method: str
    data_format: str
    sample: str
    final_json: str


async def run_eep_scenario(
    eep_base: str | None = None,
    console: Console | None = None,
) -> ScenarioResult:
    """Deterministic EEP client (no LLM)."""
    c = console or Console()
    base = (eep_base or os.environ.get("EEP_BASE_URL", "http://127.0.0.1:3402")).rstrip("/")
    wallet = AgentWallet()
    t0 = time.perf_counter()
    bytes_total = 0
    tokens = 0

    agent_say(
        c,
        "Goal: discover manifest, satisfy cryptographic + payment gates, receive structured JSON (no HTML).",
    )
    await demo_phase_pause()

    async with httpx.AsyncClient(timeout=30.0) as client:
        manifest_url = f"{base}/.well-known/eep.json"
        http_line(c, "GET", manifest_url)
        man = await client.get(manifest_url)
        man.raise_for_status()
        manifest = man.json()
        bytes_total += len(man.content)
        tokens += estimate_tokens_from_text(man.text)
        wire_in(
            c,
            f"HTTP {man.status_code}  manifest keys: {list(manifest.keys())[:5]}…",
        )
        did = manifest.get("did", "?")
        note(c, f"Publisher DID (truncated): {escape(str(did)[:64])}…")
        await demo_phase_pause()

        reg_url = f"{base}/.well-known/eep-registry.json"
        http_line(c, "GET", reg_url)
        reg = await client.get(reg_url)
        bytes_total += len(reg.content)
        if reg.status_code == 200:
            reg_body = reg.json()
            econ = reg_body.get("economics") or {}
            q = econ.get("query_quota") or {}
            wire_in(
                c,
                f"HTTP {reg.status_code}  registry economics: "
                f"free_req/day≈{q.get('free_requests_per_day', '?')}",
            )
        else:
            wire_in(c, f"HTTP {reg.status_code}  (registry optional)")
        await demo_phase_pause()

        agent_did = wallet.did_demo()
        trust_q = urllib.parse.quote(agent_did, safe="")
        ts_url = f"{base}/eep/trust-status?agent_did={trust_q}"
        http_line(c, "GET", ts_url)
        ts0 = await client.get(ts_url)
        bytes_total += len(ts0.content)
        wire_in(c, f"HTTP {ts0.status_code}  trust_state={ts0.json().get('trust_state', '?')}")
        await demo_phase_pause()

        http_line(c, "POST", f"{base}/eep/trust/graduate", extra="agent_did=…")
        grad = await client.post(
            f"{base}/eep/trust/graduate",
            json={"agent_did": agent_did},
        )
        bytes_total += len(grad.content)
        wire_in(c, f"HTTP {grad.status_code}  graduated={grad.json().get('ok', False)}")
        await demo_phase_pause()

        ts1 = await client.get(ts_url)
        wire_in(c, f"HTTP {ts1.status_code}  trust_state={ts1.json().get('trust_state', '?')}")
        await demo_phase_pause()

        layer3 = manifest.get("layers", {}).get("layer3_ws")
        if isinstance(layer3, str) and layer3.startswith("ws"):
            note(c, "Layer 3: open commerce dispute envelope (simulated resolution).")
            try:
                async with websockets.connect(layer3, max_size=2**20) as ws:
                    first = await ws.recv()
                    _ = json.loads(first)
                    await ws.send(
                        json.dumps(
                            {
                                "v": 1,
                                "type": "commerce",
                                "action": "commerce.dispute.open",
                                "seq": 10,
                                "data": {"negotiation_id": "neg_realworld_demo"},
                            }
                        )
                    )
                    resolved = await ws.recv()
                    rj = json.loads(resolved)
                    wire_in(
                        c,
                        f"WS commerce  action={rj.get('action', '?')}  outcome="
                        f"{(rj.get('data') or {}).get('outcome', '?')}",
                    )
            except OSError as e:
                note(c, f"WebSocket skipped (debug): {e!s}")
        await demo_phase_pause()

        layer1 = manifest["layers"]["layer1"]
        report_url = f"{layer1}/reports/corpx-q1"
        http_line(c, "GET", report_url)
        r0 = await client.get(report_url)
        bytes_total += len(r0.content)
        tokens += estimate_tokens_from_text(r0.text)
        if r0.status_code != 402:
            raise RuntimeError(f"expected HTTP 402, got {r0.status_code}: {r0.text[:200]}")

        challenge = r0.json()
        wire_in(
            c,
            f"HTTP 402 Payment Required  eep_error={challenge.get('eep_error', '?')}  "
            f"unmet={len(challenge.get('unmet_requirements', []))}",
        )
        reqs = challenge.get("unmet_requirements", [])
        for i, req in enumerate(reqs):
            note(c, f"  requirement[{i}]: type={req.get('type')!r}")
        await demo_phase_pause()

        nda_hash = None
        recipient = "DEMO_WALLET_CORPX_Q1"
        for req in reqs:
            if req.get("type") == "agreement":
                nda_hash = req.get("document_hash")
            if req.get("type") == "payment":
                recipient = os.environ.get("EEP_DEMO_RECIPIENT", recipient)

        if not nda_hash:
            raise RuntimeError("402 response missing agreement requirement")

        agent_say(c, "Operator policy: allow micro-payment for this demo resource.")
        if not payment_allowed(0.01):
            raise RuntimeError("policy blocked payment")
        note(c, "policy OK for amount 0.01 (simulated USDC)")

        sig_b64 = wallet.sign_utf8(nda_hash)
        did_short = escape(wallet.did_demo()[:48])
        eep_say(c, f"Signed agreement hash with agent Ed25519 key (DID: {did_short}…).")
        tx = wallet.mock_transfer_usdc("0.01", recipient)
        eep_say(
            c,
            f"Mock settlement token recorded for recipient {escape(recipient)}: {escape(tx[:48])}…",
        )
        await demo_phase_pause()

        proofs = [
            {
                "type": "agreement",
                "document_hash": nda_hash,
                "signature": sig_b64,
                "signer_did": wallet.did_demo(),
                "signer_public_key_b64": wallet.public_key_b64(),
                "signature_algo": "EdDSA",
            },
            {"type": "payment", "token": tx},
        ]

        body = {"gate_proofs": proofs}
        http_line(c, "POST", report_url, extra="Content-Type: application/json  body=gate_proofs[]")
        r_ok = await client.post(
            report_url,
            json=body,
            headers={"Content-Type": "application/json"},
        )
        bytes_total += len(r_ok.content)
        tokens += estimate_tokens_from_text(r_ok.text)
        if r_ok.status_code != 200:
            raise RuntimeError(f"expected HTTP 200, got {r_ok.status_code}: {r_ok.text[:400]}")

        data = r_ok.json()
        wire_in(c, f"HTTP {r_ok.status_code}  JSON keys: {list(data.keys())}")
        await demo_phase_pause()

    elapsed = time.perf_counter() - t0
    pretty = json.dumps(data, indent=2, ensure_ascii=False)
    print_eep_final_json(c, pretty)

    return ScenarioResult(
        label="EEP Protocol",
        seconds=elapsed,
        bytes_processed=bytes_total,
        tokens_est=tokens,
        human_interventions=0,
        automation="Full",
        legal_signed=True,
        payment_method="Simulated crypto wallet (tx_demo_*)",
        data_format="Structured JSON (no HTML parse)",
        sample=pretty,
        final_json=pretty,
    )


class EEPScenarioAgent(BaseAgent):
    """Google ADK shell over the deterministic EEP client (no LLM)."""

    def __init__(self) -> None:
        super().__init__(
            name="eep_scenario",
            description="Discovers EEP manifest, satisfies gates, retrieves JSON report.",
        )

    async def _run_async_impl(self, ctx):  # type: ignore[override]
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text="[EEP] Starting deterministic gate flow (no LLM).")],
            ),
        )
        result = await run_eep_scenario()
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        text=(
                            f"[EEP] Completed in {result.seconds:.2f}s, "
                            f"~{result.tokens_est} tokens est., automation={result.automation}"
                        )
                    )
                ],
            ),
        )
