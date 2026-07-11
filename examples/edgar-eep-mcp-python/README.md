# SEC EDGAR EEP-MCP Python Example

This example demonstrates gating company facts retrieval from the **SEC EDGAR API** using the **Entity Engagement Protocol (EEP)**.

## Quick Start

1. Install dependencies and EEP Python bridge:
   ```bash
   pip install -r requirements.txt
   pip install -e ../../packages/eep-mcp-bridge-python
   ```

2. Run the provider server:
   ```bash
   python eep_provider.py
   ```

3. Call the client demo in another terminal:
   ```bash
   python client_demo.py
   ```
