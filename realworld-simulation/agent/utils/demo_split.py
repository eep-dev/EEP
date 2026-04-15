"""Side-by-side terminal panes for parallel Current web vs EEP (Rich Layout + Live)."""

from __future__ import annotations

import os
import re
import shutil
from collections import deque
from io import StringIO
from typing import Literal

from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.markup import escape
from rich.panel import Panel
from rich.text import Text

from utils.demo_export import scroll_lines_to_group
from utils.eep_flow_style import stylize_eep_plain_line

_CSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def _strip_ansi(s: str) -> str:
    return _CSI.sub("", s)


def _cols() -> int:
    try:
        return shutil.get_terminal_size((100, 24)).columns
    except OSError:
        return 100


def split_screen_enabled() -> bool:
    return os.environ.get("DEMO_SPLIT_SCREEN", "").lower() in ("1", "true", "yes")


def min_columns_for_split() -> int:
    return int(os.environ.get("DEMO_SPLIT_MIN_COLS", "100"))


def column_width_for_split() -> int:
    return max(24, (_cols() // 2) - 14)


class SplitScreenController:
    """
    Two vertical panes (left = current web, right = EEP), one Live region.
    Call append_line / set_viewport_panel from async tasks (same thread as asyncio loop).
    """

    def __init__(self, console: Console, *, max_lines: int = 80):
        self.console = console
        self.max_lines = max_lines
        self.left_lines: deque[str] = deque(maxlen=max_lines)
        self.right_lines: deque[Text] = deque(maxlen=max_lines)
        self._live: Live | None = None
        self._root: Layout | None = None
        # While set, that pane shows a viewport overlay (other pane + prints still update).
        self._pane_override: dict[Literal["left", "right"], Panel | None] = {"left": None, "right": None}

    def _left_panel_body(self) -> str:
        if not self.left_lines:
            return "(empty)"
        return "\n".join(escape(str(x)) for x in self.left_lines)

    def _right_panel_body(self) -> Group | Text:
        if not self.right_lines:
            return Text("(empty)", style="dim")
        return Group(*list(self.right_lines))

    def _stack_panel(self, side: Literal["left", "right"]) -> Panel:
        if self._pane_override.get(side):
            return self._pane_override[side]
        w = max(28, (_cols() // 2) - 6)
        title = "Current web (HTML)" if side == "left" else "EEP"
        style = "cyan" if side == "left" else "magenta"
        body: str | Group | Text = self._left_panel_body() if side == "left" else self._right_panel_body()
        return Panel(
            body,
            title=title,
            border_style=style,
            width=w,
            padding=(0, 1),
        )

    def _build_root(self) -> Layout:
        root = Layout()
        root.split_row(
            Layout(self._stack_panel("left"), name="left", ratio=1),
            Layout(self._stack_panel("right"), name="right", ratio=1),
        )
        return root

    def refresh(self) -> None:
        if not self._live or not self._root:
            return
        self._root["left"].update(self._stack_panel("left"))
        self._root["right"].update(self._stack_panel("right"))
        self._live.update(self._root)

    def clear_viewport(self, side: Literal["left", "right"]) -> None:
        self._pane_override[side] = None
        self.refresh()

    def append_line(self, side: Literal["left", "right"], text: str) -> None:
        if side == "left":
            self.left_lines.append(text)
        else:
            self.right_lines.append(stylize_eep_plain_line(text))
        self.refresh()

    def set_viewport_overlay(
        self,
        side: Literal["left", "right"],
        body_lines: list[str],
        subtitle: str,
    ) -> None:
        """Temporarily replace one pane with a fixed-height viewport (4-line scroll)."""
        if not self._live or not self._root:
            return
        w = max(28, (_cols() // 2) - 6)
        panel = Panel(
            scroll_lines_to_group(body_lines),
            title=f"{'Current web' if side == 'left' else 'EEP'} — {subtitle}",
            border_style="cyan" if side == "left" else "magenta",
            width=w,
            padding=(0, 1),
        )
        self._pane_override[side] = panel
        self.refresh()

    def __enter__(self) -> SplitScreenController:
        self._root = self._build_root()
        self._live = Live(
            self._root,
            console=self.console,
            refresh_per_second=15,
            transient=False,
        )
        self._live.__enter__()
        return self

    def __exit__(self, *args: object) -> None:
        if self._live:
            self._live.__exit__(*args)
        self._live = None
        self._root = None


class SplitPaneConsole(Console):
    """Console that renders into one split pane (no full-screen output)."""

    def __init__(self, split: SplitScreenController, side: Literal["left", "right"]) -> None:
        w = max(36, (_cols() // 2) - 10)
        super().__init__(width=w, force_terminal=False, color_system="standard", legacy_windows=False)
        self._split = split
        self._side = side

    def print(self, *args: object, **kwargs: object) -> None:  # type: ignore[override]
        buf = StringIO()
        c2 = Console(
            file=buf,
            width=self.width,
            force_terminal=False,
            color_system="standard",
            legacy_windows=False,
        )
        safe_kw = {k: v for k, v in kwargs.items() if k in ("highlight", "overflow", "crop", "soft_wrap")}
        c2.print(*args, **safe_kw)
        text = buf.getvalue()
        if not text.strip():
            return
        for line in text.rstrip("\n").split("\n"):
            self._split.append_line(self._side, _strip_ansi(line))
