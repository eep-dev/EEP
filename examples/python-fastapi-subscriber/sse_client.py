#!/usr/bin/env python3
# Copyright 2026 EEP Contributors — Apache-2.0
"""
EEP SSE Client Example — Python

Demonstrates EEP Layer 2 Server-Sent Events (SSE) stream consumption:
  1. Connect to an EEP publisher's SSE endpoint
  2. Parse CloudEvents delivered as SSE messages
  3. Reconnect with Last-Event-ID for replay (gap recovery)

Usage:
    pip install httpx httpx-sse
    EEP_PLATFORM_URL=https://api.example.com EEP_API_KEY=sk_... python sse_client.py

Whitepaper reference: §5.2 — Signal Stream Layer (SSE)
"""

from __future__ import annotations

import json
import os
import sys
import time

import httpx

try:
    from httpx_sse import connect_sse
except ImportError:
    print("ERROR: httpx-sse is required. Install with: pip install httpx-sse")
    sys.exit(1)

PLATFORM_URL = os.environ.get("EEP_PLATFORM_URL", "http://localhost:3002")
API_KEY = os.environ.get("EEP_API_KEY", "")
ENTITY = os.environ.get("EEP_ENTITY", "did:web:example.com:u:test-entity")
MAX_RECONNECT_DELAY = 30  # seconds


def main() -> None:
    last_event_id: str | None = None
    reconnect_delay = 1  # start at 1 second

    print(f"🔗 EEP SSE Client — connecting to {PLATFORM_URL}")
    print(f"   Entity: {ENTITY}\n")

    while True:
        try:
            headers: dict[str, str] = {
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache",
            }
            if API_KEY:
                headers["Authorization"] = f"Bearer {API_KEY}"
            if last_event_id:
                headers["Last-Event-ID"] = last_event_id
                print(f"🔄 Reconnecting with Last-Event-ID: {last_event_id}")

            with httpx.Client(timeout=None) as client:
                stream_url = f"{PLATFORM_URL}/eep/stream?source={ENTITY}"

                with connect_sse(client, "GET", stream_url, headers=headers) as event_source:
                    # Reset reconnect delay on successful connection
                    reconnect_delay = 1
                    print("✅ SSE connection established\n")

                    for sse in event_source.iter_sse():
                        # Track event ID for reconnection replay
                        if sse.id:
                            last_event_id = sse.id

                        # Skip heartbeat/keep-alive events
                        if sse.event == "heartbeat" or not sse.data:
                            continue

                        # Parse CloudEvents payload
                        try:
                            event = json.loads(sse.data)
                        except json.JSONDecodeError:
                            print(f"⚠️  Non-JSON SSE data: {sse.data[:100]}")
                            continue

                        handle_event(event, sse.id or "?")

        except httpx.ReadTimeout:
            print("\n⏱️  SSE connection timed out (no data)")
        except httpx.ConnectError as e:
            print(f"\n❌ Connection failed: {e}")
        except KeyboardInterrupt:
            print("\n\n👋 SSE client stopped")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")

        # Exponential backoff for reconnection
        print(f"\n🔄 Reconnecting in {reconnect_delay}s...")
        time.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, MAX_RECONNECT_DELAY)


def handle_event(event: dict, event_id: str) -> None:
    """Process a CloudEvents event from the SSE stream."""
    event_type = event.get("type", "unknown")
    source = event.get("source", "?")
    timestamp = event.get("time", "?")

    print(f"📨 SSE Event [{event_id}]")
    print(f"   Type:   {event_type}")
    print(f"   Source: {source}")
    print(f"   Time:   {timestamp}")

    # EEP extension attributes
    eep_version = event.get("eep_version")
    actor_type = event.get("eep_actor_type")
    if eep_version:
        print(f"   EEP:    v{eep_version} (actor: {actor_type or 'unknown'})")

    # Route by event type
    data = event.get("data", {})
    if event_type.startswith("com.example.entity."):
        print(f"   → Entity event: {json.dumps(data, indent=2)[:200]}")
    elif event_type.startswith("com.example.trust."):
        prev = data.get("previous_score")
        curr = data.get("current_score")
        print(f"   → Trust change: {prev} → {curr}")
    elif event_type.startswith("com.example.commerce."):
        print(f"   → Commerce event: {event_type}")
    else:
        print(f"   → Data: {json.dumps(data)[:200]}")

    print()


if __name__ == "__main__":
    main()
