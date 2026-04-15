# eep-validator (Python)

Python port of [`@eep-dev/validator`](../../packages/@eep-dev/validator) — SSRF prevention and payload validation for EEP publishers.

## Install

```bash
pip install -e .
```

## Usage

```python
from eep_validator import validate_ssrf, SSRFError, matches_event_type

# SSRF prevention — call before any outbound request
try:
    await validate_ssrf(delivery_url)
except SSRFError as e:
    return {"error": str(e)}

# Event type matching
matches_event_type("com.example.entity.updated", "com.example.entity.*")  # True
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
