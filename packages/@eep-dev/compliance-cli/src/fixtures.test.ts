import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { findFixturesDir, runFixtures, type FixtureReporter } from './fixtures.js';

const REPO_FIXTURES = resolve(import.meta.dirname, '../../../../tests/conformance-fixtures');
const REPO_SCHEMAS = resolve(import.meta.dirname, '../../../../schemas/v0.1');

function collector() {
    const passed: string[] = [];
    const failed: Array<{ name: string; detail: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    const reporter: FixtureReporter = {
        pass: (name) => passed.push(name),
        fail: (name, detail) => failed.push({ name, detail }),
        skip: (name, reason) => skipped.push({ name, reason }),
    };
    return { reporter, passed, failed, skipped };
}

describe('offline fixture runner', () => {
    it('resolves an explicit fixture directory', () => {
        expect(findFixturesDir(REPO_FIXTURES)).toBe(REPO_FIXTURES);
    });

    it('returns null for a directory with no manifest', () => {
        expect(findFixturesDir('/nonexistent/fixtures/path')).toBeNull();
    });

    // The point of `--fixtures`: a downstream implementor unpacks the
    // released vector tarball and gets a verdict with no publisher running.
    it('replays every published vector with no failures', () => {
        const { reporter, passed, failed, skipped } = collector();
        const { specVersion, total } = runFixtures(REPO_FIXTURES, reporter, REPO_SCHEMAS);

        expect(specVersion).toBe('0.1');
        expect(total).toBeGreaterThanOrEqual(17);
        expect(failed).toEqual([]);
        expect(skipped).toEqual([]);
        expect(passed.length).toBe(total);
    });

    it('covers each fixture category', () => {
        const { reporter, passed } = collector();
        runFixtures(REPO_FIXTURES, reporter, REPO_SCHEMAS);
        const joined = passed.join(' ');
        for (const category of ['discovery', 'envelope', 'signature', 'gates', 'subscription']) {
            expect(joined).toContain(`fixture:${category}`);
        }
    });

    it('exercises the truncated-signature vector added for §5.3', () => {
        const { reporter, passed } = collector();
        runFixtures(REPO_FIXTURES, reporter, REPO_SCHEMAS);
        expect(passed).toContain('fixture:signature-truncated-signature');
    });

    // Every reported outcome must carry a reason string; a bare pass/fail
    // with no detail is what made the old runner hard to act on.
    it('attaches a detail or reason to every reported outcome', () => {
        const { reporter, failed, skipped } = collector();
        runFixtures(REPO_FIXTURES, reporter, REPO_SCHEMAS);
        expect(failed).toEqual([]);
        expect(skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0)).toBe(true);
    });
});
