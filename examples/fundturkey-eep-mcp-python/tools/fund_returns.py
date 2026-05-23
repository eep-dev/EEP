"""
MCP Tool: get_fund_returns
Fetches fund return (getiri) data from TEFAS API.
"""

import json
import requests
from enum import Enum
from typing import Optional, Dict, Any


class ReturnPeriod(str, Enum):
    ONE_MONTH = "1_month"
    THREE_MONTHS = "3_months"
    SIX_MONTHS = "6_months"
    ONE_YEAR = "1_year"
    YTD = "ytd"
    THREE_YEARS = "3_years"
    FIVE_YEARS = "5_years"


RETURN_PERIOD_MAP = {
    ReturnPeriod.ONE_MONTH: "donemGetiri1a",
    ReturnPeriod.THREE_MONTHS: "donemGetiri3a",
    ReturnPeriod.SIX_MONTHS: "donemGetiri6a",
    ReturnPeriod.ONE_YEAR: "donemGetiri1y",
    ReturnPeriod.YTD: "donemGetiriyb",
    ReturnPeriod.THREE_YEARS: "donemGetiri3y",
    ReturnPeriod.FIVE_YEARS: "donemGetiri5y",
}


def get_fund_returns(
    fund_type: str = "YAT",
    founder_code: Optional[str] = None,
    sub_fund_type_code: Optional[str] = None,
    fund_type_description: Optional[str] = None,
    fund_type_code: Optional[str] = None,
    fund_group: Optional[str] = None,
    period: ReturnPeriod = ReturnPeriod.ONE_MONTH,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    operation_type: int = 2,
    return_rate: str = "1",
    language: str = "TR"
) -> Dict[str, Any]:
    """
    Get fund returns data from TEFAS.
    """
    url = "https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir"
    
    payload = {
        "dil": language,
        "fonTipi": fund_type,
        "kurucuKodu": founder_code,
        "sfonTurKod": sub_fund_type_code,
        "fonTurAciklama": fund_type_description,
        "islem": 1,
        "fonTurKod": fund_type_code,
        "fonGrubu": fund_group,
        "donemGetiri1a": "0",
        "donemGetiri3a": "0",
        "donemGetiri6a": "0",
        "donemGetiri1y": "0",
        "donemGetiriyb": "0",
        "donemGetiri3y": "0",
        "donemGetiri5y": "0",
        "basTarih": start_date,
        "bitTarih": end_date,
        "calismaTipi": operation_type,
        "getiriOrani": return_rate
    }
    
    target_field = RETURN_PERIOD_MAP.get(period, "donemGetiri1a")
    payload[target_field] = "1"
    
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
