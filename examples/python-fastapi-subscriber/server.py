from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import PlainTextResponse
import hmac
import hashlib
import time
import json
import os
from typing import Optional

"""
EEP Reference Implementation: Python FastAPI Webhook Receiver

This demonstrates correct EEP webhook handling in Python.

Usage:
    EEP_WEBHOOK_SECRET=your_secret uvicorn server:app --port 3000

Requirements:
    pip install fastapi uvicorn
"""

app = FastAPI(title="EEP Webhook Receiver")
SECRET = os.environ.get("EEP_WEBHOOK_SECRET", "")

if not SECRET:
    raise RuntimeError("EEP_WEBHOOK_SECRET environment variable is required")

# In-memory idempotency store (use Redis in production)
processed_event_ids: set[str] = set()


@app.get("/hooks/eep")
async def websub_challenge(
    hub_mode: Optional[str] = None,
    hub_challenge: Optional[str] = None,
    hub_topic: Optional[str] = None,
    hub_lease_seconds: Optional[str] = None,
):
    """
    WebSub Intent Verification endpoint.
    The EEP platform calls this to confirm that you control the delivery_url.
    You must respond with the hub.challenge value as plain text with HTTP 200.
    """
    if hub_mode != "subscribe" or not hub_challenge:
        raise HTTPException(status_code=400, detail="Missing hub.mode or hub.challenge")

    print(f"📬 WebSub verification for topic: {hub_topic}")
    print(f"   Challenge: {hub_challenge}")

    # Return ONLY the challenge string, plain text
    return PlainTextResponse(hub_challenge, status_code=200)


@app.post("/hooks/eep")
async def receive_webhook(request: Request):
    """
    EEP Webhook receiver.
    Verifies HMAC-SHA256 signature and processes the event.
    """
    # Read raw body before any parsing
    raw_body = await request.body()
    raw_body_str = raw_body.decode("utf-8")

    # ── 1. Extract Standard Webhooks headers ──
    webhook_id = request.headers.get("webhook-id")
    webhook_timestamp = request.headers.get("webhook-timestamp")
    webhook_signature = request.headers.get("webhook-signature")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(status_code=401, detail="Missing webhook signature headers")

    # ── 2. Verify timestamp (replay attack prevention) ──
    try:
        timestamp_num = int(webhook_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid webhook-timestamp")

    age_seconds = abs(int(time.time()) - timestamp_num)
    if age_seconds > 60:
        raise HTTPException(
            status_code=401,
            detail=f"Webhook timestamp is {age_seconds}s old (max 60s)"
        )

    # ── 3. Compute and verify HMAC-SHA256 ──
    signed_content = f"{webhook_id}.{webhook_timestamp}.{raw_body_str}"
    expected_hmac = hmac.new(
        SECRET.encode("utf-8"),
        signed_content.encode("utf-8"),
        hashlib.sha256
    ).digest()
    import base64
    expected_sig = f"v1,{base64.b64encode(expected_hmac).decode()}"

    # Timing-safe comparison against possible multi-signature header values.
    candidates = [v for v in webhook_signature.split() if v]
    signature_valid = any(
        hmac.compare_digest(expected_sig.encode(), candidate.encode())
        for candidate in candidates
    )
    if not signature_valid:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # ── 4. Parse event ──
    try:
        event = json.loads(raw_body_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # ── 5. Idempotency check ──
    event_id = event.get("id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Event missing 'id' field")

    if event_id in processed_event_ids:
        print(f"⏩ Duplicate event ignored: {event_id}")
        return {"status": "duplicate", "skipped": True}

    processed_event_ids.add(event_id)

    # ── 6. Process event ──
    event_type = event.get("type", "unknown")
    print(f"✅ EEP event: {event_type}")
    print(f"   ID: {event.get('id')}")
    print(f"   Source: {event.get('source')}")
    print(f"   Time: {event.get('time')}")
    print(f"   Actor: {event.get('eep_actor_type')}")

    handle_event(event)

    return {"status": "processed"}


def handle_event(event: dict):
    """Route events to appropriate handlers."""
    event_type: str = event.get("type", "")

    if event_type.startswith("com.example.entity."):
        handle_entity_event(event)
    elif event_type.startswith("com.example.trust."):
        handle_trust_event(event)
    elif event_type.startswith("com.example.agent."):
        handle_agent_event(event)
    else:
        print(f"   (no handler for {event_type})")


def handle_entity_event(event: dict):
    data = event.get("data", {})
    print(f"   → Entity lifecycle: {event['type']}")
    # Add your business logic here


def handle_trust_event(event: dict):
    data = event.get("data", {})
    prev = data.get("previous_score")
    curr = data.get("current_score")
    print(f"   → Trust change: {prev} → {curr}")
    # Add your business logic here


def handle_agent_event(event: dict):
    print(f"   → Agent event: {event['type']}")
    # Add your business logic here
