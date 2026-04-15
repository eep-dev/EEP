import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateProofStructure } from './proof-validator.js';

interface Fixture {
    name: string;
    proof: unknown;
    expected_valid: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../../tests/parity/proof-validator-boundary-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture[];

describe('Proof validator parity fixtures (TS)', () => {
    for (const fixture of fixtures) {
        it(fixture.name, () => {
            const result = validateProofStructure(fixture.proof);
            expect(result.valid).toBe(fixture.expected_valid);
        });
    }
});
