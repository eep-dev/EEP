export interface MTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface MResource {
  uri: string;
  name?: string;
  mimeType?: string;
}

export interface MServerInfo {
  name: string;
  version?: string;
}

export interface MCPIntrospection {
  server: MServerInfo;
  tools: MTool[];
  resources: MResource[];
}

export interface GatedToolConfig {
  type: "payment" | "agreement" | "credential" | "public";
  amount?: number;
  currency?: string;
  credential_type?: string;
}

export interface BridgeConfig {
  did: string;
  baseUrl: string;
  mcpBaseUrl: string;
  legacyApiKey?: string;
  sourceDid?: string;
  strictSemanticVerification?: boolean;
  gatedTools?: Record<string, GatedToolConfig>;
}
