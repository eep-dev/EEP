import { EEPServer, type EEPServerOptions } from "../core/eep-server.js";
import type { IncomingRequest, OutgoingResponse, RouteDefinition } from "../core/request-handler.js";

export type ExpressLikeRequest = {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

export type ExpressRouteBinding = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  operationId: string;
  execute: (request: ExpressLikeRequest) => Promise<OutgoingResponse>;
};

function toIncomingRequest(request: ExpressLikeRequest, definition: RouteDefinition): IncomingRequest {
  const method = (request.method ?? definition.method).toUpperCase();
  return {
    method: method as IncomingRequest["method"],
    path: request.path ?? definition.path,
    headers: request.headers ?? {},
    query: request.query,
    params: request.params,
    body: request.body
  };
}

function toExpressMethod(method: RouteDefinition["method"]): ExpressRouteBinding["method"] {
  return method.toLowerCase() as ExpressRouteBinding["method"];
}

export function createEEPRouter(options: EEPServerOptions): { routes: ExpressRouteBinding[] } {
  const server = new EEPServer(options);
  const routes = server.getRouteDefinitions().map((definition) => ({
    method: toExpressMethod(definition.method),
    path: definition.path,
    operationId: definition.operationId,
    execute: (request: ExpressLikeRequest) => definition.handler(toIncomingRequest(request, definition))
  }));
  return { routes };
}
