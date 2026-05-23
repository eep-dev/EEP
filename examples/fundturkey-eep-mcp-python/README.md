# FundTurkey (TEFAS) EEP-MCP Python Example

This example demonstrates how to use the **Entity Engagement Protocol (EEP)** as a monetisation, identity, and security gate layer on top of a **Model Context Protocol (MCP)** server.

Specifically, it gates premium financial tools from **`tefas-mcp-server`** (a Turkish Investment Funds tracking service) using EEP's **Payment Gate** and **Agreement Gate** mechanics. 

Use this tool and see the financial platform.

---

## Architecture Overview

Standard MCP servers execute tools, but do not natively provide zero-trust identity, payment gateways, or cryptographic agreements. EEP solves this.

```
                  ┌───────────────────────────────────────────────┐
                  │                 EEP GATEWAY                   │
                  │                                               │
  EEP Agent ─────▶│  /.well-known/eep.json (EEP Discovery)        │
  (Payment Proof) │  /eep/services (EEP Service Catalog)          │
                  │  /mcp/tools/call (EEP Guarded Facade)         │
                  │        │                                      │
                  │        ▼ evaluate_mcp_call_access             │
                  │  [Payment Gate Verification]                  │
                  │        │ (passed)                             │
                  └────────┼──────────────────────────────────────┘
                           │ POST /tools/call
                           ▼
                  ┌───────────────────────────────────────────────┐
                  │              FASTMCP HTTP PROXY               │
                  │  Translates EEP-MCP requests to python calls  │
                  └────────┬──────────────────────────────────────┘
                           │ in-process import & execution
                           ▼
                  ┌───────────────────────────────────────────────┐
                  │           FASTMCP SERVER (server.py)          │
                  └───────────────────────────────────────────────┘
```

---

## Gated Business Rules

This example applies the following gates to the FundTurkey tools:
*   **`get_fund_comparison_tool`** (Premium Comparison): Gated by a **`payment` requirement** requiring `0.05 USD` per call. Calls without a valid payment proof return `HTTP 402 Payment Required`.
*   **`get_fund_returns_tool`** (Fund Returns): Gated by an **`agreement` requirement** (such as signing terms of service / data access policies).

---

## Run the Self-Contained Demo

This directory contains `mcp_server.py`, a simulated standalone `tefas-mcp-server` that allows you to run and test the complete EEP gating flow immediately.

### 1. Installation

Set up a virtual environment and install the required dependencies (including the local EEP Python bridge):

```bash
# Set up virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install the EEP bridge package from the local monorepo path
pip install -e ../../packages/eep-mcp-bridge-python
```

### 2. Launch the EEP-MCP Server (Terminal 1)

Launch `eep_provider.py` to start both the FastMCP HTTP proxy and the EEP bridge:

```bash
python eep_provider.py
```

Output:
```text
🔌 FastMCP HTTP Adapter running on http://localhost:8001
EEP MCP bridge listening on 0.0.0.0:3005
```

### 3. Run the Client Demo (Terminal 2)

In a separate terminal window (with `.venv` activated), run the subscriber client:

```bash
python client_demo.py
```

The client will:
1.  Discover the EEP manifest and list available tools.
2.  Attempt to call `get_fund_comparison_tool` without proof and receive `HTTP 402 Payment Required`.
3.  Automatically build a mock payment proof and retry.
4.  Receive a successful `200 OK` return with real-time fund comparison statistics.

---