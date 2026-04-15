"""Rich Text styling for EEP demo lines (split-pane right column)."""

from __future__ import annotations

import re

from rich.text import Text


def _looks_like_json_line(s: str) -> bool:
    st = s.strip()
    if not st:
        return False
    if st[0] in "{[]}":
        return True
    return '"' in st and ":" in st


def _highlight_loose_json_line(s: str) -> Text:
    t = Text()
    pos = 0
    for m in re.finditer(
        r'"(?:[^"\\]|\\.)*"|-?\d+\.?\d*(?:[eE][+-]?\d+)?|\b(true|false|null)\b',
        s,
    ):
        if m.start() > pos:
            t.append(s[pos : m.start()], style="dim white")
        val = m.group(0)
        if val in ("true", "false", "null"):
            t.append(val, style="magenta")
        elif val.startswith('"'):
            t.append(val, style="bright_yellow")
        else:
            t.append(val, style="green")
        pos = m.end()
    t.append(s[pos:], style="white")
    return t


def stylize_eep_plain_line(line: str) -> Text:
    """Rebuild colors for EEP flow lines after plain capture (no Rich markup in string)."""
    s = line.rstrip("\n\r")
    if not s.strip():
        return Text(s, style="dim")

    if _looks_like_json_line(s):
        return _highlight_loose_json_line(s)

    m = re.match(r"^(\s*)", s)
    lead = m.group(1) if m else ""
    rest = s[len(lead) :] if lead else s
    t = Text()
    if lead:
        t.append(lead, style="dim")

    if rest.startswith("→"):
        t.append("→", style="bold yellow")
        rem = rest[1:].lstrip()
        if rem.upper().startswith("GET "):
            t.append("GET ", style="bold yellow")
            rem = rem[4:].lstrip()
        elif rem.upper().startswith("POST "):
            t.append("POST ", style="bold yellow")
            rem = rem[5:].lstrip()
        um = re.match(r"(https?://\S+)", rem)
        if um:
            t.append(um.group(1), style="cyan")
            rem = rem[um.end() :]
        t.append(rem, style="white")
        return t

    if rest.startswith("←"):
        t.append("←", style="bold yellow")
        rem = rest[1:]
        hm = re.search(r"HTTP\s+(\d{3})", rem)
        if hm:
            pre = rem[: hm.start()]
            code = hm.group(1)
            t.append(pre, style="white")
            st = "green" if code.startswith("2") else "red" if code.startswith(("4", "5")) else "yellow"
            t.append(f"HTTP {code}", style=f"bold {st}")
            t.append(rem[hm.end() :], style="white")
        else:
            t.append(rem, style="white")
        return t

    if rest.startswith("AGENT"):
        t.append("AGENT", style="bold cyan")
        t.append(rest[5:], style="white")
        return t

    if rest.startswith("EEP"):
        t.append("EEP", style="bold magenta")
        t.append(rest[3:], style="white")
        return t

    if "requirement[" in rest or "type=" in rest:
        t.append(rest, style="cyan")
        return t

    if "policy" in rest.lower() or "Publisher DID" in rest:
        t.append(rest, style="dim")
        return t

    if "Signed agreement" in rest or "Mock settlement" in rest:
        t.append(rest, style="bright_white")
        return t

    return Text(rest, style="dim white")
