export type { BridgeConfig, MCPIntrospection, MTool, MResource, MServerInfo, GatedToolConfig } from "./types.js";
export { validateBridgeConfig, loadBridgeConfig } from "./config.js";
export { MCPClient } from "./mcp-client.js";
export { toEEPManifest, toServiceCatalog, toGateConfig } from "./mapping.js";
export { evaluateMcpCallAccess, type AccessDecision } from "./gate.js";
export { createBridgeServer } from "./server.js";
