"""Simulated agent wallet: Ed25519 + mock USDC transfer id."""

from __future__ import annotations

import base64
import uuid

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


class AgentWallet:
    """Demo wallet: Ed25519 signing + mock tx hashes (no chain spend)."""

    def __init__(self) -> None:
        self._priv = Ed25519PrivateKey.generate()
        self._pub = self._priv.public_key()

    @property
    def public_key_raw(self) -> bytes:
        return self._pub.public_bytes_raw()

    def public_key_b64(self) -> str:
        return base64.b64encode(self.public_key_raw).decode("ascii")

    def did_demo(self) -> str:
        """Short DID-like id for logs (not a full did:key multibase implementation)."""
        # Avoid the substring ":key:" so Rich markup does not render an emoji in terminals.
        return f"did:demo:{self.public_key_b64()[:16]}"

    def sign_utf8(self, message: str) -> str:
        sig = self._priv.sign(message.encode("utf-8"))
        return base64.b64encode(sig).decode("ascii")

    def mock_transfer_usdc(self, _amount: str, _recipient: str) -> str:
        return f"tx_demo_{uuid.uuid4().hex[:12]}"
