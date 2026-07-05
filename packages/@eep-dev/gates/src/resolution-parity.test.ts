import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveAccess } from './access-resolver.js';
import type { GateConfig } from './types.js';

interface ResolutionFixture {
    name: string;
    config: GateConfig;
    resource: string | null;
    expected_granted: boolean;
    expected_tier: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../../tests/parity/gate-resolution-specificity-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as ResolutionFixture[];

// Cross-language parity for the default-tier wildcard specificity override.
// These cases use no proofs (deterministic; no semantic verifier needed), so
// the TS and Python resolvers must agree on granted/tier for each fixture.
describe('Gate resolution specificity parity fixtures (TS)', () => {
    for (const fixture of fixtures) {
        it(fixture.name, async () => {
            const result = await resolveAccess([], fixture.config, fixture.resource ?? undefined);
            expect(result.granted).toBe(fixture.expected_granted);
            expect(result.tier).toBe(fixture.expected_tier);
        });
    }
});
