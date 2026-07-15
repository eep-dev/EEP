#!/usr/bin/env python3
# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_compliance_cli — EEP conformance test runner.

Python port of @eep-dev/compliance-cli.

Usage:
    eep-compliance --target https://api.yourplatform.com [options]
    python -m eep_compliance_cli --target https://api.yourplatform.com [options]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import Any, Dict, Optional
from urllib.parse import urlparse, parse_qs

import httpx

from .helpers import (
    TestRunner,
    normalize_target,
    validate_cloudevents_envelope,
    validate_eep_extensions,
    check_webhook_headers,
    verify_webhook_signature,
)


# ── Webhook Receiver ───────────────────────────────────────────────────────────

_received_webhook: Optional[Dict[str, Any]] = None
_received_headers: Optional[Dict[str, str]] = None
# The exact request-body bytes (decoded as UTF-8) the sender hashed. Kept
# separately from the parsed JSON: HMAC verification must use these bytes, not
# a re-serialization of the parse (json.dumps reorders keys / changes spacing).
_received_raw_body: Optional[str] = None


class _WebhookHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        challenge = params.get("hub.challenge", [None])[0]
        if challenge:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(challenge.encode())
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")

    def do_POST(self) -> None:
        global _received_webhook, _received_headers, _received_raw_body
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        _received_headers = {k.lower(): v for k, v in self.headers.items()}
        _received_raw_body = body
        try:
            _received_webhook = json.loads(body)
        except json.JSONDecodeError:
            _received_webhook = {"_raw": body}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, format: str, *args: Any) -> None:
        pass  # Suppress default logging


# ── Main CLI ───────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="EEP Compliance CLI — Test your platform's EEP conformance",
    )
    parser.add_argument("--target", "-t", required=True, help="Platform base URL")
    parser.add_argument("--api-key", "-k", default="", help="API key")
    parser.add_argument("--entity", "-e", default="", help="Entity DID or username")
    parser.add_argument("--level", "-l", default="standard", choices=["core", "standard", "full"])
    parser.add_argument("--port", "-p", type=int, default=9876, help="Local port for webhook receiver")
    args = parser.parse_args()

    target = normalize_target(args.target)
    runner = TestRunner()
    client = httpx.Client(timeout=10.0)

    # Start webhook receiver
    server = HTTPServer(("0.0.0.0", args.port), _WebhookHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    webhook_url = f"http://host.docker.internal:{args.port}/hook"

    print(f"\n🔬 EEP Compliance Test — Level: {args.level.upper()}")
    print(f"   Target: {target}")
    print(f"   Entity: {args.entity or '(not specified)'}")
    print("─" * 60)

    # ── CORE TESTS ─────────────────────────────────────────────
    print("\n📋 CORE CONFORMANCE\n")

    # 1. Reachability
    try:
        r = client.get(f"{target}/health", timeout=5)
        if r.status_code < 500:
            runner.pass_("Platform is reachable", f"HTTP {r.status_code}")
            print(f"  ✅ Platform is reachable (HTTP {r.status_code})")
        else:
            runner.fail("Platform is reachable", f"HTTP {r.status_code}")
            print(f"  ❌ Platform is reachable: HTTP {r.status_code}")
    except Exception as e:
        runner.fail("Platform is reachable", str(e))
        print(f"  ❌ Platform is reachable: {e}")

    # 2. EEP discovery via Link header
    if args.entity:
        try:
            entity_url = (
                f"{target}/resolve?did={args.entity}"
                if args.entity.startswith("did:")
                else f"{target}/{args.entity}"
            )
            r = client.get(entity_url, headers={"Accept": "application/json"})
            link = r.headers.get("link", "")
            if 'rel="subscribe"' in link:
                runner.pass_("EEP discovery via Link header", 'rel="subscribe" found')
                print('  ✅ EEP discovery via Link header (rel="subscribe" found)')
            else:
                runner.fail("EEP discovery via Link header", 'Link header missing rel="subscribe"')
                print('  ❌ EEP discovery via Link header: missing rel="subscribe"')
        except Exception as e:
            runner.fail("EEP discovery via Link header", str(e))
            print(f"  ❌ EEP discovery via Link header: {e}")
    else:
        runner.skip("EEP discovery via Link header", "no --entity specified")
        print("  ⚪ EEP discovery via Link header (skipped: no --entity)")

    # 3. Subscription
    subscription_id: Optional[str] = None
    webhook_secret: Optional[str] = None

    if args.api_key and args.entity:
        try:
            body = json.dumps({
                "source_did": args.entity,
                "event_types": ["com.example.entity.*"],
                "delivery_method": "webhook",
                "delivery_url": webhook_url,
            })
            r = client.post(
                f"{target}/eep/subscribe",
                headers={"Authorization": f"Bearer {args.api_key}", "Content-Type": "application/json"},
                content=body,
                timeout=15,
            )
            data = r.json()
            if r.status_code in (200, 201):
                subscription_id = data.get("subscription_id")
                webhook_secret = data.get("delivery_secret")
                runner.pass_("Subscription creation", f"ID: {subscription_id}")
                print(f"  ✅ Subscription creation (ID: {subscription_id})")
            else:
                runner.fail("Subscription creation", f"HTTP {r.status_code}: {json.dumps(data)}")
                print(f"  ❌ Subscription creation: HTTP {r.status_code}")
        except Exception as e:
            runner.fail("Subscription creation", str(e))
            print(f"  ❌ Subscription creation: {e}")
    else:
        runner.skip("Subscription creation", "requires --api-key and --entity")
        print("  ⚪ Subscription creation (skipped)")

    # 4. Webhook delivery + verification
    global _received_webhook, _received_headers, _received_raw_body
    if subscription_id and webhook_secret:
        _received_webhook = None
        _received_headers = None
        _received_raw_body = None

        try:
            client.post(
                f"{target}/eep/subscriptions/{subscription_id}/test",
                headers={"Authorization": f"Bearer {args.api_key}"},
                timeout=5,
            )
        except Exception:
            runner.fail("Test event delivery", "failed to trigger test event")
            print("  ❌ Test event delivery: failed to trigger")

        time.sleep(5)

        if _received_webhook and _received_headers:
            runner.pass_("Webhook delivery received", f"event type: {_received_webhook.get('type')}")
            print(f"  ✅ Webhook delivery received")

            wh = check_webhook_headers(_received_headers)
            if not wh["missing"]:
                runner.pass_("Standard Webhooks headers present")
                print("  ✅ Standard Webhooks headers present")
            else:
                runner.fail("Standard Webhooks headers present", f"missing: {', '.join(wh['missing'])}")
                print(f"  ❌ Standard Webhooks headers: missing {wh['missing']}")

            # Verify HMAC over the exact received bytes (never a re-serialized
            # parse — that is the anti-pattern the TS CLI warns against and the
            # reason this check used to fail against compliant publishers).
            if wh["hasSignature"]:
                result = verify_webhook_signature(
                    webhook_id=_received_headers.get("webhook-id", ""),
                    timestamp=_received_headers.get("webhook-timestamp", ""),
                    raw_body=_received_raw_body or "",
                    secret=webhook_secret,
                    signature_header=_received_headers.get("webhook-signature", ""),
                )
                if result["valid"]:
                    runner.pass_("HMAC-SHA256 signature is valid")
                    print("  ✅ HMAC-SHA256 signature is valid")
                else:
                    runner.fail("HMAC-SHA256 signature is valid", result["reason"])
                    print(f"  ❌ HMAC-SHA256 signature: {result['reason']}")

            # CloudEvents
            ce_missing = validate_cloudevents_envelope(_received_webhook)
            if not ce_missing:
                runner.pass_("CloudEvents envelope valid")
                print("  ✅ CloudEvents envelope valid")
            else:
                runner.fail("CloudEvents envelope valid", f"missing: {ce_missing}")
                print(f"  ❌ CloudEvents envelope: missing {ce_missing}")

            eep_missing = validate_eep_extensions(_received_webhook)
            if not eep_missing:
                runner.pass_("EEP extension attributes present")
                print("  ✅ EEP extension attributes present")
            else:
                runner.fail("EEP extension attributes present", f"missing: {eep_missing}")
                print(f"  ❌ EEP extensions: missing {eep_missing}")
        else:
            runner.fail("Webhook delivery received", "no webhook received within 5s")
            print("  ❌ No webhook received within 5s")

    # ── STANDARD TESTS ─────────────────────────────────────────
    if args.level in ("standard", "full"):
        print("\n📋 STANDARD CONFORMANCE\n")

        if args.entity and args.api_key:
            try:
                r = client.get(
                    f"{target}/eep/stream?source={args.entity}",
                    headers={"Authorization": f"Bearer {args.api_key}", "Accept": "text/event-stream"},
                    timeout=3,
                )
                ct = r.headers.get("content-type", "")
                if "text/event-stream" in ct:
                    runner.pass_("SSE stream endpoint")
                    print("  ✅ SSE stream endpoint")
                else:
                    runner.fail("SSE stream endpoint", f"Content-Type: {ct}")
                    print(f"  ❌ SSE stream: wrong Content-Type: {ct}")
            except httpx.ReadTimeout:
                runner.pass_("SSE stream endpoint", "connection opened (timed out as expected)")
                print("  ✅ SSE stream endpoint (timed out = connected)")
            except Exception as e:
                runner.fail("SSE stream endpoint", str(e))
                print(f"  ❌ SSE stream: {e}")
        else:
            runner.skip("SSE stream endpoint", "requires --api-key and --entity")
            print("  ⚪ SSE stream (skipped)")

        if args.api_key:
            try:
                r = client.get(
                    f"{target}/eep/subscriptions",
                    headers={"Authorization": f"Bearer {args.api_key}"},
                )
                if r.headers.get("x-ratelimit-limit"):
                    runner.pass_("Rate limit headers present")
                    print("  ✅ Rate limit headers present")
                else:
                    runner.fail("Rate limit headers present", "X-RateLimit-Limit missing")
                    print("  ❌ Rate limit headers missing")
            except Exception as e:
                runner.fail("Rate limit headers present", str(e))
                print(f"  ❌ Rate limit headers: {e}")
        else:
            runner.skip("Rate limit headers", "requires --api-key")
            print("  ⚪ Rate limit headers (skipped)")

    # ── SUMMARY ────────────────────────────────────────────────
    s = runner.summary()
    print("\n" + "─" * 60)
    print(f"\n📊 Results: {s['passed']} passed | {s['failed']} failed | {s['skipped']} skipped\n")
    label = runner.conformance_label(args.level)
    print(f"   {label}\n")

    server.shutdown()
    sys.exit(1 if s["failed"] > 0 else 0)


if __name__ == "__main__":
    main()
