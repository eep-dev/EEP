import { EEPServer, type EEPServerOptions } from "../core/eep-server.js";
import type { IncomingRequest, OutgoingResponse, RouteDefinition } from "../core/request-handler.js";

export type FastifyRouteBinding = {
  method: RouteDefinition["method"];
  url: string;
  operationId: string;
  handler: (request: {
    headers?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
    params?: Record<string, string | undefined>;
    body?: unknown;
  }) => Promise<OutgoingResponse>;
};

type FastifyLikeRequest = {
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

function toIncomingRequest(definition: RouteDefinition, request: FastifyLikeRequest): IncomingRequest {
  return {
    method: definition.method,
    path: definition.path,
    headers: request.headers ?? {},
    query: request.query,
    params: request.params,
    body: request.body
  };
}

export function createFastifyPlugin(options: EEPServerOptions): { routes: FastifyRouteBinding[] } {
  const server = new EEPServer(options);
  const routes = server.getRouteDefinitions().map((definition) => ({
    method: definition.method,
    url: definition.path,
    operationId: definition.operationId,
    handler: (request: FastifyLikeRequest) => definition.handler(toIncomingRequest(definition, request))
  }));
  return { routes };
}
