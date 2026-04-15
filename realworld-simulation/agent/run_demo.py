#!/usr/bin/env python3
"""
Orchestrator: start Next.js + EEP publisher (unless SKIP_SERVER_START=1), run both scenarios, print comparison.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx

from rich.console import Console
from rich.table import Table

from scenario_a.old_web_agent import run_old_web_scenario
from scenario_b.eep_agent import run_eep_scenario
from utils.demo_split import (
    SplitPaneConsole,
    SplitScreenController,
    column_width_for_split,
    min_columns_for_split,
    split_screen_enabled,
)
from utils.terminal_ui import banner, sep

AGENT_DIR = Path(__file__).resolve().parent
ROOT = AGENT_DIR.parent
PROVIDER_DIR = ROOT / "provider"
OLD_URL = os.environ.get("OLD_WEB_URL", "http://127.0.0.1:3401/reports/corpx-q1")
EEP_URL = os.environ.get("EEP_BASE_URL", "http://127.0.0.1:3402")

console = Console()


def _terminal_wide_enough_for_split() -> bool:
    try:
        return shutil.get_terminal_size((100, 24)).columns >= min_columns_for_split()
    except OSError:
        return False


def wait_ready(url: str, timeout_sec: float = 120.0) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=3.0)
            if r.status_code < 500:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Server did not become ready: {url}")


def start_provider_stack() -> list[subprocess.Popen[bytes]]:
    """Start Next.js (3401) and EEP Express (3402) in the provider package."""
    env = os.environ.copy()
    env.setdefault("NODE_ENV", "development")

    p_next = subprocess.Popen(
        ["npx", "next", "dev", "-p", "3401", "--turbopack"],
        cwd=str(PROVIDER_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    p_eep = subprocess.Popen(
        ["npx", "tsx", "eep-server/server.ts"],
        cwd=str(PROVIDER_DIR),
        env={**env, "EEP_PORT": "3402", "EEP_BASE_URL": "http://127.0.0.1:3402"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    return [p_next, p_eep]


def ensure_playwright_browser() -> None:
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        cwd=str(AGENT_DIR),
        check=False,
    )


def kill_processes(procs: list[subprocess.Popen[bytes]]) -> None:
    for p in procs:
        try:
            p.terminate()
            p.wait(timeout=5)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass


async def async_main() -> int:
    banner(console, "EEP Realworld Simulation — Current web (HTML) vs EEP")
    procs: list[subprocess.Popen[bytes]] = []

    if os.environ.get("SKIP_SERVER_START", "").lower() not in ("1", "true", "yes"):
        console.print("[dim]Starting Next.js :3401 and EEP publisher :3402…[/dim]")
        procs = start_provider_stack()
        try:
            wait_ready("http://127.0.0.1:3401/")
            wait_ready(f"{EEP_URL.rstrip('/')}/health")
        except Exception as e:
            kill_processes(procs)
            console.print(f"[red]Startup failed: {e}[/red]")
            return 1
    else:
        console.print("[yellow]SKIP_SERVER_START set — using already-running servers[/yellow]")
        wait_ready("http://127.0.0.1:3401/")
        wait_ready(f"{EEP_URL.rstrip('/')}/health")

    ensure_playwright_browser()

    use_split = split_screen_enabled() and _terminal_wide_enough_for_split()
    if split_screen_enabled() and not _terminal_wide_enough_for_split():
        console.print(
            f"[yellow]DEMO_SPLIT_SCREEN ignored: need terminal width ≥ {min_columns_for_split()} columns.[/yellow]"
        )

    sep(console)
    if use_split:
        console.print(
            "\n[bold]Parallel — Current web (HTML) [left] · EEP protocol [right][/bold]\n"
        )
        with SplitScreenController(console) as split:
            c_left = SplitPaneConsole(split, "left")
            c_right = SplitPaneConsole(split, "right")
            lw = column_width_for_split()
            html_res, eep_res = await asyncio.gather(
                run_old_web_scenario(
                    page_url=OLD_URL,
                    console=c_left,
                    split=split,
                    line_width=lw,
                ),
                run_eep_scenario(eep_base=EEP_URL, console=c_right),
            )
    else:
        console.print("\n[bold]Scenario A — Current web (HTML site)[/bold]\n")
        html_res = await run_old_web_scenario(page_url=OLD_URL, console=console)

        sep(console)
        console.print("\n[bold]Scenario B — EEP publisher[/bold]\n")
        eep_res = await run_eep_scenario(eep_base=EEP_URL, console=console)

    sep(console)
    comp_delay = float(os.environ.get("DEMO_COMPARISON_DELAY_SEC", "1.0"))
    if comp_delay > 0:
        await asyncio.sleep(comp_delay)
    console.print()
    table = Table(title="Comparison (deterministic agents, no LLM spend)")
    table.add_column("Metric", style="cyan", no_wrap=True)
    table.add_column("Current web (HTML)", style="white")
    table.add_column("EEP Protocol", style="green")

    table.add_row("Total time (s)", f"{html_res.seconds:.2f}", f"{eep_res.seconds:.2f}")
    table.add_row("Bytes processed (approx.)", f"{html_res.bytes_processed:,}", f"{eep_res.bytes_processed:,}")
    table.add_row("Tokens est. (chars/4)", f"~{html_res.tokens_est:,}", f"~{eep_res.tokens_est:,}")
    table.add_row("Human interventions (sim.)", str(html_res.human_interventions), str(eep_res.human_interventions))
    table.add_row("Automation", html_res.automation, eep_res.automation)
    table.add_row("Legal agreement signed", str(html_res.legal_signed), str(eep_res.legal_signed))
    table.add_row("Payment path", html_res.payment_method, eep_res.payment_method)
    table.add_row("Data format", html_res.data_format, eep_res.data_format)

    console.print(table)

    kill_processes(procs)
    return 0


def main() -> None:
    try:
        raise SystemExit(asyncio.run(async_main()))
    except KeyboardInterrupt:
        console.print("[yellow]Interrupted[/yellow]")
        raise SystemExit(130)


if __name__ == "__main__":
    main()
