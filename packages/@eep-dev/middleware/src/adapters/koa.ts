import { EEPServer, type EEPServerOptions } from "../core/eep-server.js";
import type { IncomingRequest, OutgoingResponse, RouteDefinition } from "../core/request-handler.js";

export type KoaContextLike = {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  request?: {
    body?: unknown;
  };
};

export type KoaRouteBinding = {
  method: RouteDefinition["method"];
  path: string;
  operationId: string;
  execute: (ctx: KoaContextLike) => Promise<OutgoingResponse>;
};

function toIncomingRequest(definition: RouteDefinition, ctx: KoaContextLike): IncomingRequest {
  return {
    method: (ctx.method?.toUpperCase() ?? definition.method) as IncomingRequest["method"],
    path: ctx.path ?? definition.path,
    headers: ctx.headers ?? {},
    query: ctx.query,
    params: ctx.params,
    body: ctx.request?.body
  };
}

export function createEEPMiddleware(options: EEPServerOptions): { routes: KoaRouteBinding[] } {
  const server = new EEPServer(options);
  const routes = server.getRouteDefinitions().map((definition) => ({
    method: definition.method,
    path: definition.path,
    operationId: definition.operationId,
    execute: (ctx: KoaContextLike) => definition.handler(toIncomingRequest(definition, ctx))
  }));
  return { routes };
}
