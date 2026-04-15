import { EEPServer, type EEPServerOptions } from "../core/eep-server.js";
import type { IncomingRequest, OutgoingResponse, RouteDefinition } from "../core/request-handler.js";

export type HonoRouteBinding = {
  method: RouteDefinition["method"];
  path: string;
  operationId: string;
  fetch: (context: {
    req: {
      header: (name: string) => string | undefined;
      query: (name: string) => string | undefined;
      param: (name: string) => string | undefined;
      json: () => Promise<unknown>;
    };
  }) => Promise<OutgoingResponse>;
};

type HonoLikeContext = {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    param: (name: string) => string | undefined;
    json: () => Promise<unknown>;
  };
};

async function toIncomingRequest(definition: RouteDefinition, context: HonoLikeContext): Promise<IncomingRequest> {
  const headers: Record<string, string | undefined> = {};
  for (const key of ["x-eep-proofs", "authorization", "content-type"]) {
    headers[key] = context.req.header(key);
  }

  let body: unknown = undefined;
  if (definition.method !== "GET") {
    body = await context.req.json();
  }

  return {
    method: definition.method,
    path: definition.path,
    headers,
    query: {},
    params: {},
    body
  };
}

export function createEEPApp(options: EEPServerOptions): { routes: HonoRouteBinding[] } {
  const server = new EEPServer(options);
  const routes = server.getRouteDefinitions().map((definition) => ({
    method: definition.method,
    path: definition.path,
    operationId: definition.operationId,
    fetch: async (context: HonoLikeContext) => definition.handler(await toIncomingRequest(definition, context))
  }));
  return { routes };
}
