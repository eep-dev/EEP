"""
Tools package for FundTurkey TEFAS MCP Server.
Only exports the tools used by the EEP gated bridge demo.
"""

from .fund_comparison import get_fund_comparison, ComparisonPeriod
from .fund_returns import get_fund_returns, ReturnPeriod
