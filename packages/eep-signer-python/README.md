# eep-signer (Python)

Python port of [`@eep-dev/signer`](../../packages/@eep-dev/signer) — Standard Webhooks HMAC-SHA256 signing and verification for EEP.

## Install

```bash
pip install -e .
```

## Usage

```python
from eep_signer import EEPSigner, verify_eep_webhook

# Sign a webhook
signer = EEPSigner(secret)
signature = signer.sign(webhook_id, timestamp, raw_body)

# Verify a webhook (low-level)
is_valid = signer.verify(webhook_id, timestamp, signature, raw_body)

# Verify a webhook (convenience — FastAPI / Flask)
from eep_signer import verify_eep_webhook
is_valid = verify_eep_webhook(raw_body, request.headers, secret)
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
