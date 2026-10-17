// claims-keyed.mjs - json_keyed_match: two JSON files, one collection each, compared record by
// record on a shared key. Imported by claims.mjs. READ-ONLY.
//
// WHY a keyed compare and not a subset. Two files that each keep their own copy of a case table
// (golden vectors, fixtures, a rule list) may legitimately hold cases the other lacks. What must
// not happen is a case BOTH hold quietly disagreeing: that is two copies of the same math drifting.
// So: index both collections by `key`, and for every key present on BOTH sides require the two
// records to be deep-equal. Extra keys on either side are allowed unless `requireAll` is true, in
// which case every key in `path` must also exist in `other`.
//
// Fields: path, other, collection (dotted path allowed), key, requireAll (bool, default false).
// PASS    every shared key deep-equal (and, with requireAll, nothing in `path` is missing from `other`)
// FAIL    a shared key differs (detail: the key and the first differing field), or requireAll misses
// UNKNOWN a file missing or not JSON, the collection path missing or not an array, no shared keys

import { readText, parseJson } from '../../hooks/lib/common.mjs';
import { claimResult, resolveClaimPath, isFile } from './claims-base.mjs';

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => (typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));
const keyOf = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? k : Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase()));

// Walks a dotted path ("a.b.c") through parsed JSON. A top-level property whose name itself
// contains a dot is tried first, whole. Returns null when any step is missing.
function jsonPathValue(node, dotted) {
    if (node == null) return null;
    if (isObj(node)) { const w = keyOf(node, dotted); if (w !== undefined) return node[w]; }
    let cur = node;
    for (const seg of dotted.split('.')) {
        if (seg === '' || !isObj(cur)) return null;
        const k = keyOf(cur, seg);
        if (k === undefined) return null;
        cur = cur[k];
    }
    return cur;
}

// FULL deep equality, unlike json_subset_equal (one-sided subset). Objects must carry the same
// property names (order ignored) with equal values; arrays the same length with equal items IN
// ORDER; scalars equal as case-sensitive strings (so 1 and "1" are equal, as elsewhere here).
// A key present with null on one side and absent on the other is a difference.
function deepEqual(a, b, where, diff) {
    if (a == null || b == null) {
        if (a == null && b == null) return true;
        diff.v = `${where} is ${a == null ? 'null' : `'${show(a)}'`} vs ${b == null ? 'null' : `'${show(b)}'`}`;
        return false;
    }
    const al = Array.isArray(a); const bl = Array.isArray(b);
    if (al || bl) {
        if (!(al && bl)) { diff.v = `${where} is an array on one side only`; return false; }
        if (a.length !== b.length) { diff.v = `${where} has ${a.length} vs ${b.length} item(s)`; return false; }
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i], `${where}[${i}]`, diff)) return false;
        return true;
    }
    const ao = isObj(a); const bo = isObj(b);
    if (ao || bo) {
        if (!(ao && bo)) { diff.v = `${where} is an object on one side only`; return false; }
        const names = [];
        for (const n of [...Object.keys(a), ...Object.keys(b)]) if (!names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
        names.sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : x.toLowerCase() > y.toLowerCase() ? 1 : 0));
        for (const n of names) {
            const ka = keyOf(a, n); const kb = keyOf(b, n);
            if (ka === undefined) { diff.v = `${where}.${n} is absent in the first file`; return false; }
            if (kb === undefined) { diff.v = `${where}.${n} is absent in the second file`; return false; }
            if (!deepEqual(a[ka], b[kb], `${where}.${n}`, diff)) return false;
        }
        return true;
    }
    if (scalar(a) === scalar(b)) return true;
    diff.v = `${where} is '${scalar(a)}' vs '${scalar(b)}'`;
    return false;
}
function show(v) { return isObj(v) || Array.isArray(v) ? JSON.stringify(v) : scalar(v); }

// Index a collection by the string value of `key`, in document order. Items without the key (or
// with a null value) are skipped and counted; a repeated key keeps the LAST item.
function keyIndex(items, key) {
    const index = new Map(); let skipped = 0;
    for (const item of items) {
        let k = null;
        if (isObj(item)) { const kk = keyOf(item, key); if (kk !== undefined) k = item[kk]; }
        if (k == null) { skipped++; continue; }
        index.set(scalar(k), item);
    }
    return { index, skipped };
}

function readJsonForClaim(p) {
    if (!isFile(p)) return { ok: false, error: `file missing: ${p}` };
    try { return { ok: true, data: parseJson(readText(p)) }; } catch (e) { return { ok: false, error: `not valid JSON: ${p} (${e.message})` }; }
}

export function jsonKeyedMatchClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    if (c.other == null || !String(c.other).trim()) return claimResult(c, 'UNKNOWN', "claim has no 'other'");
    const o = resolveClaimPath(c.other, ctx);
    if (!o.path) return claimResult(c, 'UNKNOWN', `other: ${o.detail}`);
    const col = String(c.collection ?? '');
    if (!col.trim()) return claimResult(c, 'UNKNOWN', "claim has no 'collection'");
    const key = String(c.key ?? '');
    if (!key.trim()) return claimResult(c, 'UNKNOWN', "claim has no 'key'");
    let requireAll = false;
    if (c.requireAll != null) {
        if (typeof c.requireAll === 'boolean') requireAll = c.requireAll;
        else return claimResult(c, 'UNKNOWN', "'requireAll' must be true or false");
    }
    const ra = readJsonForClaim(r.path); if (!ra.ok) return claimResult(c, 'UNKNOWN', ra.error);
    const rb = readJsonForClaim(o.path); if (!rb.ok) return claimResult(c, 'UNKNOWN', rb.error);
    const ca = jsonPathValue(ra.data, col);
    if (ca == null) return claimResult(c, 'UNKNOWN', `collection '${col}' not found in ${r.path}`);
    const cb = jsonPathValue(rb.data, col);
    if (cb == null) return claimResult(c, 'UNKNOWN', `collection '${col}' not found in ${o.path}`);
    if (!Array.isArray(ca)) return claimResult(c, 'UNKNOWN', `collection '${col}' is not an array in ${r.path}`);
    if (!Array.isArray(cb)) return claimResult(c, 'UNKNOWN', `collection '${col}' is not an array in ${o.path}`);
    const ia = keyIndex(ca, key); const ib = keyIndex(cb, key);
    let shared = 0; const missing = [];
    for (const [k, item] of ia.index) {
        if (!ib.index.has(k)) { missing.push(k); continue; }
        shared++;
        const diff = { v: '' };
        // First differing key in document order of `path`, and the first differing field inside it.
        if (!deepEqual(item, ib.index.get(k), '$', diff)) return claimResult(c, 'FAIL', `key '${key}' = '${k}' differs: ${diff.v} (${r.path} vs ${o.path})`);
    }
    if (requireAll && missing.length > 0) {
        let shown = missing.slice(0, 12).join(', ');
        if (missing.length > 12) shown += ', ...';
        return claimResult(c, 'FAIL', `requireAll: ${missing.length} key(s) in ${r.path} missing from ${o.path}: ${shown}`);
    }
    const onlyB = [...ib.index.keys()].filter((k) => !ia.index.has(k)).length;
    if (shared === 0) return claimResult(c, 'UNKNOWN', `no shared '${key}' keys to compare (${ia.index.size} in ${r.path}, ${ib.index.size} in ${o.path})`);
    const skipped = ia.skipped + ib.skipped;
    const note = skipped > 0 ? `; ${skipped} item(s) without '${key}' skipped` : '';
    return claimResult(c, 'PASS', `${shared} shared key(s) equal (${missing.length} only in path, ${onlyB} only in other${note})`);
}
