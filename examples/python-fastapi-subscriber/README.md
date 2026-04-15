# EEP Python/FastAPI subscriber example

Shows how to subscribe to and receive events from an [EEP](../../docs/current/SPECIFICATION.md)-compatible platform using Python and FastAPI.

## Features

- **Webhook subscription** via `POST /eep/subscribe`
- **HMAC signature verification** (SHA-256) for incoming webhooks
- **Intent verification** handshake (`hub.challenge`)
- **CloudEvents v1.0** envelope parsing
- **SSE stream** consumption via `httpx-sse`

## Quick start

```bash
pip install -r requirements.txt
cp .env.example .env   # Configure your EEP platform URL and API key
uvicorn main:app --reload --port 3002
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `EEP_PLATFORM_URL` | Base URL of the EEP platform (e.g. `https://api.example.com`) |
| `EEP_API_KEY` | API key or Bearer token for authentication |
| `WEBHOOK_SECRET` | HMAC secret received during subscription |

## How it works

1. The app creates a webhook subscription for `com.example.entity.*` events.
2. The platform verifies intent by calling your webhook URL with a challenge.
3. Once verified, the platform delivers events as CloudEvents via HTTP POST.
4. Your server verifies each delivery using the `webhook-signature` HMAC header.

## SSE mode

The example includes an SSE client to connect to the platform's signal stream:

```bash
python sse_client.py
```

## Spec references

- [Webhook subscriptions — §5](../../docs/current/SPECIFICATION.md#5-subscriptions)
- [Signal stream (SSE) — §4](../../docs/current/SPECIFICATION.md#4-signal-stream-sse)
- [Security — HMAC signing](../../docs/current/security.md)
