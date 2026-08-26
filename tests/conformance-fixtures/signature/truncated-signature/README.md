Signature header carries a truncated token, shorter than a real
HMAC-SHA256/base64 signature. A verifier MUST return a verification
failure (valid=false).

It MUST NOT propagate an exception: Node's `crypto.timingSafeEqual()`
throws `RangeError` when its two buffers differ in length, so an
implementation that compares without a length guard turns this
attacker-controlled input into an unhandled error (HTTP 500) instead
of an authentication failure (HTTP 401). See SPECIFICATION.md §5.3,
receiving-platform requirement 2.

The full, correct signature for this bundle is `v1,fsFPyN/nacY2QTb0lQLeMbEr6YmtCCmdKBJf5hrH+q8=`.
