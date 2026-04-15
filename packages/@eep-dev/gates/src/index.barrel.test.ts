import { describe, it, expect } from 'vitest';

/**
 * Ensures the public barrel (`index.ts`) is loaded so export lines count toward coverage.
 * Tests elsewhere import submodules directly.
 */
describe('@eep-dev/gates barrel', () => {
    it('re-exports the public API from index.ts', async () => {
        const mod = await import('./index.js');
        expect(typeof mod.parseGateConfig).toBe('function');
        expect(typeof mod.resolveAccess).toBe('function');
        expect(typeof mod.ProofVerifierRegistry).toBe('function');
        expect(typeof mod.build402Response).toBe('function');
    });
});
