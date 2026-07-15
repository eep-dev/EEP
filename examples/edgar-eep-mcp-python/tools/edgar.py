import requests
from pydantic import Field


def get_company_facts(ticker: str, user_agent:str=Field(description="Given user agent in the format as <project_name> <acme@corp.org>")) -> dict:
    """
    Fetch basic company data/facts from the SEC EDGAR API.
    Uses standard SEC requirements (User-Agent header).
    """
    ticker_upper = ticker.upper().strip()
    
    headers = {
        "User-Agent": user_agent
    }
    
    try:
        mapping_url = "https://www.sec.gov/files/company_tickers.json"
        res = requests.get(mapping_url, headers=headers, timeout=10)
        res.raise_for_status()
        tickers_data = res.json()
        
        cik = None
        for item in tickers_data.values():
            if item["ticker"] == ticker_upper:
                cik = str(item["cik_str"]).zfill(10)
                break
                
        if not cik:
            return {"error": f"Ticker {ticker_upper} not found in SEC database."}
            
        facts_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
        facts_res = requests.get(facts_url, headers=headers, timeout=10)
        facts_res.raise_for_status()
        facts = facts_res.json()
        
        entity_name = facts.get("entityName", "Unknown Company")
        
        us_gaap = facts.get("facts", {}).get("us-gaap", {})
        
        assets_data = us_gaap.get("Assets", {}).get("units", {}).get("USD", [])
        net_income_data = us_gaap.get("NetIncomeLoss", {}).get("units", {}).get("USD", [])
        
        latest_assets = assets_data[-1] if assets_data else {}
        latest_net_income = net_income_data[-1] if net_income_data else {}
        
        return {
            "ticker": ticker_upper,
            "company_name": entity_name,
            "cik": cik,
            "latest_assets": {
                "val": latest_assets.get("val"),
                "fy": latest_assets.get("fy"),
                "fp": latest_assets.get("fp"),
                "form": latest_assets.get("form")
            } if latest_assets else "No data",
            "latest_net_income": {
                "val": latest_net_income.get("val"),
                "fy": latest_net_income.get("fy"),
                "fp": latest_net_income.get("fp"),
                "form": latest_net_income.get("form")
            } if latest_net_income else "No data"
        }
        
    except Exception as e:
        return {"error": f"Failed to retrieve SEC facts: {str(e)}"}
