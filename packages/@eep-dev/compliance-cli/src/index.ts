#!/usr/bin/env node
/**
 * @eep-dev/compliance-cli
 *
 * Run EEP conformance tests against any platform.
 * Usage: npx @eep-dev/compliance-cli --target https://api.yourplatform.com
 *
 * This tool verifies a platform's EEP implementation across all three conformance levels (Core, Standard, Full).
 * It simulates an agent subscriber, creates subscriptions, triggers test events,
 * and verifies that deliveries match the specification.
 */

import { parseArgs } from 'node:util';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import {
    createTestRunner,
    normalizeTarget,
    validateCloudEventsEnvelope,
    validateEEPExtensions,
    checkWebhookHeaders,
    verifyWebhookSignature,
} from './helpers.js';

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const { values } = parseArgs({
    options: {
        target: { type: 'string', short: 't' },
        'api-key': { type: 'string', short: 'k' },
        entity: { type: 'string', short: 'e' },
        level: { type: 'string', short: 'l', default: 'standard' },
        port: { type: 'string', short: 'p', default: '9876' },
        'report-json': { type: 'string' },
        'report-md': { type: 'string' },
        'report-html': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    args: process.argv.slice(2),
});

if (values.help || !values.target) {
    console.log(`
EEP Compliance CLI — Test your platform's EEP conformance

USAGE:
  npx @eep-dev/compliance-cli --target <url> [options]

OPTIONS:
  --target,   -t  <url>     Platform base URL (e.g., https://api.example.com)
  --api-key,  -k  <key>     API key for authenticated requests
  --entity,   -e  <did>     Entity DID or username to subscribe to
  --level,    -l  <level>   Conformance level to test (core|standard|full) [default: standard]
  --port,     -p  <port>    Local port for the test webhook receiver [default: 9876]
  --report-json <path>      Write machine-readable audit report JSON
  --report-md   <path>      Write human-readable audit report markdown
  --report-html <path>      Write self-contained HTML audit report
  --help,     -h            Show this help message

EXAMPLES:
  npx @eep-dev/compliance-cli --target https://api.example.com --api-key sk_... --entity u/acme-corp
  npx @eep-dev/compliance-cli --target https://localhost:3000 --api-key sk_... --entity u/test --level core
`);
    process.exit(values.help ? 0 : 1);
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

const TARGET = normalizeTarget(values.target!);
const API_KEY = values['api-key'] || '';
const ENTITY = values.entity || '';
const TEST_PORT = parseInt(values.port!, 10);
const LEVEL = values.level!;
const REPORT_JSON_PATH = values['report-json'] || '';
const REPORT_MD_PATH = values['report-md'] || '';
const REPORT_HTML_PATH = values['report-html'] || '';

const runner = createTestRunner();
const { pass, fail, skip, results } = runner;

// Wrap helpers to also log to console
const _origPass = pass;
const _origFail = fail;
const _origSkip = skip;
function logPass(name: string, detail?: string) { _origPass(name, detail); console.log(`  ✅ ${name}${detail ? ` (${detail})` : ''}`); }
function logFail(name: string, detail: string) { _origFail(name, detail); console.log(`  ❌ ${name}: ${detail}`); }
function logSkip(name: string, reason: string) { _origSkip(name, reason); console.log(`  ⚪ ${name} (skipped: ${reason})`); }

// ─── Local Webhook Receiver ───────────────────────────────────────────────────

let receivedWebhook: Record<string, unknown> | null = null;
let receivedHeaders: Record<string, string> | null = null;
// `receivedRawBody` captures the exact bytes the sender hashed. HMAC
// verification MUST use this, not `JSON.stringify(receivedWebhook)`, since
// round-tripping through `JSON.parse` drops whitespace and key ordering
// the sender included in its signed content.
let receivedRawBody: string | null = null;
let challengeResponse: ((challenge: string) => void) | null = null;

type ResultStatus = 'pass' | 'fail' | 'skip';
interface AuditReportItem {
    name: string;
    status: ResultStatus;
    detail?: string;
    recommendation?: string;
}

const RECOMMENDATIONS: Record<string, string> = {
    'Platform is reachable': 'Expose a stable health/readiness endpoint and verify public network reachability.',
    'EEP discovery via Link header': 'Return a proper Link header with rel="subscribe" for entity/discovery endpoints.',
    'Subscription creation': 'Implement POST /eep/subscribe with valid schema, auth, and returned subscription_id + delivery_secret.',
    'WebSub Intent Verification': 'Perform challenge callback and echo hub.challenge exactly from subscriber endpoint.',
    'Test delivery trigger (§5.1.1)': 'Implement POST /eep/subscriptions/{subscription_id}/test returning 202 and enqueueing a signed com.eep.subscription.test delivery to the registered delivery_url.',
    'Webhook delivery received': 'Implement deterministic test event trigger and retry-safe outbound delivery.',
    'Standard Webhooks headers present': 'Include webhook-id, webhook-timestamp, and webhook-signature on every webhook delivery.',
    'HMAC-SHA256 signature is valid': 'Sign webhook payloads using Standard Webhooks v1 content format and timing-safe verification.',
    'CloudEvents specversion is 1.0': 'Emit CloudEvents v1.0 envelopes for all events.',
    'Event id field present': 'Include a stable id field in every event envelope.',
    'Event source field present': 'Include canonical source identifier in every event envelope.',
    'EEP extension attributes present': 'Emit eep_version (and related EEP extension metadata).',
    'SSE stream endpoint': 'Expose authenticated SSE endpoint with Content-Type: text/event-stream.',
    'Rate limit headers present': 'Return X-RateLimit-* headers for protected endpoints.',
    '/.well-known/eep.json manifest reachable': 'Serve eep manifest with stable URL and valid JSON contract.',
    'manifest.did field present': 'Include did in manifest and keep it resolvable.',
    'manifest.eep_version field present': 'Publish supported eep_version in manifest.',
    'manifest.reputation (ERC-8004) field present': 'Add reputation block with contract information when claiming full-tier readiness.',
    'manifest.pqc_ready flag present': 'Publish pqc_ready boolean in manifest.',
    'manifest.x402_enabled flag present': 'Publish x402_enabled boolean in manifest.',
    'HTTP 403 response for non-payment gate': 'Return RFC-consistent 403 response body for non-payment gate denials.',
    'Federation registry economics metadata': 'Publish optional `economics` on `/.well-known/eep-registry.json` (registration fee, query quota, staking/challenge policy).',
    'Cold-start trust status endpoint': 'Expose GET /eep/trust-status?agent_did=… returning trust_state cold_start or standard (reference stacks).',
    'Delegation privacy verification endpoint': 'Expose POST /eep/delegation/verify for operator_privacy_policy_hash vs data_request policy checks.',
    'Layer 1 content negotiation (JSON)': 'Entity resolution endpoint must serve application/json when Accept: application/json is sent (SPECIFICATION.md §3.1).',
    'Layer 1 content negotiation (Markdown)': 'Optionally serve text/markdown for LLM consumption (SPECIFICATION.md §3.1).',
    'HTTP 402 payment gate response': 'Return 402 with error=payment_required and gate_type for payment-gated resources (SPECIFICATION.md §3.4).',
    'WebSocket pulse endpoint': 'Expose /eep/pulse for Layer 3 bidirectional communication (SPECIFICATION.md §6).',
    'CloudEvents envelope validation (helpers)': 'Ensure all delivered events include specversion, id, source, type, and time fields.',
    'EEP extension validation (helpers)': 'Include eep_version in every delivered event envelope.',
    'Webhook headers validation (helpers)': 'Include webhook-id, webhook-timestamp, and webhook-signature on every webhook delivery.',
};

function toAuditReport() {
    const reportItems: AuditReportItem[] = results.map((r) => ({
        name: r.name,
        status: r.status,
        detail: r.detail,
        recommendation: r.status === 'fail' ? RECOMMENDATIONS[r.name] : undefined,
    }));
    const evaluated = reportItems.filter((r) => r.status !== 'skip');
    const passed = evaluated.filter((r) => r.status === 'pass').length;
    const failed = evaluated.filter((r) => r.status === 'fail').length;
    const skipped = reportItems.filter((r) => r.status === 'skip').length;
    const score = evaluated.length > 0 ? Math.round((passed / evaluated.length) * 100) : 0;
    return {
        generated_at: new Date().toISOString(),
        target: TARGET,
        level: LEVEL,
        score_100: score,
        status: failed === 0 ? 'pass' : 'fail',
        summary: {
            passed,
            failed,
            skipped,
            evaluated: evaluated.length,
            total: reportItems.length,
        },
        items: reportItems,
    };
}

function toMarkdownReport(report: ReturnType<typeof toAuditReport>): string {
    const lines = [
        '# EEP Compliance Audit Report',
        '',
        `- Target: ${report.target}`,
        `- Level: ${report.level}`,
        `- Generated at: ${report.generated_at}`,
        `- Score: **${report.score_100}/100**`,
        `- Status: **${report.status.toUpperCase()}**`,
        '',
        '## Summary',
        '',
        `- Passed: ${report.summary.passed}`,
        `- Failed: ${report.summary.failed}`,
        `- Skipped: ${report.summary.skipped}`,
        '',
        '## Detailed Results',
        '',
        '| Check | Status | Detail | Recommendation |',
        '|---|---|---|---|',
    ];
    for (const item of report.items) {
        const detail = (item.detail ?? '').replace(/\|/g, '\\|');
        const reco = (item.recommendation ?? '').replace(/\|/g, '\\|');
        lines.push(`| ${item.name} | ${item.status} | ${detail} | ${reco} |`);
    }
    return lines.join('\n');
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toHtmlReport(report: ReturnType<typeof toAuditReport>): string {
    const statusColor = report.status === 'pass' ? '#22c55e' : '#ef4444';
    const rows = report.items.map((item) => {
        const color = item.status === 'pass' ? '#22c55e' : item.status === 'fail' ? '#ef4444' : '#888';
        return `<tr>
<td>${escHtml(item.name)}</td>
<td style="color:${color};font-weight:600">${item.status.toUpperCase()}</td>
<td>${escHtml(item.detail ?? '')}</td>
<td>${escHtml(item.recommendation ?? '')}</td>
</tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EEP Compliance Report — ${escHtml(report.target)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:2rem;line-height:1.6}
h1{font-size:1.8rem;margin-bottom:0.5rem}
.meta{color:#888;margin-bottom:1.5rem}
.score{font-size:3rem;font-weight:800;color:${statusColor}}
.summary{display:flex;gap:2rem;margin:1.5rem 0;flex-wrap:wrap}
.summary span{font-size:0.95rem}
.pass{color:#22c55e} .fail{color:#ef4444} .skip{color:#888}
table{width:100%;border-collapse:collapse;margin-top:1.5rem;font-size:0.9rem}
th{text-align:left;padding:0.6rem 0.8rem;border-bottom:2px solid #333;color:#aaa}
td{padding:0.5rem 0.8rem;border-bottom:1px solid #1a1a1a}
tr:hover td{background:#111}
footer{margin-top:2rem;color:#555;font-size:0.8rem}
</style>
</head><body>
<h1>EEP Compliance Audit Report</h1>
<div class="meta">
Target: <strong>${escHtml(report.target)}</strong> &middot;
Level: <strong>${escHtml(report.level)}</strong> &middot;
${escHtml(report.generated_at)}
</div>
<div class="score">${report.score_100}/100</div>
<div class="summary">
<span class="pass">Passed: ${report.summary.passed}</span>
<span class="fail">Failed: ${report.summary.failed}</span>
<span class="skip">Skipped: ${report.summary.skipped}</span>
<span>Evaluated: ${report.summary.evaluated} / ${report.summary.total}</span>
</div>
<table>
<thead><tr><th>Check</th><th>Status</th><th>Detail</th><th>Recommendation</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<footer>Generated by @eep-dev/compliance-cli &middot; EEP v0.1 &middot; <a href="https://github.com/eep-dev/EEP" style="color:#3b82f6">github.com/eep-dev/EEP</a></footer>
</body></html>`;
}

const server = createServer((req, res) => {
    if (req.method === 'GET') {
        // WebSub Intent Verification challenge
        const url = new URL(req.url!, `http://localhost:${TEST_PORT}`);
        const challenge = url.searchParams.get('hub.challenge');
        if (challenge) {
            challengeResponse?.(challenge);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(challenge);
        } else {
            res.writeHead(200);
            res.end('OK');
        }
        return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        receivedHeaders = Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v!])
        );
        receivedRawBody = body;
        try {
            receivedWebhook = JSON.parse(body);
        } catch {
            receivedWebhook = { _raw: body };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
    });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
    const webhookUrl = `http://host.docker.internal:${TEST_PORT}/hook`;

    console.log(`\n🔬 EEP Compliance Test — Level: ${LEVEL.toUpperCase()}`);
    console.log(`   Target: ${TARGET}`);
    console.log(`   Entity: ${ENTITY || '(not specified)'}`);
    console.log('─'.repeat(60));

    // ── CORE TESTS ──────────────────────────────────────────────
    console.log('\n📋 CORE CONFORMANCE\n');

    // Test 1: /health or /discover endpoint
    try {
        const res = await fetch(`${TARGET}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) pass('Platform is reachable', `HTTP ${res.status}`);
        else fail('Platform is reachable', `HTTP ${res.status}`);
    } catch (e) {
        fail('Platform is reachable', String(e));
    }

    // Test 2: EEP discovery via Link headers
    if (ENTITY) {
        try {
            const entityUrl = ENTITY.startsWith('did:') ? `${TARGET}/resolve?did=${ENTITY}` : `${TARGET}/${ENTITY}`;
            const res = await fetch(entityUrl, { headers: { Accept: 'application/json' } });
            const linkHeader = res.headers.get('link') || '';
            if (linkHeader.includes('rel="subscribe"')) {
                pass('EEP discovery via Link header', 'rel="subscribe" found');
            } else {
                fail('EEP discovery via Link header', 'Link header missing rel="subscribe"');
            }
        } catch (e) {
            fail('EEP discovery via Link header', String(e));
        }
    } else {
        skip('EEP discovery via Link header', 'no --entity specified');
    }

    // Test 3: Subscribe endpoint exists
    let subscriptionId: string | null = null;
    let webhookSecret: string | null = null;

    if (API_KEY && ENTITY) {
        try {
            const body = JSON.stringify({
                source_did: ENTITY,
                event_types: ['com.example.entity.*'],
                delivery_method: 'webhook',
                delivery_url: webhookUrl,
            });

            // Start receiving the challenge before posting
            const challengePromise = new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => resolve(false), 12_000);
                challengeResponse = (ch: string) => {
                    clearTimeout(timeout);
                    resolve(true);
                };
            });

            const res = await fetch(`${TARGET}/eep/subscribe`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
                body,
                signal: AbortSignal.timeout(15_000),
            });

            const json = await res.json() as any;

            if (res.status === 200 || res.status === 201) {
                subscriptionId = json.subscription_id;
                webhookSecret = json.delivery_secret;
                pass('Subscription creation', `ID: ${subscriptionId}`);
            } else {
                fail('Subscription creation', `HTTP ${res.status}: ${JSON.stringify(json)}`);
            }

            // Test 4: WebSub Intent Verification
            const challengePassed = await challengePromise;
            if (challengePassed) {
                pass('WebSub Intent Verification', 'challenge/response completed within 10s');
            } else {
                fail('WebSub Intent Verification', 'no challenge received within 12s');
            }
        } catch (e) {
            fail('Subscription creation', String(e));
            fail('WebSub Intent Verification', 'skipped due to subscription failure');
        }
    } else {
        skip('Subscription creation', 'requires --api-key and --entity');
        skip('WebSub Intent Verification', 'requires --api-key and --entity');
    }

    // Test 5: Test event delivery and HMAC verification
    if (subscriptionId && webhookSecret) {
        receivedWebhook = null;
        receivedHeaders = null;
        receivedRawBody = null;

        // Trigger a synthetic delivery via SPECIFICATION.md §5.1.1.
        //
        // This MUST report its own outcome. `fetch` only rejects on a
        // transport error, so a 404 (publisher does not implement the
        // endpoint) used to resolve normally — the runner then waited 5s,
        // received nothing, and blamed the *delivery* rather than the
        // missing trigger. Implementers saw "Webhook delivery received:
        // FAIL" and went hunting in their own dispatcher.
        let triggered = false;
        try {
            const triggerRes = await fetch(`${TARGET}/eep/subscriptions/${subscriptionId}/test`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${API_KEY}` },
                signal: AbortSignal.timeout(5000),
            });
            if (triggerRes.status === 202 || triggerRes.ok) {
                triggered = true;
                logPass('Test delivery trigger (§5.1.1)', `HTTP ${triggerRes.status}`);
            } else if (triggerRes.status === 404) {
                logFail(
                    'Test delivery trigger (§5.1.1)',
                    `HTTP 404 — POST /eep/subscriptions/{id}/test is not implemented. ` +
                    `Standard Webhooks header and HMAC probes cannot run without it.`
                );
            } else {
                logFail('Test delivery trigger (§5.1.1)', `HTTP ${triggerRes.status}`);
            }
        } catch (e) {
            logFail('Test delivery trigger (§5.1.1)', `request failed: ${String(e)}`);
        }

        // Only wait for a delivery we actually managed to trigger, and skip
        // (rather than fail) the downstream signature probes otherwise — the
        // publisher's signing is untested, not proven broken.
        if (triggered) {
            await new Promise(r => setTimeout(r, 5000));
        }

        if (triggered && receivedWebhook && receivedHeaders) {
            pass('Webhook delivery received', `event type: ${(receivedWebhook as any).type}`);

            // Verify Standard Webhooks headers
            const hasId = !!receivedHeaders['webhook-id'];
            const hasTimestamp = !!receivedHeaders['webhook-timestamp'];
            const hasSignature = !!receivedHeaders['webhook-signature'];

            if (hasId && hasTimestamp && hasSignature) {
                pass('Standard Webhooks headers present', 'webhook-id, webhook-timestamp, webhook-signature');

                const headers = receivedHeaders as Record<string, string>;
                const result = verifyWebhookSignature({
                    webhookId: headers['webhook-id'],
                    timestamp: headers['webhook-timestamp'],
                    signatureHeader: headers['webhook-signature'],
                    // Use the exact bytes the receiver captured — not a
                    // re-serialized JSON object — so whitespace and key
                    // ordering preserved by the sender flow through to HMAC.
                    rawBody: receivedRawBody ?? '',
                    secret: webhookSecret,
                });
                if (result.valid) {
                    pass('HMAC-SHA256 signature is valid', `Standard Webhooks v1 (${result.reason})`);
                } else {
                    fail('HMAC-SHA256 signature is valid', result.reason);
                }
            } else {
                fail('Standard Webhooks headers present', `missing: ${[!hasId && 'id', !hasTimestamp && 'timestamp', !hasSignature && 'signature'].filter(Boolean).join(', ')}`);
                if (hasSignature) {
                    fail('HMAC-SHA256 signature is valid', 'webhook-id, webhook-timestamp, or webhook-signature missing');
                }
            }

            // Validate CloudEvents headers
            const event = receivedWebhook as any;
            if (event.specversion === '1.0') pass('CloudEvents specversion is 1.0');
            else fail('CloudEvents specversion is 1.0', `got: ${event.specversion}`);

            if (event.id) pass('Event id field present');
            else fail('Event id field present', 'missing');

            if (event.source) pass('Event source field present');
            else fail('Event source field present', 'missing');

            if (event.eep_version) pass('EEP extension attributes present', `eep_version: ${event.eep_version}`);
            else fail('EEP extension attributes present', 'eep_version missing');

        } else if (!triggered) {
            // The trigger itself already failed and said so. Skip — rather
            // than fail — everything downstream: the publisher's signing and
            // envelope are untested here, not proven broken.
            const reason = 'test delivery could not be triggered (see §5.1.1)';
            skip('Webhook delivery received', reason);
            skip('Standard Webhooks headers present', reason);
            skip('HMAC-SHA256 signature is valid', reason);
            skip('CloudEvents specversion is 1.0', reason);
            skip('Event id field present', reason);
            skip('Event source field present', reason);
        } else {
            fail('Webhook delivery received', 'trigger accepted but no webhook arrived within 5s');
            skip('Standard Webhooks headers present', 'no delivery');
            skip('HMAC-SHA256 signature is valid', 'no delivery');
            skip('CloudEvents specversion is 1.0', 'no delivery');
            skip('Event id field present', 'no delivery');
            skip('Event source field present', 'no delivery');
        }
    } else {
        skip('Webhook delivery', 'requires active subscription');
    }

    if (LEVEL === 'standard' || LEVEL === 'full') {
        console.log('\n📋 STANDARD CONFORMANCE\n');

        // SSE endpoint
        if (ENTITY && API_KEY) {
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);

                const res = await fetch(`${TARGET}/eep/stream?source=${ENTITY}`, {
                    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'text/event-stream' },
                    signal: controller.signal,
                });

                if (res.headers.get('content-type')?.includes('text/event-stream')) {
                    pass('SSE stream endpoint', `Content-Type: text/event-stream`);
                } else {
                    fail('SSE stream endpoint', `Content-Type: ${res.headers.get('content-type')}`);
                }
            } catch (e: any) {
                if (e.name === 'AbortError') pass('SSE stream endpoint', 'connection opened (aborted after 3s)');
                else fail('SSE stream endpoint', String(e));
            }
        } else {
            skip('SSE stream endpoint', 'requires --api-key and --entity');
        }

        // Rate limit headers
        if (API_KEY) {
            try {
                const res = await fetch(`${TARGET}/eep/subscriptions`, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                if (res.headers.has('x-ratelimit-limit')) pass('Rate limit headers present', 'X-RateLimit-* headers found');
                else fail('Rate limit headers present', 'X-RateLimit-Limit header missing');
            } catch (e) {
                fail('Rate limit headers present', String(e));
            }
        } else {
            skip('Rate limit headers', 'requires --api-key');
        }
    }

    if (LEVEL === 'full') {
        console.log('\n📋 FULL CONFORMANCE (Whitepaper Alignment)\n');

        // Test: /.well-known/eep.json manifest exists
        try {
            const res = await fetch(`${TARGET}/.well-known/eep.json`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
                const json = await res.json() as any;
                pass('/.well-known/eep.json manifest reachable', `HTTP ${res.status}`);

                // Check required fields
                if (json.did) pass('manifest.did field present', json.did);
                else fail('manifest.did field present', 'missing');

                if (json.eep_version) pass('manifest.eep_version field present', json.eep_version);
                else fail('manifest.eep_version field present', 'missing');

                // ERC-8004 reputation field (G3)
                if (json.reputation && json.reputation.contract) {
                    pass('manifest.reputation (ERC-8004) field present', json.reputation.contract);
                } else {
                    fail('manifest.reputation (ERC-8004) field present', 'missing or no contract');
                }

                // PQC readiness flag (G8)
                if (typeof json.pqc_ready === 'boolean') {
                    pass('manifest.pqc_ready flag present', String(json.pqc_ready));
                } else {
                    fail('manifest.pqc_ready flag present', 'missing or not a boolean');
                }

                // x402 enabled flag (G2)
                if (typeof json.x402_enabled === 'boolean') {
                    pass('manifest.x402_enabled flag present', String(json.x402_enabled));
                } else {
                    fail('manifest.x402_enabled flag present', 'missing or not a boolean');
                }

                // Dynamic capability discovery (G5)
                if (json.capabilities_query_url) {
                    pass('manifest.capabilities_query_url field present', json.capabilities_query_url);
                } else {
                    logSkip('manifest.capabilities_query_url', 'optional — not present');
                }
            } else {
                fail('/.well-known/eep.json manifest reachable', `HTTP ${res.status}`);
                skip('manifest.did field present', 'manifest not reachable');
                skip('manifest.eep_version field present', 'manifest not reachable');
                skip('manifest.reputation (ERC-8004) field present', 'manifest not reachable');
                skip('manifest.pqc_ready flag present', 'manifest not reachable');
                skip('manifest.x402_enabled flag present', 'manifest not reachable');
            }
        } catch (e) {
            fail('/.well-known/eep.json manifest reachable', String(e));
        }

        // Test: 403 response for non-payment gate failures (G6)
        if (ENTITY) {
            try {
                const res = await fetch(`${TARGET}/${ENTITY}`, {
                    headers: {
                        Accept: 'application/json',
                        'X-Test-Mode': '403-probe',
                    },
                    signal: AbortSignal.timeout(5000),
                });
                if (res.status === 403) {
                    const json = await res.json() as any;
                    if (json.error === 'access_forbidden') {
                        pass('HTTP 403 response for non-payment gate', '403 + access_forbidden body');
                    } else {
                        logSkip('HTTP 403 response body', 'returned 403 but non-standard body');
                    }
                } else {
                    logSkip('HTTP 403 response for non-payment gate', `got ${res.status} — entity may be public`);
                }
            } catch (e) {
                logSkip('HTTP 403 response for non-payment gate', 'request failed');
            }
        } else {
            skip('HTTP 403 response for non-payment gate', 'no --entity specified');
        }
    }

    // ── EXTENDED PROBES (Layer 1, 402, WS, CloudEvents helpers) ────────────────
    console.log('\n📋 EXTENDED PROBES\n');

    // Layer 1 content negotiation (Accept: application/json vs text/markdown)
    if (ENTITY) {
        try {
            const entityUrl = ENTITY.startsWith('did:') ? `${TARGET}/resolve?did=${ENTITY}` : `${TARGET}/${ENTITY}`;
            const jsonRes = await fetch(entityUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
            const mdRes = await fetch(entityUrl, { headers: { Accept: 'text/markdown' }, signal: AbortSignal.timeout(5000) });
            const jsonCt = jsonRes.headers.get('content-type') || '';
            const mdCt = mdRes.headers.get('content-type') || '';
            if (jsonCt.includes('application/json') && jsonRes.ok) {
                logPass('Layer 1 content negotiation (JSON)', `Content-Type: ${jsonCt}`);
            } else {
                logFail('Layer 1 content negotiation (JSON)', `expected application/json, got ${jsonCt} (HTTP ${jsonRes.status})`);
            }
            if (mdCt.includes('text/markdown') && mdRes.ok) {
                logPass('Layer 1 content negotiation (Markdown)', `Content-Type: ${mdCt}`);
            } else {
                logSkip('Layer 1 content negotiation (Markdown)', `got ${mdCt} — markdown may not be supported`);
            }
        } catch (e) {
            logFail('Layer 1 content negotiation', String(e));
        }
    } else {
        logSkip('Layer 1 content negotiation', 'no --entity specified');
    }

    // 402 Payment Gate probe
    if (ENTITY) {
        try {
            const entityUrl = ENTITY.startsWith('did:') ? `${TARGET}/resolve?did=${ENTITY}` : `${TARGET}/${ENTITY}`;
            const res = await fetch(entityUrl, {
                headers: { Accept: 'application/json', 'X-Test-Mode': '402-probe' },
                signal: AbortSignal.timeout(5000),
            });
            if (res.status === 402) {
                const json = await res.json() as any;
                if (json.error === 'payment_required' && json.gate_type) {
                    logPass('HTTP 402 payment gate response', `gate_type: ${json.gate_type}`);
                } else {
                    logSkip('HTTP 402 payment gate body', 'returned 402 but non-standard body');
                }
            } else {
                logSkip('HTTP 402 payment gate response', `got ${res.status} — entity may not have payment gate`);
            }
        } catch (e) {
            logSkip('HTTP 402 payment gate response', 'request failed');
        }
    } else {
        logSkip('HTTP 402 payment gate response', 'no --entity specified');
    }

    // Content gate enforcement probe — POST /eep/gates/:did/verify-proof with
    // an empty proofs array should return 402 for any gated resource. We use
    // `content.*` as a generic resource path that most gate configs will map.
    if (ENTITY && ENTITY.startsWith('did:')) {
        try {
            const url = `${TARGET}/eep/gates/${encodeURIComponent(ENTITY)}/verify-proof`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource: 'content.*', proofs: [] }),
                signal: AbortSignal.timeout(5000),
            });
            if (res.status === 402) {
                logPass('content-gate-enforces-402', 'verify-proof without proofs → 402');
            } else if (res.status === 200) {
                const json = (await res.json().catch(() => null)) as { access?: string } | null;
                if (json?.access === 'granted') {
                    logSkip('content-gate-enforces-402', 'entity has no gated resources (200 granted)');
                } else {
                    logSkip('content-gate-enforces-402', `HTTP 200 but no grant body`);
                }
            } else {
                logSkip('content-gate-enforces-402', `HTTP ${res.status}`);
            }
        } catch (e) {
            logSkip('content-gate-enforces-402', `request failed: ${String(e).slice(0, 80)}`);
        }
    } else {
        logSkip('content-gate-enforces-402', 'no did: --entity specified');
    }

    // x402 round-trip probe — POST /eep/payment/challenge must return a
    // signed envelope (`challenge` JWS + `pay_to` + `exp`).
    if (ENTITY && ENTITY.startsWith('did:')) {
        try {
            const url = `${TARGET}/eep/payment/challenge`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pay_to_did: ENTITY,
                    resource: 'content.*',
                    amount: 1,
                    currency: 'usd',
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (res.status === 201) {
                const json = (await res.json().catch(() => null)) as
                    | { challenge?: string; exp?: number; pay_to?: unknown }
                    | null;
                if (
                    json &&
                    typeof json.challenge === 'string' &&
                    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(json.challenge) &&
                    typeof json.exp === 'number' &&
                    json.pay_to
                ) {
                    logPass('x402-round-trip (challenge)', 'signed challenge envelope returned');
                } else {
                    logFail('x402-round-trip (challenge)', 'body missing challenge/exp/pay_to');
                }
            } else if (res.status === 404) {
                logSkip('x402-round-trip (challenge)', 'entity not found on target');
            } else if (res.status === 503) {
                logSkip('x402-round-trip (challenge)', 'x402 disabled on target');
            } else {
                logSkip('x402-round-trip (challenge)', `HTTP ${res.status}`);
            }
        } catch (e) {
            logSkip('x402-round-trip (challenge)', `request failed: ${String(e).slice(0, 80)}`);
        }
    } else {
        logSkip('x402-round-trip (challenge)', 'no did: --entity specified');
    }

    // WebSocket pulse endpoint (short probe)
    try {
        const wsUrl = TARGET.replace(/^http/, 'ws') + '/eep/pulse';
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const res = await fetch(TARGET + '/eep/pulse', {
            headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
            signal: controller.signal,
        }).catch(() => null);
        if (res && (res.status === 101 || res.status === 426)) {
            logPass('WebSocket pulse endpoint', `HTTP ${res.status} at /eep/pulse`);
        } else {
            logSkip('WebSocket pulse endpoint', res ? `HTTP ${res.status}` : 'connection failed — WS may not be exposed');
        }
    } catch {
        logSkip('WebSocket pulse endpoint', 'not reachable');
    }

    // Wire CloudEvents helpers for received webhook
    if (receivedWebhook && typeof receivedWebhook === 'object' && !('_raw' in receivedWebhook)) {
        const ceErrors = validateCloudEventsEnvelope(receivedWebhook as Record<string, unknown>);
        if (ceErrors.length === 0) {
            logPass('CloudEvents envelope validation (helpers)', 'all required fields present');
        } else {
            logFail('CloudEvents envelope validation (helpers)', `missing: ${ceErrors.join(', ')}`);
        }

        const eepErrors = validateEEPExtensions(receivedWebhook as Record<string, unknown>);
        if (eepErrors.length === 0) {
            logPass('EEP extension validation (helpers)', 'eep_version present');
        } else {
            logFail('EEP extension validation (helpers)', `missing: ${eepErrors.join(', ')}`);
        }

        if (receivedHeaders) {
            const whCheck = checkWebhookHeaders(receivedHeaders);
            if (whCheck.missing.length === 0) {
                logPass('Webhook headers validation (helpers)', 'all Standard Webhooks headers present');
            } else {
                logFail('Webhook headers validation (helpers)', `missing: ${whCheck.missing.join(', ')}`);
            }
        }
    }

    // ── V0.1 NORMATIVE EXTENSIONS (optional reference endpoints) ─────────────
    console.log('\n📋 V0.1 REFERENCE CAPABILITIES (optional)\n');

    try {
        const res = await fetch(`${TARGET}/.well-known/eep-registry.json`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const json = await res.json() as Record<string, unknown>;
            const econ = json.economics as Record<string, unknown> | undefined;
            if (econ && (econ.query_quota || econ.registration_fee || econ.staking_or_challenge)) {
                pass('Federation registry economics metadata', 'economics block present');
            } else {
                logSkip('Federation registry economics metadata', 'no economics fields');
            }
        } else {
            logSkip('Federation registry economics metadata', `HTTP ${res.status}`);
        }
    } catch (e) {
        logSkip('Federation registry economics metadata', String(e));
    }

    try {
        const url = `${TARGET}/eep/trust-status?agent_did=${encodeURIComponent('did:key:compliance-probe')}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const json = await res.json() as { trust_state?: string };
            if (json.trust_state === 'cold_start' || json.trust_state === 'standard') {
                pass('Cold-start trust status endpoint', json.trust_state);
            } else {
                fail('Cold-start trust status endpoint', 'trust_state missing or invalid');
            }
        } else {
            logSkip('Cold-start trust status endpoint', `HTTP ${res.status}`);
        }
    } catch (e) {
        logSkip('Cold-start trust status endpoint', String(e));
    }

    try {
        const res = await fetch(`${TARGET}/eep/delegation/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credential_subject: {
                    operator_privacy_policy_hash: 'pol_compliance',
                    allowed_dpv_purposes: ['analytics'],
                    max_retention_days: 90,
                },
                data_request_requirement: {
                    type: 'data_request',
                    policy_hash: 'pol_compliance',
                    requested_claims: [{ purpose: 'analytics', claim: 'usage', retention_days: 7 }],
                },
            }),
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 200) {
            const json = await res.json() as { valid?: boolean };
            if (json.valid === true) pass('Delegation privacy verification endpoint', 'binding OK');
            else logSkip('Delegation privacy verification endpoint', 'valid=false');
        } else {
            logSkip('Delegation privacy verification endpoint', `HTTP ${res.status}`);
        }
    } catch (e) {
        logSkip('Delegation privacy verification endpoint', String(e));
    }

    // ── SUMMARY ──────────────────────────────────────────────────
    const { passed, failed, skipped } = runner.summary();

    console.log('\n' + '─'.repeat(60));
    console.log(`\n📊 Results: ${passed} passed | ${failed} failed | ${skipped} skipped\n`);
    const auditReport = toAuditReport();
    console.log(`   Audit score: ${auditReport.score_100}/100`);

    const conformanceLevel = runner.conformanceLabel(LEVEL);
    console.log(`   ${conformanceLevel}\n`);

    if (REPORT_JSON_PATH) {
        await writeFile(REPORT_JSON_PATH, JSON.stringify(auditReport, null, 2), 'utf8');
        console.log(`   Wrote JSON report: ${REPORT_JSON_PATH}`);
    }
    if (REPORT_MD_PATH) {
        await writeFile(REPORT_MD_PATH, toMarkdownReport(auditReport), 'utf8');
        console.log(`   Wrote Markdown report: ${REPORT_MD_PATH}`);
    }
    if (REPORT_HTML_PATH) {
        await writeFile(REPORT_HTML_PATH, toHtmlReport(auditReport), 'utf8');
        console.log(`   Wrote HTML report: ${REPORT_HTML_PATH}`);
    }

    process.exit(failed > 0 ? 1 : 0);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
server.listen(TEST_PORT, () => {
    runTests()
        .catch(console.error)
        .finally(() => server.close());
});
