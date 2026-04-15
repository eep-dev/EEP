# eep-discovery — Python

> **EEP discovery utilities — Python port of [@eep-dev/discovery](../@eep-dev/discovery).**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../docs/current/SPECIFICATION.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../LICENSE)

## Overview

Python implementation of the three EEP discovery mechanisms (Whitepaper §4):

| Function | Description |
|----------|-------------|
| `validate_manifest()` | Validate `/.well-known/eep.json` manifests |
| `parse_link_header()` | Parse HTTP `Link: <url>; rel="eep"` headers |
| `parse_dns_txt_record()` | Parse `_eep.domain TXT "v=eep1; manifest=..."` records |

## Installation

```bash
pip install -e packages/eep-discovery-python
```

## Usage

```python
from eep_discovery import validate_manifest, parse_link_header, parse_dns_txt_record

# Validate manifest
result = validate_manifest({
    "did": "did:web:example.com",
    "eep_version": "0.1",
    "layers": {"layer1": "https://api.example.com/eep"},
    "supported_content_types": ["application/json"],
    "pqc_ready": False,
    "x402_enabled": True,
})
assert result.valid

# Parse Link header
links = parse_link_header('<https://example.com/eep.json>; rel="eep"')
# [EEPLinkInfo(url='https://...', rel='eep')]

# Parse DNS TXT record
dns = parse_dns_txt_record("v=eep1; manifest=https://example.com/.well-known/eep.json")
assert dns.manifest_url == "https://example.com/.well-known/eep.json"
```

## Tests

```bash
python3 -m pytest tests/ -v
```

Comprehensive tests cover manifest validation, Link header parsing, and DNS TXT parsing.

## License

Apache-2.0
