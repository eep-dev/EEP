"""Rough token estimate from byte/char counts (no paid LLM API)."""


def estimate_tokens_from_text(text: str) -> int:
    """Heuristic: ~4 characters per token for English-ish text."""
    return max(1, len(text) // 4)


def estimate_tokens_from_bytes(n: int) -> int:
    return max(1, n // 4)
