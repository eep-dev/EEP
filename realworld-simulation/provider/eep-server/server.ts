/**
 * EEP demo publisher — Express on port 3402 (default).
 * Uses @eep-dev/gates for 402 bodies; agreement + Ed25519 verified locally (demo).
 * Includes v0.1 reference flows: registry economics, trust graduation, delegation verify, WS pulse/disputes.
 */
import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import {
  build402Response,
  delegationPermitsDataRequest,
  resolveAccess,
  type GateProof,
  type AgreementProof,
  type PaymentProof,
  type UnmetRequirement,
} from "@eep-dev/gates";
import nacl from "tweetnacl";
import { DEMO_GATE_CONFIG, DEMO_RESOURCE } from "./gate-config.js";
import { getNdaDocumentHash, NDA_TEXT } from "./nda-document.js";
import { CORPX_Q1_REPORT_JSON } from "./report-json.js";

const PORT = Number(process.env.EEP_PORT ?? "3402");
const BASE_URL = process.env.EEP_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const PUBLISHER_DID = process.env.EEP_DID ?? "did:web:corpx-analytics.demo";
const DEMO_RECIPIENT = "DEMO_WALLET_CORPX_Q1";

/** Cold-start → standard trust (demo; in-memory), shared by all app instances in this process. */
const graduatedTrust = new Set<string>();

function parseProofsBody(body: unknown): GateProof[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const raw = o.gate_proofs ?? o.proofs;
  if (!Array.isArray(raw)) return [];
  return raw as GateProof[];
}

function verifyAgreementDemo(
  proof: AgreementProof,
  expectedHash: string,
  publicKeyB64: string | undefined,
): boolean {
  if (proof.type !== "agreement") return false;
  if (proof.document_hash !== expectedHash) return false;
  if (typeof proof.signature !== "string" || typeof proof.signer_did !== "string") return false;
  const sig = Buffer.from(proof.signature, "base64");
  if (sig.length !== 64) return false;
  const msg = Buffer.from(proof.document_hash, "utf8");
  const header = publicKeyB64;
  if (typeof header !== "string" || header.length < 32) return false;
  let pub: Uint8Array;
  try {
    pub = Uint8Array.from(Buffer.from(header, "base64"));
  } catch {
    return false;
  }
  if (pub.length !== 32) return false;
  return nacl.sign.detached.verify(new Uint8Array(msg), sig, pub);
}

function verifyPaymentDemo(proof: PaymentProof): boolean {
  if (proof.type !== "payment") return false;
  const token = proof.token ?? "";
  return token.startsWith("tx_demo_") && token.length > 12;
}

export function createEepApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));

  app.use((req, res, next) => {
    const agent = req.headers["eep-agent-did"];
    if (typeof agent === "string" && agent.startsWith("did:")) {
      res.setHeader("X-EEP-Trust-State", graduatedTrust.has(agent) ? "standard" : "cold_start");
    }
    next();
  });

  const wsBase = BASE_URL.replace(/^http/, "ws");

  app.get("/.well-known/eep.json", (_req, res) => {
    res.json({
      did: PUBLISHER_DID,
      eep_version: "0.1",
      layers: {
        layer1: `${BASE_URL}/eep/state`,
        layer2_sse: `${BASE_URL}/eep/stream`,
        layer3_ws: `${wsBase}/eep/pulse`,
      },
      supported_content_types: ["application/json", "text/markdown"],
      pqc_ready: false,
      x402_enabled: true,
      payment_networks: [
        {
          chain: "solana-devnet",
          address: DEMO_RECIPIENT,
          min_confirmations: 0,
        },
      ],
    });
  });

  app.get("/.well-known/eep-registry.json", (_req, res) => {
    res.json({
      did: "did:web:registry.realworld.demo",
      registry_name: "EEP Realworld Demo Registry",
      scope: { geography: ["demo"], sectors: ["simulation"] },
      conformance_tier_required: "Full",
      federation_credential_url: `${BASE_URL}/.well-known/eep-federation-credential.json`,
      economics: {
        registration_fee: { amount: 0, currency: "USD", per: "year" },
        query_quota: { free_requests_per_day: 1000, paid_tier_url: `${BASE_URL}/eep/gates` },
        staking_or_challenge: {
          mode: "proof_of_work_challenge",
          challenge_endpoint: `${BASE_URL}/health`,
        },
      },
    });
  });

  app.post("/eep/trust/graduate", (req, res) => {
    const did = typeof req.body?.agent_did === "string" ? req.body.agent_did : "";
    if (!did.startsWith("did:")) {
      res.status(400).json({ error: "invalid_agent_did" });
      return;
    }
    graduatedTrust.add(did);
    res.json({ ok: true, agent_did: did, trust_state: "standard" });
  });

  app.get("/eep/trust-status", (req, res) => {
    const did = typeof req.query.agent_did === "string" ? req.query.agent_did : "";
    if (!did.startsWith("did:")) {
      res.status(400).json({ error: "missing_or_invalid_agent_did" });
      return;
    }
    res.json({ agent_did: did, trust_state: graduatedTrust.has(did) ? "standard" : "cold_start" });
  });

  app.post("/eep/delegation/verify", (req, res) => {
    const sub = req.body?.credential_subject;
    const dr = req.body?.data_request_requirement;
    if (!sub || !dr || dr.type !== "data_request") {
      res.status(400).json({ error: "credential_subject_and_data_request_requirement_required" });
      return;
    }
    const result = delegationPermitsDataRequest(sub, dr);
    res.status(result.valid ? 200 : 403).json({ valid: result.valid, errors: result.errors });
  });

  app.get("/eep/legal/nda", (_req, res) => {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(NDA_TEXT);
  });

  app.get("/eep/gates", (_req, res) => {
    res.json(DEMO_GATE_CONFIG);
  });

  async function handleReportAccess(res: express.Response, proofs: GateProof[]) {
    const ndaHash = getNdaDocumentHash();
    const agreementProof = proofs.find((p) => p.type === "agreement") as
      | (AgreementProof & { signer_public_key_b64?: string })
      | undefined;
    const paymentProof = proofs.find((p) => p.type === "payment") as PaymentProof | undefined;

    const agreementOk =
      agreementProof &&
      verifyAgreementDemo(agreementProof, ndaHash, agreementProof.signer_public_key_b64);

    const paymentOk = paymentProof && verifyPaymentDemo(paymentProof);

    if (!agreementOk || !paymentOk) {
      const base = await build402Response(
        DEMO_GATE_CONFIG,
        DEMO_RESOURCE,
        proofs.filter((p) => p.type === "payment"),
        `${BASE_URL}/eep/gates`,
      );
      const unmet: UnmetRequirement[] = [...base.unmet_requirements];
      if (!agreementOk) {
        unmet.push({
          type: "agreement",
          document_hash: ndaHash,
          document_url: `${BASE_URL}/eep/legal/nda`,
          signature_algo: "EdDSA",
          resolution_hint: "Sign the NDA document hash with your agent Ed25519 key (demo)",
        } as UnmetRequirement);
      }
      if (!paymentOk) {
        const hasPay = unmet.some((u) => u.type === "payment");
        if (!hasPay) {
          unmet.push({
            type: "payment",
            resolution_hint: `Transfer 0.01 USDC to ${DEMO_RECIPIENT} (simulated) and submit payment proof token`,
          } as UnmetRequirement);
        }
      }
      res.status(402).json({
        ...base,
        unmet_requirements: unmet,
      });
      return;
    }

    const access = await resolveAccess(proofs, DEMO_GATE_CONFIG, DEMO_RESOURCE, undefined, {
      strictSemanticVerification: false,
    });
    if (!access.granted) {
      const fallback = await build402Response(
        DEMO_GATE_CONFIG,
        DEMO_RESOURCE,
        proofs,
        `${BASE_URL}/eep/gates`,
      );
      res.status(402).json(fallback);
      return;
    }

    res.setHeader("EEP-Version", "0.1");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(CORPX_Q1_REPORT_JSON);
  }

  app.get("/eep/state/reports/corpx-q1", async (_req, res) => {
    await handleReportAccess(res, []);
  });

  app.post("/eep/state/reports/corpx-q1", async (req, res) => {
    const proofs = parseProofsBody(req.body);
    await handleReportAccess(res, proofs);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "eep-realworld-simulation", did: PUBLISHER_DID });
  });

  return app;
}

function attachPulseWebSocket(httpServer: http.Server, baseUrl: string): void {
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ v: 1, type: "system", action: "connected", seq: 1 }));
    socket.on("message", (raw) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        socket.send(JSON.stringify({ v: 1, type: "system", action: "error", data: { reason: "invalid_json" } }));
        return;
      }
      if (data.action === "subscribe") {
        socket.send(JSON.stringify({ v: 1, type: "system", action: "subscribed", seq: 2, data: { ok: true } }));
        return;
      }
      if (data.type === "commerce" && data.action === "commerce.dispute.open") {
        const seq = typeof data.seq === "number" ? data.seq : 0;
        const payload = data.data as { negotiation_id?: string } | undefined;
        socket.send(
          JSON.stringify({
            v: 1,
            type: "commerce",
            action: "commerce.dispute.resolved",
            seq: seq + 1,
            data: {
              negotiation_id: payload?.negotiation_id ?? "neg_demo",
              outcome: "dismissed",
            },
          }),
        );
      }
    });
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", baseUrl).pathname;
    if (pathname !== "/eep/pulse") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
}

export function createEepHttpServer(): http.Server {
  const app = createEepApp();
  const server = http.createServer(app);
  attachPulseWebSocket(server, BASE_URL);
  return server;
}

if (process.env.EEP_SERVER_START !== "0") {
  createEepHttpServer().listen(PORT, () => {
    process.stderr.write(`EEP demo publisher listening on ${PORT} (baseUrl=${BASE_URL})\n`);
  });
}
