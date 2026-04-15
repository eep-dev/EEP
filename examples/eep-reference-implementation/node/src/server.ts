import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import {
  build402Response,
  delegationPermitsDataRequest,
  parseGateConfig,
  resolveAccess,
  type DataRequestRequirement,
  type DelegationCredentialSubject,
  type GateProof,
} from "@eep-dev/gates";
import postgres from "postgres";
import Redis from "ioredis";

/** Fixed document hash for reference agreement gate (demo only). */
const DEMO_AGREEMENT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const GATE_CONFIG = parseGateConfig({
  version: "0.1",
  default_tier: "public",
  tiers: {
    public: { access: ["eep.services.list", "entity.public.profile"], requirements: [] },
    premium: {
      access: ["content.papers.full_text"],
      requirements: [{ type: "payment", amount: 1, currency: "usd", per: "request" }],
    },
    premium_bundle: {
      access: ["content.bundle.report"],
      requirements: [
        {
          type: "combined",
          combine_mode: "all",
          recommended_collection_order: ["agreement", "payment"],
          requirements: [
            { type: "payment", amount: 1, currency: "usd", per: "request" },
            {
              type: "agreement",
              document_hash: DEMO_AGREEMENT_HASH,
              document_url: "https://example.com/eep-reference/terms",
            },
          ],
        },
      ],
    },
  },
});

const EEP_REGISTRY_MANIFEST = {
  did: "did:web:registry.eep.dev.ref",
  registry_name: "EEP Reference Federation Registry",
  scope: { geography: ["EU"], sectors: ["reference"] },
  conformance_tier_required: "Full",
  economics: {
    registration_fee: { amount: 0, currency: "USD", per: "year" },
    query_quota: { free_requests_per_day: 1000, paid_tier_url: "https://example.com/eep-registry-pricing" },
    staking_or_challenge: { mode: "proof_of_work_challenge", challenge_endpoint: "https://example.com/genesis-challenge" },
  },
};

const SERVICES = {
  entity_did: "did:web:api.eep.dev:u:acme-corp",
  services: [
    {
      id: "price_feed",
      name: "Price Feed",
      category: "market-data",
      pricing: { model: "fixed", amount: 1, currency: "usd" },
      delivery: "api",
    },
  ],
};

type SubscriptionEntry = {
  subscription_id: string;
  source_did: string;
  delivery_method: "webhook" | "sse";
  callback_url?: string;
  created_at: string;
};

/* c8 ignore start */
class SubscriptionStore {
  private memory = new Map<string, SubscriptionEntry>();
  private db: postgres.Sql | null = null;
  private redis: Redis | null = null;
  private pgReady = false;
  private redisReady = false;

  constructor() {
    const dbUrl = process.env.EEP_DATABASE_URL;
    if (dbUrl) {
      this.db = postgres(dbUrl, { max: 1, connect_timeout: 3 });
      this.setupPostgres().catch(() => {
        this.pgReady = false;
      });
    }
    const redisUrl = process.env.EEP_REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 1000 });
      this.redis.on("ready", () => {
        this.redisReady = true;
      });
      this.redis.on("error", () => {
        this.redisReady = false;
      });
    }
  }

  private async setupPostgres(): Promise<void> {
    if (!this.db) return;
    await this.db`
      CREATE TABLE IF NOT EXISTS eep_subscriptions (
        subscription_id TEXT PRIMARY KEY,
        source_did TEXT NOT NULL,
        delivery_method TEXT NOT NULL,
        callback_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    this.pgReady = true;
  }

  async save(sub: SubscriptionEntry): Promise<void> {
    this.memory.set(sub.subscription_id, sub);
    if (this.db && this.pgReady) {
      await this.db`
        INSERT INTO eep_subscriptions (subscription_id, source_did, delivery_method, callback_url, created_at)
        VALUES (${sub.subscription_id}, ${sub.source_did}, ${sub.delivery_method}, ${sub.callback_url ?? null}, ${sub.created_at})
        ON CONFLICT (subscription_id) DO NOTHING
      `;
    }
    if (this.redis && this.redisReady) {
      await this.redis.publish(
        "eep.subscription.created",
        JSON.stringify({
          subscription_id: sub.subscription_id,
          source_did: sub.source_did,
          delivery_method: sub.delivery_method,
          created_at: sub.created_at,
        }),
      );
    }
  }

  async count(): Promise<number> {
    if (this.db && this.pgReady) {
      const rows = await this.db<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM eep_subscriptions`;
      return Number(rows[0]?.count ?? "0");
    }
    return this.memory.size;
  }

  status(): { postgres: boolean; redis: boolean } {
    return { postgres: this.pgReady, redis: this.redisReady };
  }
}
/* c8 ignore stop */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function contentResourceFromPath(pathname: string): string {
  const m = pathname.match(/\/eep\/content\/[^/]+\/(.+)$/);
  return m?.[1] ?? "content.papers.full_text";
}

export function createEEPNodeServer(baseUrl = "http://localhost:3100") {
  const subscriptions = new SubscriptionStore();
  /** DIDs that completed cold-start graduation (demo in-memory store). */
  const graduatedTrust = new Set<string>();
  const server = createServer(async (req, res) => {
    /* c8 ignore next */
    const url = new URL(req.url ?? "/", baseUrl);

    const agentDid = req.headers["eep-agent-did"];
    if (typeof agentDid === "string" && agentDid.startsWith("did:")) {
      const state = graduatedTrust.has(agentDid) ? "standard" : "cold_start";
      res.setHeader("X-EEP-Trust-State", state);
    }

    if (req.method === "GET" && url.pathname === "/.well-known/eep-registry.json") {
      const manifest = {
        ...EEP_REGISTRY_MANIFEST,
        federation_credential_url: `${baseUrl}/.well-known/eep-federation-credential.json`,
      };
      return sendJson(res, 200, manifest);
    }

    if (req.method === "GET" && url.pathname === "/.well-known/eep.json") {
      return sendJson(res, 200, {
        did: "did:web:api.eep.dev:u:acme-corp",
        eep_version: "0.1",
        layers: {
          layer1: `${baseUrl}/u/u/acme-corp`,
          layer2_sse: `${baseUrl}/eep/stream`,
          layer2_webhook: `${baseUrl}/eep/subscribe`,
          layer3_ws: `${baseUrl.replace(/^http/, "ws")}/eep/pulse`,
        },
        supported_content_types: ["application/json", "text/markdown"],
        pqc_ready: false,
        x402_enabled: true,
        gates_url: `${baseUrl}/eep/gates`,
        services_url: `${baseUrl}/eep/services`,
      });
    }

    if (req.method === "POST" && url.pathname === "/eep/trust/graduate") {
      const body = await readJson(req);
      const did = typeof body.agent_did === "string" ? body.agent_did : "";
      if (!did.startsWith("did:")) {
        return sendJson(res, 400, { error: "invalid_agent_did" });
      }
      graduatedTrust.add(did);
      return sendJson(res, 200, { ok: true, agent_did: did, trust_state: "standard" });
    }

    if (req.method === "GET" && url.pathname === "/eep/trust-status") {
      const did = url.searchParams.get("agent_did") ?? "";
      if (!did.startsWith("did:")) {
        return sendJson(res, 400, { error: "missing_or_invalid_agent_did" });
      }
      return sendJson(res, 200, {
        agent_did: did,
        trust_state: graduatedTrust.has(did) ? "standard" : "cold_start",
      });
    }

    if (req.method === "POST" && url.pathname === "/eep/delegation/verify") {
      const body = await readJson(req);
      const sub = body.credential_subject as DelegationCredentialSubject | undefined;
      const dr = body.data_request_requirement as DataRequestRequirement | undefined;
      if (!sub || !dr || dr.type !== "data_request") {
        return sendJson(res, 400, { error: "credential_subject_and_data_request_requirement_required" });
      }
      const result = delegationPermitsDataRequest(sub, dr);
      return sendJson(res, result.valid ? 200 : 403, result);
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      const status = subscriptions.status();
      return sendJson(res, 200, {
        ok: true,
        runtime: "node",
        postgres: status.postgres,
        redis: status.redis,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/u/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const entityType = parts[1] ?? "u";
      const entityId = parts[2] ?? "acme-corp";
      res.setHeader("EEP-Version", "0.1");
      res.setHeader("EEP-Entity-DID", `did:web:api.eep.dev:${entityType}:${entityId}`);
      res.setHeader("Link", `<${baseUrl}/eep/subscribe>; rel="subscribe", <${baseUrl}/eep/stream?source=${entityId}>; rel="monitor"`);
      return sendJson(res, 200, {
        id: entityId,
        type: entityType,
        did: `did:web:api.eep.dev:${entityType}:${entityId}`,
        eep: {
          version: "0.1",
          endpoint: `${baseUrl}/eep`,
          supported_delivery: ["webhook", "sse"],
        },
      });
    }

    if (req.method === "GET" && url.pathname === "/eep/services") {
      return sendJson(res, 200, SERVICES);
    }
    if (req.method === "GET" && url.pathname === "/eep/gates") {
      return sendJson(res, 200, GATE_CONFIG);
    }

    if (req.method === "POST" && url.pathname === "/eep/subscribe") {
      const body = await readJson(req);
      const method = body.delivery_method === "webhook" ? "webhook" : "sse";
      const subscription_id = `sub_ref_${Date.now()}`;
      const entry: SubscriptionEntry = {
        subscription_id,
        source_did: String(body.source_did ?? "did:web:api.eep.dev:u:acme-corp"),
        delivery_method: method,
        callback_url: typeof body.callback_url === "string" ? body.callback_url : undefined,
        created_at: new Date().toISOString(),
      };
      await subscriptions.save(entry);
      return sendJson(res, 200, {
        subscription_id,
        status: method === "webhook" ? "pending_verification" : "active",
        source_did: entry.source_did,
      });
    }

    if (req.method === "GET" && url.pathname === "/eep/stream") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      const event = {
        specversion: "1.0",
        id: `evt_${Date.now()}`,
        source: "did:web:api.eep.dev:u:acme-corp",
        type: "com.eep.entity.updated",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        data: { field: "status", value: "ok", active_subscriptions: await subscriptions.count() },
      };
      res.write(`event: com.eep.entity.updated\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      return res.end();
    }

    if (req.method === "GET" && url.pathname.startsWith("/eep/content/")) {
      const proofsRaw = req.headers["x-eep-gate-proofs"];
      const proofs: GateProof[] = proofsRaw ? JSON.parse(String(proofsRaw)) : [];
      const resource = contentResourceFromPath(url.pathname);
      const access = await resolveAccess(proofs, GATE_CONFIG, resource, undefined, {
        strictSemanticVerification: false,
      });
      if (!access.granted) {
        const body = await build402Response(GATE_CONFIG, resource, proofs);
        return sendJson(res, 402, body);
      }
      if (resource === "content.bundle.report") {
        return sendJson(res, 200, { content: "bundle report unlocked", resource, combined_gate: true });
      }
      return sendJson(res, 200, { content: "full text unlocked" });
    }

    return sendJson(res, 404, { error: "not_found" });
  });

  const ws = new WebSocketServer({ noServer: true });
  ws.on("connection", (socket) => {
    socket.send(JSON.stringify({ v: 1, type: "system", action: "connected", seq: 1 }));
    socket.on("message", (raw) => {
      let data: any = {};
      try {
        data = JSON.parse(String(raw));
      } catch {
        socket.send(JSON.stringify({ v: 1, type: "system", action: "error", data: { reason: "invalid_json" } }));
        return;
      }
      if (data.action === "subscribe") {
        socket.send(JSON.stringify({ v: 1, type: "system", action: "subscribed", seq: 2, data: { ok: true } }));
        return;
      }
      if (data.type === "commerce" && data.action === "commerce.dispute.open") {
        socket.send(
          JSON.stringify({
            v: 1,
            type: "commerce",
            action: "commerce.dispute.resolved",
            seq: (data.seq as number) + 1,
            data: {
              negotiation_id: (data.data as { negotiation_id?: string })?.negotiation_id ?? "neg_demo",
              outcome: "dismissed",
            },
          }),
        );
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    /* c8 ignore next */
    const url = new URL(req.url ?? "/", baseUrl);
    if (url.pathname !== "/eep/pulse") {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, head, (conn) => ws.emit("connection", conn, req));
  });

  return server;
}

/* c8 ignore start */
if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? "3100");
  const server = createEEPNodeServer(`http://localhost:${port}`);
  server.listen(port, () => {
    process.stdout.write(`EEP Node reference listening on ${port}\n`);
  });
}
/* c8 ignore stop */
