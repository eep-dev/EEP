"""
MCP Tool: get_fund_comparison
Fetches fund comparison data from TEFAS API.
"""

from enum import Enum
import requests
from typing import Optional, Dict, Any, List


class ComparisonPeriod(str, Enum):
    WEEKLY = "weekly"
    ONE_MONTH = "1_month"
    THREE_MONTHS = "3_months"
    SIX_MONTHS = "6_months"
    YTD = "ytd"
    ONE_YEAR = "1_year"
    THREE_YEARS = "3_years"
    FIVE_YEARS = "5_years"


PERIOD_MAP = {
    ComparisonPeriod.WEEKLY: "13",
    ComparisonPeriod.ONE_MONTH: "1",
    ComparisonPeriod.THREE_MONTHS: "3",
    ComparisonPeriod.SIX_MONTHS: "6",
    ComparisonPeriod.YTD: "0",
    ComparisonPeriod.ONE_YEAR: "12",
    ComparisonPeriod.THREE_YEARS: "36",
    ComparisonPeriod.FIVE_YEARS: "60",
}


def get_fund_comparison(
    fund_code: str,
    period: ComparisonPeriod = ComparisonPeriod.FIVE_YEARS,
    comparison_funds: Optional[List[str]] = None,
    language: str = "TR"
) -> Dict[str, Any]:
    """
    Get fund comparison data from TEFAS against benchmarks/other funds.
    """
    url = "https://www.tefas.gov.tr/api/funds/fonProfilDtyGetir"
    
    if not comparison_funds:
        comparison_funds = []
        
    payload = {
        "dil": language,
        "fonKodu": fund_code,
        "periyod": PERIOD_MAP.get(period, "60")
    }
    
    for i, kf_kod in enumerate(comparison_funds[:9]):
        payload[f"kf{i+1}kod"] = kf_kod
        
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get("errorCode"):
            return {
                "success": False,
                "error": data.get("errorMessage", "Unknown error"),
                "data": None
            }
        
        result_list = data.get("resultList", [])
        
        return {
            "success": True,
            "data": result_list,
            "count": len(result_list)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "data": None
        }
