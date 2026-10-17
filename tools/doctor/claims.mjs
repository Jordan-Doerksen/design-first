// claims.mjs - run the assertions in a claims.json (SPEC 5.2). READ-ONLY.
// A claim is a checkable fact the prose depends on. A failing claim is a document announcing its
// own rot. A claim that cannot be evaluated returns UNKNOWN, never PASS. Absent is not zero.
//
// Statuses: PASS | FAIL (CLAIMS band, RED) | UNKNOWN (COULD-NOT-LOOK band, exit 2).
// The dispatcher and the simple types live here; tree_free_of, tree_equals, tree_each and
// tree_rules are in claims-tree.mjs, the two process-spawning types (generated_matches, hook_smoke)
// are in claims-exec.mjs, the two-file keyed compare (json_keyed_match) in claims-keyed.mjs,
// file_fresh and config_paths_each in claims-fresh.mjs, the ratchet in claims-ratchet.mjs, and the
// before/after compare (snapshot_diff) in claims-snapshot.mjs.

import fs from 'node:fs';
import { readText, parseJson, toRegex, parseIso } from '../../hooks/lib/common.mjs';
import { readPointer } from './context.mjs';
import { claimResult, resolveClaimPath, isFile, isDir, DATED_LINE_RX, positiveInt } from './claims-base.mjs';
import { gitLines, DAY } from './util.mjs';
import { jsonKeyedMatchClaim } from './claims-keyed.mjs';
import { fileFreshClaim, configPathsEachClaim } from './claims-fresh.mjs';
import { treeFreeOfClaim, treeEqualsClaim, treeEachClaim, treeRulesClaim } from './claims-tree.mjs';
import { generatedMatchesClaim, hookSmokeClaim } from './claims-exec.mjs';
import { ratchetClaim } from './claims-ratchet.mjs';
import { snapshotDiffClaim } from './claims-snapshot.mjs';

export function invokeClaims(claimsPath, ctx) {
    if (!fs.existsSync(claimsPath)) return [{ id: 'CLAIMS-FILE', type: 'file', status: 'UNKNOWN', detail: `claims.json not found at ${claimsPath}`, why: '' }];
    let doc;
    try { doc = parseJson(readText(claimsPath)); } catch (e) {
        return [{ id: 'CLAIMS-FILE', type: 'file', status: 'UNKNOWN', detail: `claims.json could not be parsed: ${e.message}`, why: '' }];
    }
    const out = [];
    const seen = new Set();
    const list = doc && Array.isArray(doc.claims) ? doc.claims : doc && doc.claims ? [doc.claims] : [];
    for (const c of list) {
        if (c == null) continue;
        if (c.id == null || !String(c.id).trim()) { out.push({ id: '(no id)', type: String(c.type ?? ''), status: 'UNKNOWN', detail: 'claim has no id', why: '' }); continue; }
        if (seen.has(c.id)) { out.push(claimResult(c, 'UNKNOWN', `duplicate claim id '${c.id}'`)); continue; }
        seen.add(c.id);
        try { out.push(invokeOneClaim(c, ctx)); }
        catch (e) { out.push(claimResult(c, 'UNKNOWN', `error: ${e.message}`)); }
    }
    return out;
}

function invokeOneClaim(c, ctx) {
    switch (String(c.type)) {
        case 'path_exists': return pathClaim(c, ctx, true);
        case 'path_absent': return pathClaim(c, ctx, false);
        case 'file_contains': return fileContainsClaim(c, ctx, true);
        case 'file_not_contains': return fileContainsClaim(c, ctx, false);
        case 'file_fresh': return fileFreshClaim(c, ctx);
        case 'config_paths_each': return configPathsEachClaim(c, ctx);
        case 'log_window_free_of': return logWindowClaim(c, ctx);
        case 'remote_is': return remoteIsClaim(c, ctx);
        case 'json_subset_equal': return jsonSubsetClaim(c, ctx);
        case 'json_keyed_match': return jsonKeyedMatchClaim(c, ctx);
        case 'generated_matches': return generatedMatchesClaim(c, ctx);
        case 'tree_free_of': return treeFreeOfClaim(c, ctx);
        case 'tree_equals': return treeEqualsClaim(c, ctx);
        case 'tree_each': return treeEachClaim(c, ctx);
        case 'tree_rules': return treeRulesClaim(c, ctx);
        case 'ratchet': return ratchetClaim(c, ctx);
        case 'hook_smoke': return hookSmokeClaim(c, ctx);
        case 'pointer_valid': return pointerValidClaim(c, ctx);
        case 'config_schema': return configSchemaClaim(c, ctx);
        case 'snapshot_diff': return snapshotDiffClaim(c, ctx);   // claims-snapshot.mjs (CR-2026-10-14-REVIEW)
        default: return claimResult(c, 'UNKNOWN', `unknown claim type '${c.type}'`);
    }
}

// ---------------------------------------------------------------- path_exists / path_absent

function pathClaim(c, ctx, wantPresent) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const present = fs.existsSync(r.path);
    if (wantPresent) return present ? claimResult(c, 'PASS', `present: ${r.path}`) : claimResult(c, 'FAIL', `missing: ${r.path}`);
    return present ? claimResult(c, 'FAIL', `present but should not be: ${r.path}`) : claimResult(c, 'PASS', `absent: ${r.path}`);
}

// ---------------------------------------------------------------- file_contains / file_not_contains

function fileContainsClaim(c, ctx, wantContains) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    if (c.needle == null || String(c.needle) === '') return claimResult(c, 'UNKNOWN', "claim has no 'needle'");
    if (!isFile(r.path)) return claimResult(c, 'UNKNOWN', `file missing: ${r.path}`);
    const has = readText(r.path).includes(String(c.needle));
    if (wantContains) return has ? claimResult(c, 'PASS', 'found') : claimResult(c, 'FAIL', `string absent: '${c.needle}' in ${r.path}`);
    return has ? claimResult(c, 'FAIL', `forbidden string present: '${c.needle}' in ${r.path}`) : claimResult(c, 'PASS', 'absent, as required');
}

// ---------------------------------------------------------------- log_window_free_of

// Lines that START with an ISO date or timestamp are dated; a dated line within `days` of now that
// contains `needle` fails the claim. Undated lines are ignored (continuations, banners). No log file
// = nothing has been logged, which is a PASS the detail says out loud.
function logWindowClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    if (c.needle == null || String(c.needle) === '') return claimResult(c, 'UNKNOWN', "claim has no 'needle'");
    const days = positiveInt(c.days);
    if (days == null) return claimResult(c, 'UNKNOWN', "'days' must be a positive integer");
    if (!isFile(r.path)) return claimResult(c, 'PASS', `no log file at ${r.path} (nothing has been logged)`);
    const cutoff = Date.now() - days * DAY;
    let hits = 0; let dated = 0; let first = '';
    for (const line of readText(r.path).split(/\r?\n/)) {
        const m = DATED_LINE_RX.exec(line);
        if (!m) continue;
        const t = parseIso(m[1], true);
        if (t == null) continue;
        dated++;
        if (t < cutoff) continue;
        if (line.includes(String(c.needle))) { hits++; if (first === '') first = line; }
    }
    if (hits > 0) {
        const shown = first.length > 160 ? first.slice(0, 160) + '...' : first;
        return claimResult(c, 'FAIL', `${hits} line(s) with '${c.needle}' in the last ${days} day(s) of ${r.path}; first: ${shown}`);
    }
    return claimResult(c, 'PASS', `no '${c.needle}' in the last ${days} day(s) (${dated} dated line(s) read)`);
}

// ---------------------------------------------------------------- remote_is

function remoteIsClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const remote = c.remote == null || !String(c.remote).trim() ? 'origin' : String(c.remote);
    if (c.pattern == null || String(c.pattern) === '') return claimResult(c, 'UNKNOWN', "claim has no 'pattern'");
    if (!isDir(r.path)) return claimResult(c, 'UNKNOWN', `folder missing: ${r.path}`);
    if ((gitLines(r.path, ['rev-parse', '--is-inside-work-tree'])[0] || '') !== 'true') return claimResult(c, 'UNKNOWN', `not a git work tree: ${r.path}`);
    const u = (gitLines(r.path, ['remote', 'get-url', remote])[0] || '').trim();
    if (!u) return claimResult(c, 'FAIL', `no remote '${remote}' in ${r.path}`);
    if (toRegex(String(c.pattern), 'i').test(u)) return claimResult(c, 'PASS', `${remote} = ${u}`);
    return claimResult(c, 'FAIL', `${remote} is ${u} (does not match /${c.pattern}/)`);
}

// ---------------------------------------------------------------- json_subset_equal

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const getCi = (o, k) => {
    if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
    const key = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    return key === undefined ? undefined : o[key];
};
export const scalar = (v) => (typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));

// Deep equality of `subset` against `actual`: objects compare the subset's keys only; arrays compare
// as order-insensitive multisets of equal length; scalars compare as strings.
function jsonValueEqual(subset, actual, where, diff) {
    if (subset == null) { if (actual == null) return true; diff.v = `${where} expected null`; return false; }
    if (actual == null) { diff.v = `${where} is missing`; return false; }
    if (Array.isArray(subset)) {
        const a = Array.isArray(actual) ? actual : [actual];
        if (a.length !== subset.length) { diff.v = `${where} has ${a.length} item(s), expected ${subset.length}`; return false; }
        const used = new Array(a.length).fill(false);
        for (let i = 0; i < subset.length; i++) {
            let found = false;
            for (let j = 0; j < a.length; j++) {
                if (used[j]) continue;
                if (jsonValueEqual(subset[i], a[j], `${where}[${i}]`, { v: '' })) { used[j] = true; found = true; break; }
            }
            if (!found) { diff.v = `${where}[${i}] has no equal item in the file`; return false; }
        }
        return true;
    }
    if (isObj(subset)) {
        if (!isObj(actual)) { diff.v = `${where} is not an object`; return false; }
        for (const [k, v] of Object.entries(subset)) {
            const av = getCi(actual, k);
            if (!jsonValueEqual(v, av === undefined ? null : av, `${where}.${k}`, diff)) return false;
        }
        return true;
    }
    if (scalar(subset) === scalar(actual)) return true;
    diff.v = `${where} is '${isObj(actual) || Array.isArray(actual) ? JSON.stringify(actual) : scalar(actual)}', expected '${scalar(subset)}'`;
    return false;
}

function jsonSubsetClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    if (c.subset == null) return claimResult(c, 'UNKNOWN', "claim has no 'subset'");
    if (!isFile(r.path)) return claimResult(c, 'UNKNOWN', `file missing: ${r.path}`);
    let actual;
    try { actual = parseJson(readText(r.path)); } catch (e) { return claimResult(c, 'UNKNOWN', `not valid JSON: ${r.path} (${e.message})`); }
    const diff = { v: '' };
    if (jsonValueEqual(c.subset, actual, '$', diff)) return claimResult(c, 'PASS', 'subset equal');
    return claimResult(c, 'FAIL', `${diff.v} (${r.path})`);
}

// ---------------------------------------------------------------- pointer_valid

function pointerValidClaim(c) {
    const ptr = readPointer();
    if (!ptr.ok) return claimResult(c, 'FAIL', ptr.error);
    const missing = ['root', 'brain', 'pluginRoot'].filter((k) => !isDir(String(ptr.data[k]))).map((k) => `${k}=${ptr.data[k]}`);
    if (missing.length > 0) return claimResult(c, 'FAIL', `pointer names folder(s) that do not exist: ${missing.join(', ')}`);
    return claimResult(c, 'PASS', `pointer at ${ptr.path}: root, brain, pluginRoot all exist`);
}

// ---------------------------------------------------------------- config_schema

function configSchemaClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const es = String(c.expected ?? '').trim();
    if (!/^[+-]?\d+$/.test(es)) return claimResult(c, 'UNKNOWN', "'expected' must be an integer");
    const expected = Number(es);
    if (!isFile(r.path)) return claimResult(c, 'UNKNOWN', `file missing: ${r.path}`);
    let j;
    try { j = parseJson(readText(r.path)); } catch { return claimResult(c, 'UNKNOWN', `not valid JSON: ${r.path}`); }
    const actual = j ? j.schema : null;
    if (actual == null) return claimResult(c, 'FAIL', `MIGRATE: ${r.path} has no 'schema' field; this Doctor expects schema ${expected}`);
    if (Number(actual) === expected) return claimResult(c, 'PASS', `schema ${expected}`);
    return claimResult(c, 'FAIL', `MIGRATE: ${r.path} is schema ${actual}; this Doctor expects schema ${expected}. Follow the migration note in the kit README.`);
}
