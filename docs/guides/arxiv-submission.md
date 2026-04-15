# arXiv submission notes (EEP Whitepaper)

Use this when uploading `docs/WHITEPAPER.tex` (or a derived PDF) to [arXiv](https://arxiv.org/). arXiv is a **preprint server** (moderation, not journal peer review). Endorsement rules apply to new accounts—see [arXiv endorsement help](https://info.arxiv.org/help/endorsement.html).

## Suggested subject classes

The whitepaper spans **Internet-scale protocols** (HTTP, well-known URIs, SSE/Webhooks), **identity and access** (DIDs, VCs, gate proofs, signatures), and **agent–entity commerce**. Pick **one primary** and **one or two cross-lists**:

| Priority | arXiv category | Rationale |
|----------|----------------|-----------|
| **Primary** | **cs.NI** (Networking and Internet Architecture) | Normative transport and discovery: URLs, layered HTTP/SSE semantics, real-time delivery, interoperability framing. Best single “home” for a web protocol spec. |
| **Secondary** | **cs.CR** (Cryptography and Security) | Access control, proofs, signatures, DID-bound sessions, threat model material. |
| **Optional** | **cs.DC** (Distributed, Parallel, and Cluster Computing) | Multi-party publisher/subscriber and distributed entity state (if you want extra CS coverage). |
| **Optional** | **cs.CY** (Computers and Society) | Use only if you emphasize governance, regulation, and market analysis sections as the main contribution (usually **not** primary for this document). |

**Practical default for EEP:** **cs.NI** + **cs.CR**.

## LaTeX packaging

- Prefer submitting **full LaTeX sources** with a clean, self-contained tree; avoid non-free fonts or local paths.
- Flatten or `\input` minimal figures; ensure the build works with `pdflatex` (or note `latexmk` if you document it).

## Version alignment

Before citing implementation details, cross-check [SPECIFICATION.md](../current/SPECIFICATION.md) and published HTTP/status examples so the PDF and the canonical spec do not drift.
