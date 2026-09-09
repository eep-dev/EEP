#!/usr/bin/env node
/**
 * Verify that the IETF Internet-Draft's normative field tables agree with
 * the shipped JSON Schemas.
 *
 * Why this exists: `docs/standards/draft-eep-protocol-core-00.md` and
 * `schemas/v0.1/eep-manifest.json` had drifted so far apart that not one
 * field name matched except `eep_version`. The draft required
 * `publisher_did`, `endpoints.*`, `supported_layers`, `delivery_methods`
 * and `conformance_level`; the schema requires `did`, `layers`,
 * `supported_content_types`, `pqc_ready` and `x402_enabled`. A publisher
 * conformant to one failed every MUST in the other, and nothing in CI
 * noticed — because nothing compared them.
 *
 * The draft is the document this project intends to submit for
 * standardisation. It has to describe the protocol that actually ships.
 *
 * Usage:
 *   node scripts/check-draft-schema-parity.mjs
 *
 * Exits non-zero, with a readable diff, when the two disagree.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRAFT = resolve(REPO_ROOT, 'docs/standards/draft-eep-protocol-core-00.md');
const MANIFEST_SCHEMA = resolve(REPO_ROOT, 'schemas/v0.1/eep-manifest.json');

/** Marker comments in the draft that delimit the manifest field table. */
const TABLE_START = '<!-- BEGIN manifest-fields (checked by scripts/check-draft-schema-parity.mjs) -->';
const TABLE_END = '<!-- END manifest-fields -->';

function fail(lines) {
    console.error('\n✗ IETF draft and eep-manifest.json disagree:\n');
    for (const line of lines) console.error(`  ${line}`);
    console.error(
        '\n  The draft must describe the protocol that ships. Update\n' +
        '  docs/standards/draft-eep-protocol-core-00.md, or change the schema\n' +
        '  and regenerate types — but do not let them diverge silently.\n'
    );
    process.exit(1);
}

const draft = readFileSync(DRAFT, 'utf8');
const startIdx = draft.indexOf(TABLE_START);
const endIdx = draft.indexOf(TABLE_END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    fail([
        'Could not locate the delimited manifest field table in the draft.',
        `Expected the markers:\n    ${TABLE_START}\n    ${TABLE_END}`,
    ]);
}

const table = draft.slice(startIdx, endIdx);

// Rows look like: | `field` | type | yes/no | description |
const draftFields = new Map();
for (const line of table.split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|[^|]*\|\s*(yes|no)\s*\|/.exec(line.trim());
    if (m) draftFields.set(m[1], m[2] === 'yes');
}

if (draftFields.size === 0) {
    fail(['The manifest field table is present but no rows parsed.']);
}

const schema = JSON.parse(readFileSync(MANIFEST_SCHEMA, 'utf8'));
const schemaProps = new Set(Object.keys(schema.properties ?? {}));
const schemaRequired = new Set(schema.required ?? []);

const problems = [];

for (const [field, draftRequired] of draftFields) {
    if (!schemaProps.has(field)) {
        problems.push(`draft documents \`${field}\`, which eep-manifest.json does not define`);
        continue;
    }
    const schemaSaysRequired = schemaRequired.has(field);
    if (draftRequired !== schemaSaysRequired) {
        problems.push(
            `\`${field}\`: draft says required=${draftRequired}, schema says required=${schemaSaysRequired}`
        );
    }
}

// Every schema-required property must appear in the draft. Optional ones may
// be omitted: the draft scopes itself to the Core tier and deliberately does
// not restate the full manifest surface.
for (const field of schemaRequired) {
    if (!draftFields.has(field)) {
        problems.push(`eep-manifest.json requires \`${field}\`, which the draft does not document`);
    }
}

if (problems.length > 0) fail(problems);

console.error(
    `✓ IETF draft matches eep-manifest.json ` +
    `(${draftFields.size} documented fields, ${schemaRequired.size} required)`
);
