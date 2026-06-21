"""
LangGraph + EEP Agent Example

Demonstrates a LangGraph agent that:
  1. Discovers an EEP entity via Layer 1 REST
  2. Subscribes to events via Layer 2 (webhook)
  3. Handles gate challenges (402/403) with proof construction
  4. Processes events through a Claude-powered LangGraph pipeline

Usage:
  export EEP_TARGET=http://localhost:3100
  export ANTHROPIC_API_KEY=sk-ant-...
  python agent.py
"""

from __future__ import annotations

import json
import os
import sys
import hmac
import hashlib
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import TypedDict

import httpx

EEP_TARGET = os.environ.get("EEP_TARGET", "http://localhost:3100")
WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT", "9877"))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ─── EEP Discovery & Subscription ────────────────────────────────────────────


def discover_entity(target: str, entity: str = "u/acme-corp") -> dict:
    """Layer 1: resolve entity, extract Link headers and capabilities."""
    url = f"{target}/{entity}"
    print(f"[discovery] GET {url}", file=sys.stderr)
    r = httpx.get(url, headers={"Accept": "application/json"}, timeout=10)
    r.raise_for_status()

    link_header = r.headers.get("link", "")
    subscribe_url = ""
    for part in link_header.split(","):
        if 'rel="subscribe"' in part:
            subscribe_url = part.split(";")[0].strip().strip("<>")

    return {
        "entity_data": r.json(),
        "subscribe_url": subscribe_url or f"{target}/eep/subscribe",
        "headers": dict(r.headers),
    }


def subscribe(subscribe_url: str, entity_did: str, webhook_url: str, api_key: str = "") -> dict:
    """Layer 2: create webhook subscription."""
    print(f"[subscribe] POST {subscribe_url}", file=sys.stderr)
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = {
        "source_did": entity_did,
        "event_types": ["com.example.entity.*", "com.example.trust.*", "com.example.agent.*"],
        "delivery_method": "webhook",
        "delivery_url": webhook_url,
    }
    r = httpx.post(subscribe_url, json=body, headers=headers, timeout=15)
    r.raise_for_status()
    data = r.json()
    print(f"[subscribe] subscription_id={data.get('subscription_id')}", file=sys.stderr)
    return data


def _proof_for_requirement(req: dict) -> dict | None:
    """Construct a (demo) gate proof matching one unmet requirement.

    Proof shapes mirror @eep-dev/gates `GateProof`. The values here are
    placeholders — a real agent would pay, present a real Verifiable
    Credential, or sign the agreement document — but the *structure* and the
    requirement-type routing are exactly what a publisher's proof verifier
    expects (see packages/@eep-dev/gates/src/types.ts).
    """
    rtype = req.get("type", "")
    if rtype == "payment":
        # PaymentRequirement: { amount, currency, per, payment_methods?, x402? }
        return {"type": "payment", "token": "demo_payment_token", "provider": "demo"}
    if rtype == "credential":
        # CredentialRequirement: { credential_type, issuer?, accepted_formats? }
        fmt = (req.get("accepted_formats") or ["jwt_vc"])[0]
        return {"type": "credential", "credential": "<demo_jwt_vc>", "format": fmt}
    if rtype == "agreement":
        # AgreementRequirement: { document_hash, document_url, signature_algo? }
        doc_hash = req.get("document_hash", "")
        return {
            "type": "agreement",
            "document_hash": doc_hash,
            "signature": f"did:key:agent_demo_sig_{doc_hash[:8]}",
        }
    if rtype == "identity":
        return {"type": "identity", "method": req.get("method", "did_verified"), "evidence": "did:key:agent_demo"}
    if rtype == "trust":
        return {"type": "trust", "self_attested": True}
    if rtype == "connection":
        return {"type": "connection", "subscriber_did": "did:key:agent_demo", "relation": req.get("relation", "follower")}
    # Unknown / custom x-* requirement: nothing the demo can auto-satisfy.
    return None


def handle_gate_challenge(status: int, body: dict) -> dict | None:
    """Parse a canonical EEP 402/403 gate response and build matching proofs.

    The canonical body (`gate.402-response.json` / `gate.403-response.json`) is:

        { "error": "access_restricted" | "access_forbidden",
          "resource": "...", "current_tier": "...", "required_tier": "...",
          "unmet_requirements": [ { "type": ..., "resolution_hint": ..., ... } ],
          "available_tiers"?: {...} }

    It is NOT a flat ``{gate_type, amount, currency}`` object. *Every* gate type
    (payment, credential, agreement, identity, ...) arrives as an entry in
    ``unmet_requirements``, each carrying a machine-readable ``resolution_hint``
    so the agent needs no LLM to decide what to do. We build one proof per
    requirement we can satisfy and return them together for the retry.
    """
    if body.get("error") not in ("access_restricted", "access_forbidden"):
        return None

    proofs: list[dict] = []
    for req in body.get("unmet_requirements", []) or []:
        hint = req.get("resolution_hint", "")
        print(f"[gate] HTTP {status} unmet '{req.get('type')}': {hint}", file=sys.stderr)
        proof = _proof_for_requirement(req)
        if proof:
            proofs.append(proof)

    if not proofs:
        print("[gate] no auto-satisfiable requirements in challenge", file=sys.stderr)
        return None

    return {
        "resource": body.get("resource"),
        "required_tier": body.get("required_tier"),
        "proofs": proofs,
    }


# ─── Webhook Signature Verification ──────────────────────────────────────────


def verify_webhook(raw_body: str, headers: dict, secret: str) -> bool:
    """Standard Webhooks HMAC-SHA256 verification (mirrors @eep-dev/signer)."""
    wid = headers.get("webhook-id", "")
    wts = headers.get("webhook-timestamp", "")
    wsig = headers.get("webhook-signature", "")

    if not (wid and wts and wsig):
        return False

    try:
        ts = int(wts)
        if abs(time.time() - ts) > 60:
            print(f"[verify] timestamp outside 60s window (age={time.time() - ts:.0f}s)", file=sys.stderr)
            return False
    except ValueError:
        return False

    signed_content = f"{wid}.{wts}.{raw_body}"
    expected = hmac.new(secret.encode(), signed_content.encode(), hashlib.sha256).digest()
    import base64
    expected_b64 = f"v1,{base64.b64encode(expected).decode()}"

    for sig in wsig.split(" "):
        if hmac.compare_digest(sig, expected_b64):
            return True
    return False


# ─── LangGraph Event Processing ──────────────────────────────────────────────


class EventState(TypedDict):
    raw_body: str
    headers: dict
    event: dict
    signature_valid: bool
    summary: str
    action: str


def validate_node(state: EventState) -> EventState:
    """Validate CloudEvents envelope fields."""
    event = state["event"]
    required = ["specversion", "id", "source", "type", "time"]
    missing = [f for f in required if f not in event]
    if missing:
        print(f"[validate] missing fields: {missing}", file=sys.stderr)
    if event.get("specversion") != "1.0":
        print(f"[validate] specversion={event.get('specversion')} (expected 1.0)", file=sys.stderr)
    return state


def summarize_node(state: EventState) -> EventState:
    """Use Claude to summarize the event (or fall back to simple summary)."""
    event = state["event"]
    event_type = event.get("type", "unknown")
    source = event.get("source", "unknown")
    data = event.get("data", {})

    if ANTHROPIC_API_KEY:
        try:
            from langchain_anthropic import ChatAnthropic

            llm = ChatAnthropic(model="claude-sonnet-4-20250514", api_key=ANTHROPIC_API_KEY)
            prompt = (
                f"Summarize this EEP event in one sentence for an operator dashboard.\n"
                f"Event type: {event_type}\n"
                f"Source: {source}\n"
                f"Data: {json.dumps(data, indent=2)}\n"
            )
            result = llm.invoke(prompt)
            state["summary"] = result.content if hasattr(result, "content") else str(result)
        except Exception as e:
            print(f"[summarize] Claude error: {e}", file=sys.stderr)
            state["summary"] = f"{event_type} from {source}: {json.dumps(data)}"
    else:
        state["summary"] = f"{event_type} from {source}: {json.dumps(data)}"

    return state


def act_node(state: EventState) -> EventState:
    """Decide action based on event type."""
    event = state["event"]
    event_type = event.get("type", "")

    if "trust.changed" in event_type:
        state["action"] = "alert:trust_change"
    elif "session.revoked" in event_type:
        state["action"] = "revoke_local_session"
    elif "entity.updated" in event_type:
        state["action"] = "sync_entity_cache"
    elif "agent.task.completed" in event_type:
        state["action"] = "log_task_completion"
    elif "commerce.payment" in event_type:
        state["action"] = "record_payment"
    else:
        state["action"] = "log"

    return state


def process_event(raw_body: str, headers: dict, secret: str) -> EventState:
    """Run the LangGraph-style pipeline: validate -> summarize -> act."""
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        event = {}

    sig_valid = verify_webhook(raw_body, headers, secret) if secret else False

    state: EventState = {
        "raw_body": raw_body,
        "headers": headers,
        "event": event,
        "signature_valid": sig_valid,
        "summary": "",
        "action": "",
    }

    state = validate_node(state)
    state = summarize_node(state)
    state = act_node(state)

    return state


# ─── Webhook HTTP Server ──────────────────────────────────────────────────────

webhook_secret = ""
events_received: list[EventState] = []


class WebhookHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs

        query = parse_qs(urlparse(self.path).query)
        challenge = query.get("hub.challenge", [None])[0]
        if challenge:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(challenge.encode())
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")
        hdrs = {k.lower(): v for k, v in self.headers.items()}

        state = process_event(raw, hdrs, webhook_secret)
        events_received.append(state)

        sig_label = "valid" if state["signature_valid"] else "INVALID"
        print(
            f"\n[event] type={state['event'].get('type', '?')} sig={sig_label}\n"
            f"        summary: {state['summary']}\n"
            f"        action:  {state['action']}",
            file=sys.stderr,
        )

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())

    def log_message(self, format, *args):
        pass


def start_webhook_server(port: int) -> HTTPServer:
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[webhook] listening on port {port}", file=sys.stderr)
    return server


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    global webhook_secret

    print("=" * 60, file=sys.stderr)
    print("LangGraph + EEP Agent", file=sys.stderr)
    print(f"Target: {EEP_TARGET}", file=sys.stderr)
    print(f"Webhook port: {WEBHOOK_PORT}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    server = start_webhook_server(WEBHOOK_PORT)

    try:
        info = discover_entity(EEP_TARGET)
        entity_did = info["entity_data"].get("did", "did:web:example.com:u:acme-corp")
        webhook_url = f"http://host.docker.internal:{WEBHOOK_PORT}/hook"

        sub = subscribe(
            info["subscribe_url"],
            entity_did,
            webhook_url,
            api_key=os.environ.get("EEP_API_KEY", "test-api-key"),
        )
        webhook_secret = sub.get("delivery_secret", "")

        print(f"\n[ready] Subscribed. Waiting for events on port {WEBHOOK_PORT}...", file=sys.stderr)
        print("[ready] Press Ctrl+C to stop.\n", file=sys.stderr)

        while True:
            time.sleep(1)

    except httpx.HTTPStatusError as e:
        body = {}
        try:
            body = e.response.json()
        except Exception:
            pass

        proof = handle_gate_challenge(e.response.status_code, body)
        if proof:
            print(f"[gate] Would retry with proofs: {json.dumps(proof, indent=2)}", file=sys.stderr)
        else:
            print(f"[error] HTTP {e.response.status_code}: {e}", file=sys.stderr)
        sys.exit(1)

    except KeyboardInterrupt:
        print(f"\n[done] Received {len(events_received)} events total.", file=sys.stderr)

    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
