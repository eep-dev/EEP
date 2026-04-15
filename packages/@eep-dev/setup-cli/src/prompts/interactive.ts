import { createInterface } from "node:readline";
import type { EEPSetupConfig } from "../types/config.js";

function isCiLike(): boolean {
  return (
    process.env.EEP_SETUP_CI === "1" ||
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  );
}

/** Exported for tests and deterministic merges. */
export function deriveDidFromDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed || trimmed === "example.com") {
    return "did:web:example.com";
  }
  return `did:web:${trimmed}`;
}

export type InteractiveIdentityFields = {
  org_name: string;
  domain: string;
  base_url: string;
  did: string;
};

/** Maps raw prompt answers to a partial `EEPSetupConfig` identity block. */
export function identityFieldsToConfig(fields: InteractiveIdentityFields): Partial<EEPSetupConfig> {
  return {
    identity: {
      org_name: fields.org_name,
      domain: fields.domain,
      did: fields.did,
      base_url: fields.base_url,
      eep_versions: ["0.1"],
      content_types: ["application/json"]
    }
  };
}

/** Normalize hostname from user input (may accidentally include a scheme). */
export function hostnameFromUserInput(domainRaw: string, defaultHost = "api.example.com"): string {
  let hostname = (domainRaw || defaultHost).trim();
  if (hostname.includes("://")) {
    try {
      hostname = new URL(hostname).hostname;
    } catch {
      hostname = hostname.replace(/^https?:\/\//, "").split("/")[0] || defaultHost;
    }
  }
  return hostname;
}

/**
 * Prompts for core identity fields when `--interactive` is used and stdin is a TTY.
 * Returns `{}` in CI/non-TTY so callers fall back to preset-only config.
 */
export async function promptIdentityOverrides(): Promise<Partial<EEPSetupConfig>> {
  if (isCiLike()) {
    return {};
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (label: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(label, resolve);
    });

  try {
    const orgRaw = (await question("Organization name [MyOrg]: ")).trim();
    const domainRaw = (await question("Public API hostname (no scheme), e.g. api.acme.com [api.example.com]: ")).trim();
    const baseRaw = (await question("Public base URL (https://...) [https://api.example.com]: ")).trim();

    const hostname = hostnameFromUserInput(domainRaw, "api.example.com");
    const base_url =
      baseRaw || `https://${hostname.replace(/^https?:\/\//, "")}`;
    const didDefault = deriveDidFromDomain(hostname);
    const didRaw = (await question(`DID [${didDefault}]: `)).trim();
    const did = didRaw || didDefault;

    const fields: InteractiveIdentityFields = {
      org_name: orgRaw || "MyOrg",
      domain: hostname,
      base_url,
      did
    };

    return identityFieldsToConfig(fields);
  } finally {
    rl.close();
  }
}
