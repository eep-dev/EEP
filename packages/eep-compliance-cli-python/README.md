# eep-compliance-cli (Python)

Python port of [`@eep-dev/compliance-cli`](../../packages/@eep-dev/compliance-cli) — Run EEP conformance tests against any platform.

## Install

```bash
pip install -e .
```

## Usage

```bash
# Test your platform's conformance
eep-compliance --target https://api.yourplatform.com --api-key sk_... --entity u/acme-corp

# Core conformance only
eep-compliance --target https://api.yourplatform.com --api-key sk_... --entity u/test --level core

# Or run directly
python -m eep_compliance_cli --target https://localhost:3000 --api-key sk_... --entity u/test
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--target` | `-t` | Platform base URL (required) |
| `--api-key` | `-k` | API key for authenticated requests |
| `--entity` | `-e` | Entity DID or username to subscribe to |
| `--level` | `-l` | Conformance level: `core`, `standard`, `full` (default: `standard`) |
| `--port` | `-p` | Local port for webhook receiver (default: `9876`) |

## Conformance levels

| Level | Tests |
|-------|-------|
| 🥉 Core | Reachability, discovery, subscription, webhook delivery, HMAC, CloudEvents |
| 🥈 Standard | Core + SSE endpoint, rate limit headers |
| 🏆 Full | Standard + (future tests) |

## Tests

```bash
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
