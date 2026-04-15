"""Scenario A — current HTML site: fetch HTML, hit walls, Playwright extracts JSON."""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from playwright.async_api import async_playwright
from rich.console import Console

from utils.demo_export import (
    animate_sliding_viewport,
    build_html_scroll_buffer,
    build_json_scroll_buffer,
    demo_phase_pause,
    html_parse_viewport_lines,
    print_current_web_exports,
    resolve_viewport_height,
    scroll_buffer_max_lines,
)
from utils.token_counter import estimate_tokens_from_text


@dataclass
class ScenarioResult:
    label: str
    seconds: float
    bytes_processed: int
    tokens_est: int
    human_interventions: int
    automation: str
    legal_signed: bool
    payment_method: str
    data_format: str
    sample: str
    html_parse_lines: list[str] = field(default_factory=list)
    parsed_report: dict | None = None


def _env_truthy(name: str) -> bool:
    return os.environ.get(name, "").lower() in ("1", "true", "yes")


async def run_old_web_scenario(
    page_url: str | None = None,
    human_pause_sec: float = 2.0,
    console: Console | None = None,
    split: Any = None,
    line_width: int | None = None,
) -> ScenarioResult:
    """Deterministic pipeline (no LLM): Live parse viewports → exports."""
    c = console or Console()
    url = page_url or os.environ.get("OLD_WEB_URL", "http://127.0.0.1:3401/reports/corpx-q1")
    t0 = time.perf_counter()
    bytes_total = 0
    tokens = 0

    c.print(f"[dim]GET[/dim] [cyan]{url}[/cyan]")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url)
        r.raise_for_status()
        html = r.text
        bytes_total += len(html.encode("utf-8"))
        tokens += estimate_tokens_from_text(html)
        c.print(
            f"[dim]←[/dim] HTTP {r.status_code}  {r.headers.get('content-type', '?')[:40]}  "
            f"[dim]~{len(html):,} chars[/dim]"
        )

    await demo_phase_pause()

    if line_width is not None:
        lw = line_width
    elif split is not None:
        from utils.demo_split import column_width_for_split

        lw = column_width_for_split()
    else:
        lw = None

    vh = resolve_viewport_height(split=split is not None)
    buf_lines = scroll_buffer_max_lines(vh)
    html_buf = build_html_scroll_buffer(html, max_lines=buf_lines, line_width=lw)
    base_step = float(os.environ.get("DEMO_VIEWPORT_STEP_SEC", "0.18"))
    html_step = float(os.environ.get("DEMO_HTML_VIEWPORT_STEP_SEC", str(base_step / 2)))
    json_step = float(os.environ.get("DEMO_JSON_VIEWPORT_STEP_SEC", str(base_step)))
    await animate_sliding_viewport(
        c,
        html_buf,
        title="Current web — HTML parse stream (agent)",
        viewport_height=vh,
        step_delay=html_step,
        split=split,
        side="left",
        overlay_title="HTML parse stream",
    )

    await demo_phase_pause()

    c.print(
        "[dim]Gates detected (login + subscription). Simulating user: SSO sign-in, then card checkout…[/dim]"
    )
    await demo_phase_pause()
    await asyncio.sleep(human_pause_sec)
    await asyncio.sleep(human_pause_sec)

    await demo_phase_pause()

    report_obj: dict | None = None
    raw: str | None = None
    headless = not _env_truthy("PLAYWRIGHT_HEADED")
    slow_mo_ms = int(os.environ.get("PLAYWRIGHT_SLOW_MO_MS", "0") or "0")
    c.print(
        f"[dim]Playwright Chromium (headless={headless}"
        f"{f', slow_mo={slow_mo_ms}ms' if slow_mo_ms else ''}) → #report-data[/dim]"
    )
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless, slow_mo=slow_mo_ms or None)
        try:
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle", timeout=60_000)
            raw = await page.eval_on_selector("#report-data", "el => el.textContent")
            if raw:
                bytes_total += len(raw.encode("utf-8"))
                tokens += estimate_tokens_from_text(raw)
                report_obj = json.loads(raw.strip())
        finally:
            await browser.close()

    if raw and raw.strip():
        await demo_phase_pause()
        json_buf = build_json_scroll_buffer(raw.strip(), max_lines=buf_lines, line_width=lw)
        await animate_sliding_viewport(
            c,
            json_buf,
            title="Current web — parse stream (#report-data → JSON)",
            viewport_height=vh,
            step_delay=json_step,
            split=split,
            side="left",
            overlay_title="#report-data → JSON",
        )

    await demo_phase_pause()
    await print_current_web_exports(c, report_obj)

    elapsed = time.perf_counter() - t0
    sample = json.dumps(report_obj, indent=2, ensure_ascii=False) if report_obj else ""
    html_flow = html_parse_viewport_lines(html)

    return ScenarioResult(
        label="Current web (HTML)",
        seconds=elapsed,
        bytes_processed=bytes_total,
        tokens_est=tokens,
        human_interventions=2,
        automation="Partial",
        legal_signed=False,
        payment_method="Credit card (not available to agent)",
        data_format="HTML + hidden JSON (scraped)",
        sample=sample,
        html_parse_lines=html_flow,
        parsed_report=report_obj,
    )


class OldWebScenarioAgent(BaseAgent):
    """Google ADK shell over the deterministic pipeline (no LLM)."""

    def __init__(self) -> None:
        super().__init__(
            name="old_web_scenario",
            description="Fetches current CorpX HTML report page and extracts data via Playwright.",
        )

    async def _run_async_impl(self, ctx):  # type: ignore[override]
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text="[Current web] Starting deterministic scrape pipeline (no LLM).")],
            ),
        )
        result = await run_old_web_scenario()
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        text=(
                            f"[Current web] Completed in {result.seconds:.2f}s, "
                            f"~{result.tokens_est} tokens est., "
                            f"human interventions (simulated): {result.human_interventions}"
                        )
                    )
                ],
            ),
        )
