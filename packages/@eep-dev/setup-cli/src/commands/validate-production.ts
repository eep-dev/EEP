import type { EEPSetupConfig } from "../types/config.js";

const PLACEHOLDER_DOMAIN_FRAGMENTS = ["example.com", "example.org", "localhost"];
const PLACEHOLDER_DID = "did:web:example.com";

export function validateProductionIdentity(config: EEPSetupConfig): string[] {
  const issues: string[] = [];
  const { identity } = config;
  const domain = identity.domain.toLowerCase();
  const base = identity.base_url.toLowerCase();
  const did = identity.did;

  for (const frag of PLACEHOLDER_DOMAIN_FRAGMENTS) {
    if (domain.includes(frag)) {
      issues.push(`identity.domain still contains placeholder segment "${frag}"`);
    }
    if (base.includes(frag)) {
      issues.push(`identity.base_url still contains placeholder segment "${frag}"`);
    }
  }

  if (did === PLACEHOLDER_DID || did.includes("did:web:example.com")) {
    issues.push("identity.did is still the placeholder did:web:example.com");
  }

  return issues;
}
