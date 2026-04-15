# EEP Node.js/Express subscriber example

Shows how to subscribe to and receive events from an [EEP](../../docs/current/SPECIFICATION.md)-compatible platform using Node.js and Express.

## Features

- **Webhook subscription** via `POST /eep/subscribe`
- **HMAC signature verification** (SHA-256) for incoming webhooks
- **Intent verification** handshake (`hub.challenge`)
- **CloudEvents v1.0** envelope parsing

## Quick start

```bash
npm install
cp .env.example .env   # Configure your EEP platform URL and API key
npm start
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `EEP_PLATFORM_URL` | Base URL of the EEP platform (e.g. `https://api.example.com`) |
| `EEP_API_KEY` | API key or Bearer token for authentication |
| `WEBHOOK_SECRET` | HMAC secret received during subscription |
| `PORT` | Server port (default: `3001`) |

## How it works

1. The app creates a webhook subscription for `com.example.entity.*` events.
2. The platform verifies intent by calling your webhook URL with a challenge.
3. Once verified, the platform delivers events as CloudEvents via HTTP POST.
4. Your server verifies each delivery using the `webhook-signature` HMAC header.

## Spec references

- [Webhook subscriptions — §5](../../docs/current/SPECIFICATION.md#5-subscriptions)
- [Security — HMAC signing](../../docs/current/security.md)
- [Delivery guarantees](../../docs/current/delivery_guarantees.md)
