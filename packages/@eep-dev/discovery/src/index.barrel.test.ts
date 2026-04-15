import { describe, it, expect } from 'vitest';

describe('@eep-dev/discovery barrel', () => {
    it('loads public exports from index.ts', async () => {
        const mod = await import('./index.js');
        expect(typeof mod.validateManifest).toBe('function');
        expect(typeof mod.parseLinkHeader).toBe('function');
        expect(typeof mod.parseDnsTxtRecord).toBe('function');
    });
});
