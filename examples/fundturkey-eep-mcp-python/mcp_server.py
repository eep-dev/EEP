"""
FundTurkey (TEFAS) FastMCP Server.
Exposes standard tools to query, compare, and analyze Turkish investment funds using real TEFAS APIs.
"""

from __future__ import annotations

from typing import Optional, List
from fastmcp import FastMCP

from tools import (
    get_fund_comparison,
    ComparisonPeriod,
    get_fund_returns,
    ReturnPeriod,
)

mcp = FastMCP("FundTurkey TEFAS Server")


@mcp.tool()
def get_fund_returns_tool(
    fund_type: str = "YAT",
    founder_code: Optional[str] = None,
    period: ReturnPeriod = ReturnPeriod.ONE_MONTH,
) -> dict:
    """Get historical yield and returns data for mutual funds or ETFs."""
    return get_fund_returns(
        fund_type=fund_type,
        founder_code=founder_code,
        period=period
    )


@mcp.tool()
def get_fund_comparison_tool(
    fund_code: str,
    period: ComparisonPeriod = ComparisonPeriod.FIVE_YEARS,
    comparison_funds: Optional[List[str]] = None
) -> dict:
    """Compare a fund's yield/returns against key benchmarks (ALTIN, USD, BIST100)."""
    return get_fund_comparison(
        fund_code=fund_code,
        period=period,
        comparison_funds=comparison_funds
    )


if __name__ == "__main__":
    mcp.run()
