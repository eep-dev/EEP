"""Rich helpers for the realworld demo (agent / site / EEP roles)."""

from __future__ import annotations

from rich.console import Console
from rich.panel import Panel


def get_console() -> Console:
    return Console()


def banner(console: Console, title: str) -> None:
    console.print(Panel.fit(title, style="bold cyan"))


def sep(console: Console) -> None:
    console.rule(style="dim")


def agent_say(console: Console, message: str) -> None:
    console.print(f"[bold cyan]AGENT[/bold cyan]  {message}")


def site_say(console: Console, message: str) -> None:
    console.print(f"[bold green]SITE[/bold green]   [dim]:3401[/dim] {message}")


def eep_say(console: Console, message: str) -> None:
    console.print(f"[bold magenta]EEP[/bold magenta]    [dim]:3402[/dim] {message}")


def http_line(console: Console, method: str, url: str, extra: str = "") -> None:
    """Log an outbound HTTP-style request (agent → site)."""
    tail = f"  {extra}" if extra else ""
    console.print(f"         [yellow]→[/yellow] [dim]{method}[/dim] {url}{tail}")


def wire_in(console: Console, summary: str) -> None:
    """Log an inbound wire result (site → agent): status line or short summary."""
    console.print(f"         [yellow]←[/yellow] {summary}")


def note(console: Console, message: str) -> None:
    console.print(f"         [dim]{message}[/dim]")
