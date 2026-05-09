/**
 * Tests for `@eep-dev/agent-adopt`.
 *
 * The CLI is a thin orchestrator on top of `@eep-dev/setup-cli`, so the
 * tests focus on the orchestration contract: argv parsing, control flow
 * (early-exit on inject/apply/verify failure), report generation, and
 * the optional compliance step.
 *
 * `@eep-dev/setup-cli` and `node:child_process.spawn` are mocked so the
 * test exercises only this package's logic. A scratch project
 * directory under `os.tmpdir()` stands in for the user's app.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const setupCliMock = vi.hoisted(() => ({
    runInject: vi.fn(),
    runApply: vi.fn(),
    runVerify: vi.fn(),
    applyFrameworkPatchers: vi.fn(),
}));

vi.mock('@eep-dev/setup-cli', () => setupCliMock);

const childProcessMock = vi.hoisted(() => ({
    spawn: vi.fn(),
}));

vi.mock('node:child_process', () => childProcessMock);

let project: string;
let originalArgv: string[];

beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'eep-adopt-test-'));
    originalArgv = process.argv;
    setupCliMock.runInject.mockReset();
    setupCliMock.runApply.mockReset();
    setupCliMock.runVerify.mockReset();
    setupCliMock.applyFrameworkPatchers.mockReset();
    childProcessMock.spawn.mockReset();
});

afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(project)) {
        rmSync(project, { recursive: true, force: true });
    }
});

describe('runAgentAdopt — happy path', () => {
    it('runs inject → apply → patchers → verify and writes the report', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.runVerify.mockResolvedValue({ ok: true, message: 'verify ok' });
        setupCliMock.applyFrameworkPatchers.mockResolvedValue({ express: ['noop'], fastapi: [] });

        process.argv = ['node', 'agent-adopt', '--project', project];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(0);
        expect(setupCliMock.runInject).toHaveBeenCalledOnce();
        expect(setupCliMock.runApply).toHaveBeenCalledOnce();
        expect(setupCliMock.applyFrameworkPatchers).toHaveBeenCalledOnce();
        expect(setupCliMock.runVerify).toHaveBeenCalledOnce();

        const report = join(project, 'EEP_ADOPTION_REPORT.md');
        expect(existsSync(report)).toBe(true);
        const text = readFileSync(report, 'utf8');
        expect(text).toContain('setup-cli inject');
        expect(text).toContain('setup-cli apply');
        expect(text).toContain('setup-cli verify');
        expect(text).toContain('framework patch');
    });
});

describe('runAgentAdopt — early exits on failure', () => {
    it('aborts with code 2 when inject fails and writes a failure report', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: false, message: 'detect failed' });

        process.argv = ['node', 'agent-adopt', '--project', project];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(2);
        expect(setupCliMock.runApply).not.toHaveBeenCalled();
        expect(setupCliMock.applyFrameworkPatchers).not.toHaveBeenCalled();
        expect(setupCliMock.runVerify).not.toHaveBeenCalled();

        const text = readFileSync(join(project, 'EEP_ADOPTION_REPORT.md'), 'utf8');
        expect(text).toMatch(/setup-cli inject.*failed/);
    });

    it('aborts with code 2 when apply fails', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: false, message: 'codegen err' });

        process.argv = ['node', 'agent-adopt', '--project', project];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(2);
        expect(setupCliMock.applyFrameworkPatchers).not.toHaveBeenCalled();
        expect(setupCliMock.runVerify).not.toHaveBeenCalled();
    });

    it('aborts with code 2 when verify fails', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.applyFrameworkPatchers.mockResolvedValue({ express: [], fastapi: [] });
        setupCliMock.runVerify.mockResolvedValue({ ok: false, message: 'manifest mismatch' });

        process.argv = ['node', 'agent-adopt', '--project', project];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(2);
    });
});

describe('runAgentAdopt — flags', () => {
    it('--no-patch skips applyFrameworkPatchers', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.runVerify.mockResolvedValue({ ok: true, message: 'verify ok' });

        process.argv = ['node', 'agent-adopt', '--project', project, '--no-patch'];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(0);
        expect(setupCliMock.applyFrameworkPatchers).not.toHaveBeenCalled();
    });

    it('--help prints usage and returns 0 without invoking setup-cli', async () => {
        const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

        process.argv = ['node', 'agent-adopt', '--help'];
        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(0);
        expect(setupCliMock.runInject).not.toHaveBeenCalled();
        expect(stderrWrite).toHaveBeenCalled();
        const allOutput = stderrWrite.mock.calls.map((c) => String(c[0])).join('');
        expect(allOutput).toContain('Usage: eep-adopt');

        stderrWrite.mockRestore();
    });

    it('--report writes the adoption report at the provided path', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.runVerify.mockResolvedValue({ ok: true, message: 'verify ok' });
        setupCliMock.applyFrameworkPatchers.mockResolvedValue({ express: [], fastapi: [] });

        const customReport = join(project, 'custom-report.md');
        process.argv = ['node', 'agent-adopt', '--project', project, '--report', customReport];

        const { runAgentAdopt } = await import('./index.js');
        await runAgentAdopt();

        expect(existsSync(customReport)).toBe(true);
        // Default location MUST NOT be written when --report is provided.
        expect(existsSync(join(project, 'EEP_ADOPTION_REPORT.md'))).toBe(false);
    });
});

describe('runAgentAdopt — compliance step', () => {
    it('skips compliance when no --compliance-target is given', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.runVerify.mockResolvedValue({ ok: true, message: 'verify ok' });
        setupCliMock.applyFrameworkPatchers.mockResolvedValue({ express: [], fastapi: [] });

        process.argv = ['node', 'agent-adopt', '--project', project];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(0);
        expect(childProcessMock.spawn).not.toHaveBeenCalled();
        const text = readFileSync(join(project, 'EEP_ADOPTION_REPORT.md'), 'utf8');
        expect(text).toContain('skipped');
    });

    it('honours --no-compliance even when target is provided', async () => {
        setupCliMock.runInject.mockResolvedValue({ ok: true, message: 'inject ok' });
        setupCliMock.runApply.mockResolvedValue({ ok: true, message: 'apply ok' });
        setupCliMock.runVerify.mockResolvedValue({ ok: true, message: 'verify ok' });
        setupCliMock.applyFrameworkPatchers.mockResolvedValue({ express: [], fastapi: [] });

        process.argv = [
            'node',
            'agent-adopt',
            '--project',
            project,
            '--compliance-target',
            'https://api.example.com',
            '--no-compliance',
        ];

        const { runAgentAdopt } = await import('./index.js');
        const code = await runAgentAdopt();

        expect(code).toBe(0);
        expect(childProcessMock.spawn).not.toHaveBeenCalled();
    });
});
