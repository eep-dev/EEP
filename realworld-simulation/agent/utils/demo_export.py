"""Demo views: sliding parse viewport (Rich Live), tables, JSON."""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from typing import Any, Literal

from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text


def _term_width() -> int:
    try:
        return shutil.get_terminal_size((96, 24)).columns
    except OSError:
        return 96


def _term_height() -> int:
    try:
        return shutil.get_terminal_size((96, 24)).lines
    except OSError:
        return 24


def resolve_viewport_height(*, split: bool) -> int:
    """Tall sliding window: uses most of the terminal (esp. split panes), not only 4 lines."""
    raw = os.environ.get("DEMO_VIEWPORT_HEIGHT", "").strip()
    if raw.isdigit():
        return max(4, min(60, int(raw)))
    rows = _term_height()
    reserve = 7 if split else 9
    if split:
        v = rows - reserve
        return max(12, min(42, v))
    return max(8, min(32, (rows - reserve)))


def scroll_buffer_max_lines(viewport_h: int) -> int:
    """Enough lines in the buffer for a long upward scroll."""
    env = os.environ.get("DEMO_SCROLL_BUFFER_LINES", "").strip()
    if env.isdigit():
        return max(40, min(400, int(env)))
    return min(240, max(96, viewport_h * 8))


async def demo_phase_pause() -> None:
    """Pause between major simulation beats (viewer pacing)."""
    sec = float(os.environ.get("DEMO_PHASE_PAUSE_SEC", "1.0"))
    if sec > 0:
        await asyncio.sleep(sec)


def wrap_to_lines(text: str, width: int) -> list[str]:
    """Word-wrap into lines of at most `width` characters."""
    collapsed = " ".join(text.split())
    if not collapsed:
        return [""]
    words = collapsed.split()
    lines: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for word in words:
        if len(word) > width:
            if cur:
                lines.append(" ".join(cur))
                cur = []
                cur_len = 0
            for j in range(0, len(word), width):
                lines.append(word[j : j + width])
            continue
        add_len = len(word) if not cur else 1 + len(word)
        if not cur:
            cur = [word]
            cur_len = len(word)
        elif cur_len + add_len <= width:
            cur.append(word)
            cur_len += add_len
        else:
            lines.append(" ".join(cur))
            cur = [word]
            cur_len = len(word)
    if cur:
        lines.append(" ".join(cur))
    return lines if lines else [""]


_SECTION = "►SECTION►"
_RULE = "►RULE►"


def _inject_phase_markers(lines: list[str], kind: Literal["html", "json"], width: int) -> list[str]:
    if len(lines) < 6:
        return lines
    wl = min(48, max(24, width))
    heavy = "━" * wl
    light = "─" * wl
    if kind == "html":
        s1 = f"{_SECTION} · HTML · head & transport"
        s2 = f"{_SECTION} · HTML · body / DOM"
        s3 = f"{_SECTION} · HTML · scripts & data"
    else:
        s1 = f"{_SECTION} · JSON · envelope"
        s2 = f"{_SECTION} · JSON · nesting & arrays"
        s3 = f"{_SECTION} · JSON · values & tail"
    a = len(lines) // 3
    b = (2 * len(lines)) // 3
    out: list[str] = []
    for i, ln in enumerate(lines):
        if i == 0:
            out.append(s1)
            out.append(f"{_RULE}{heavy}")
        elif i == a:
            out.append(s2)
            out.append(f"{_RULE}{light}")
        elif i == b:
            out.append(s3)
            out.append(f"{_RULE}{light}")
        out.append(ln)
    return out


def build_html_scroll_buffer(
    html: str,
    *,
    max_lines: int = 120,
    line_width: int | None = None,
    inject_markers: bool = True,
) -> list[str]:
    """Long buffer of wrapped HTML lines for sliding-window animation."""
    w = line_width or max(36, min(72, _term_width() - 8))
    collapsed = " ".join(html.split())
    cap = min(len(collapsed), max_lines * w * 2)
    raw_lines = wrap_to_lines(collapsed[:cap], w)[:max_lines]
    out: list[str] = []
    for i, ln in enumerate(raw_lines):
        out.append(f"html[{i:03d}] │ {ln}")
    if not out:
        return ["html[000] │ "]
    if inject_markers:
        out = _inject_phase_markers(out, "html", w)
    return out


def build_json_scroll_buffer(
    raw_text: str,
    *,
    max_lines: int = 96,
    line_width: int | None = None,
    inject_markers: bool = True,
) -> list[str]:
    """Wrapped lines of pretty JSON (or raw) for second-phase scroll."""
    w = line_width or max(36, min(72, _term_width() - 12))
    try:
        obj = json.loads(raw_text.strip())
        pretty = json.dumps(obj, indent=2, ensure_ascii=False)
    except json.JSONDecodeError:
        pretty = raw_text
    raw_lines = wrap_to_lines(pretty, w)[:max_lines]
    out: list[str] = []
    for i, ln in enumerate(raw_lines):
        out.append(f"json[{i:03d}] │ {ln}")
    if not out:
        return ["json[000] │ {}"]
    if inject_markers:
        out = _inject_phase_markers(out, "json", w)
    return out


_LINE_RE = re.compile(r"^(html|json)\[(\d{3})\] │ (.*)$", re.DOTALL)


def _highlight_html_payload(rest: str) -> Text:
    t = Text()
    if not rest:
        return t
    for part in re.split(r"(<[^>]{0,400}>)", rest):
        if not part:
            continue
        if len(part) > 1 and part[0] == "<" and part[-1] == ">":
            t.append(part, style="bold magenta")
        elif any(k in part.lower() for k in ("script", "style", "link", "meta")):
            t.append(part, style="yellow")
        else:
            t.append(part, style="white")
    return t


def _highlight_json_payload(rest: str) -> Text:
    t = Text()
    pos = 0
    for m in re.finditer(
        r'"(?:[^"\\]|\\.)*"|-?\d+\.?\d*(?:[eE][+-]?\d+)?|\b(true|false|null)\b',
        rest,
    ):
        if m.start() > pos:
            t.append(rest[pos : m.start()], style="dim white")
        s = m.group(0)
        if s in ("true", "false", "null"):
            t.append(s, style="magenta")
        elif s.startswith('"'):
            t.append(s, style="bright_yellow")
        else:
            t.append(s, style="green")
        pos = m.end()
    t.append(rest[pos:], style="white")
    return t


def stylize_scroll_line(line: str) -> Text:
    if line.startswith(_SECTION):
        body = line[len(_SECTION) :].lstrip()
        tx = Text()
        tx.append("▎ ", style="bold yellow")
        tx.append(body, style="bold white")
        return tx
    if line.startswith(_RULE):
        rest = line[len(_RULE) :]
        return Text(rest, style="dim yellow")
    m = _LINE_RE.match(line)
    if m:
        kind, idx, rest = m.groups()
        idx_style = "bold cyan" if kind == "html" else "bold green"
        tx = Text()
        tx.append(kind + "[", style=idx_style)
        tx.append(idx, style=idx_style)
        tx.append("] ", style=idx_style)
        tx.append("│ ", style="dim")
        if kind == "html":
            tx.append(_highlight_html_payload(rest))
        else:
            tx.append(_highlight_json_payload(rest))
        return tx
    return Text(line, style="dim")


def scroll_lines_to_group(lines: list[str]) -> Group:
    return Group(*[stylize_scroll_line(line) for line in lines])


def _viewport_panel(lines: list[str], title: str, *, panel_width: int | None = None) -> Panel:
    w = panel_width if panel_width is not None else min(110, _term_width() - 2)
    return Panel(
        scroll_lines_to_group(lines),
        title=title,
        border_style="dim",
        padding=(0, 1),
        width=w,
    )


async def animate_sliding_viewport(
    console: Console,
    scroll_lines: list[str],
    *,
    title: str,
    viewport_height: int | None = None,
    step_delay: float | None = None,
    max_steps: int | None = None,
    split: Any = None,
    side: Literal["left", "right"] = "left",
    overlay_title: str | None = None,
) -> None:
    """
    Sliding viewport: window moves down the buffer (text scrolls upward). Height follows terminal
    (see resolve_viewport_height). Split mode: SplitScreenController overlay; else Rich Live full width.
    """
    from utils.demo_split import SplitScreenController

    delay = float(
        step_delay if step_delay is not None else os.environ.get("DEMO_VIEWPORT_STEP_SEC", "0.18")
    )
    vh = viewport_height if viewport_height is not None else resolve_viewport_height(split=split is not None)
    buf = list(scroll_lines)
    if not buf:
        buf = ["·"] * vh
    while len(buf) < vh:
        buf.append(buf[-1])
    total_positions = len(buf) - vh + 1
    cap = max_steps if max_steps is not None else int(os.environ.get("DEMO_VIEWPORT_MAX_STEPS", "120"))
    n_steps = min(total_positions, max(1, cap))
    sub = overlay_title or title
    if split is not None:
        assert isinstance(split, SplitScreenController)
        for start in range(n_steps):
            chunk = buf[start : start + vh]
            split.set_viewport_overlay(side, chunk, sub)
            await asyncio.sleep(delay)
        split.clear_viewport(side)
        return

    first = buf[0:vh]
    pw = max(40, min(110, _term_width() - 2))
    initial = _viewport_panel(first, title, panel_width=pw)
    with Live(initial, console=console, refresh_per_second=20, transient=False) as live:
        for start in range(1, n_steps):
            chunk = buf[start : start + vh]
            live.update(_viewport_panel(chunk, title, panel_width=pw))
            await asyncio.sleep(delay)


def build_report_kpi_table(report: dict[str, Any]) -> Table:
    t = Table(title="Exported KPIs (from parsed fields)", show_header=True, header_style="bold")
    t.add_column("Field", style="cyan", no_wrap=True)
    t.add_column("Value", style="white")
    for key in ("report", "company", "revenue", "net_income", "yoy_growth", "guidance", "generated_at"):
        if key in report:
            t.add_row(key, str(report[key]))
    return t


def build_segments_table(report: dict[str, Any]) -> Table | None:
    segs = report.get("segments")
    if not isinstance(segs, list) or not segs:
        return None
    t = Table(title="Segments (tabular export)", show_header=True, header_style="bold")
    t.add_column("Segment", style="cyan")
    t.add_column("Revenue", style="white")
    t.add_column("Growth", style="white")
    for row in segs:
        if not isinstance(row, dict):
            continue
        t.add_row(
            str(row.get("name", "—")),
            str(row.get("revenue", "—")),
            str(row.get("growth", "—")),
        )
    return t


async def print_current_web_exports(console: Console, report: dict[str, Any] | None) -> None:
    """After Scenario A: KPI + segments tables, then full JSON (static), with pacing between blocks."""
    pause = float(os.environ.get("DEMO_EXPORT_SECTION_PAUSE_SEC", "0.5"))
    if not report:
        console.print("[dim](no structured report to tabulate)[/dim]")
        return

    console.print()
    console.print(build_report_kpi_table(report))
    if pause > 0:
        await asyncio.sleep(pause)

    seg = build_segments_table(report)
    if seg:
        console.print()
        console.print(seg)
        if pause > 0:
            await asyncio.sleep(pause)

    console.print()
    if pause > 0:
        await asyncio.sleep(pause)
    console.print("[dim]Current web — JSON (normalized from #report-data)[/dim]")
    if pause > 0:
        await asyncio.sleep(pause)
    syntax = Syntax(
        json.dumps(report, indent=2, ensure_ascii=False),
        "json",
        theme="ansi_dark",
        word_wrap=True,
    )
    console.print(syntax)


def print_eep_final_json(console: Console, final_json: str) -> None:
    console.print()
    console.print("[dim]EEP — final resource JSON (after gates)[/dim]")
    console.print(final_json, markup=False, highlight=False)


# Back-compat: static 4-line snapshot (ADK / callers)
def html_parse_viewport_lines(html: str, *, max_lines: int = 4) -> list[str]:
    buf = build_html_scroll_buffer(html, max_lines=32, inject_markers=False)
    return buf[:max_lines] if buf else [""]
