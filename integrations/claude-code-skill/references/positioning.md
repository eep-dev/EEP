# EEP next to MCP (short)

- **EEP:** Subscriptions, SSE/webhooks, who sent what, optional payment or credential gates, discovery (`/.well-known`, entity URLs). You implement against the spec and the middleware packages.
- **MCP:** Expose tools and resources to a model runtime. [`@eep-dev/mcp-bridge`](https://github.com/eep-dev/EEP/tree/main/packages/%40eep-dev/mcp-bridge) bridges an MCP server to EEP-shaped HTTP if you need both in one process.

If the user only asked for “EEP in my API,” start with `npx @eep-dev/agent-adopt` and the integrate guide, not a full MCP tutorial.
