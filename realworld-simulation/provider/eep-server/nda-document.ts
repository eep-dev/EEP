import { createHash } from "crypto";

export const NDA_TEXT = `NON-DISCLOSURE AGREEMENT (DEMO)

You agree not to redistribute CorpX Q1 2026 summary data obtained through the EEP demo endpoint.
This is a simulation document for the EEP realworld-simulation package only.

Effective: 2026-04-12
`;

export function getNdaSha256Hex(): string {
  return createHash("sha256").update(NDA_TEXT, "utf8").digest("hex");
}

/** Full hash string as used in agreement proofs (schema: sha256: + 64 hex). */
export function getNdaDocumentHash(): string {
  return `sha256:${getNdaSha256Hex()}`;
}
