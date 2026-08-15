from __future__ import annotations
from fastmcp import FastMCP
from pydantic import Field
from tools.edgar import get_company_facts


mcp = FastMCP("SEC Edgar Server")

@mcp.tool()
def get_company_facts_tool(ticker: str, user_agent:str=Field(description="Given user agent in the format as <project_name> <acme@corp.org>")) -> dict:
    """Get SEC filing facts (latest assets, net income) for a given company ticker."""
    return get_company_facts(ticker=ticker,user_agent=user_agent)

if __name__ == "__main__":
    mcp.run()
