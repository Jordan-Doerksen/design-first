// claims-ratchet.mjs - the ratchet claim type (2026-10-08, PRIN-04). Imported by claims.mjs and doctor.mjs.
//
// A number read from a generated markdown table may not rise above the value recorded in
// <state>/ratchets.json unless an unused `accepted` entry covers it; with no record, any value
// passes and becomes the baseline. The first use is the HONOUR row of the generated LAW.md
// Summary: a new rule that nothing enforces raises the count, and the run goes RED until the rule
// gets a mechanism, a different grade, or a signed raise.
//
// Fields:
//   path      the markdown file
//   row       first-cell text of the table row to read (for example HONOUR)
//   heading   optional; the row is looked for under this heading only. Default: Summary
//   accepted  optional { value, since, reason }: a signed raise (owner decision 2026-10-08). The count
//             may rise to `value` once. Needs `since` and `reason`.
//
// The last recorded value lives in <state>/ratchets.json, keyed by claim id. A claim is read-only:
// the result carries the value to record and doctor.mjs writes it after the run (saveRatchets).
//
// PASS     no record yet (the baseline is recorded, and the note says so); the count is at or under
//          the record; or the count is over the record and an unused `accepted` entry covers it.
//          The record becomes the count.
// FAIL     the count is over the record and no unused `accepted` entry covers it. The record does
//          NOT move, so a re-run stays RED.
// UNKNOWN  file missing, heading or row not found, cell not an integer, `accepted` incomplete, or
//          the record file unreadable. Absent is not zero.
//
// One shot: an `accepted` entry is spent the first time it lets a rise through (the record keeps
// its since|value key). Without that, a signed raise would stay a standing ceiling: the count
// could fall and climb back to it with nobody signing anything.

import fs from 'node:fs';
import path from 'node:path';
import { readText, parseJson } from '../../hooks/lib/common.mjs';
import { derivedPaths } from './context.mjs';
import { claimResult, resolveClaimPath, isFile } from './claims-base.mjs';

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const intOf = (v) => { const s = String(v ?? '').trim(); return /^[+-]?\d+$/.test(s) ? Number(s) : null; };
const ratchetPath = (stateDir) => path.join(stateDir, 'ratchets.json');

// Returns { ok, map, error }. A missing file is an empty map, not an error.
function readRatchets(stateDir) {
    const p = ratchetPath(stateDir);
    const r = { ok: true, map: new Map(), error: '' };
    if (!isFile(p)) return r;
    try {
        const j = parseJson(readText(p));
        for (const [k, v] of Object.entries(j || {})) {
            const n = intOf(v && v.value);
            if (n == null) throw new Error(`record '${k}' has no integer value`);
            r.map.set(k, { value: n, recordedAt: String(v.recordedAt ?? ''), acceptedUsed: String(v.acceptedUsed ?? '') });
        }
    } catch (e) { r.ok = false; r.error = `ratchet record unreadable at ${p} (${e.message})`; }
    return r;
}

// Reads the integer in the second cell of the row whose first cell is `row`, under `heading`.
function tableCount(text, heading, row) {
    const headRx = new RegExp('^#{1,6}\\s+' + escRx(heading) + '\\s*$', 'i');
    const rowRx = new RegExp('^\\|\\s*' + escRx(row) + '\\s*\\|\\s*([^|]*?)\\s*\\|', 'i');
    let inside = false; let sawHeading = false;
    for (const l of text.replace(/\r\n/g, '\n').split('\n')) {
        if (/^#{1,6}\s/.test(l)) { inside = headRx.test(l); if (inside) sawHeading = true; continue; }
        if (!inside) continue;
        const m = rowRx.exec(l);
        if (m) {
            const v = intOf(m[1]);
            if (v != null) return { ok: true, value: v };
            return { ok: false, error: `row '${row}' under '${heading}' holds '${m[1]}', not an integer` };
        }
    }
    if (!sawHeading) return { ok: false, error: `heading '${heading}' not found` };
    return { ok: false, error: `no row '${row}' under heading '${heading}'` };
}

export function ratchetClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    if (c.row == null || !String(c.row).trim()) return claimResult(c, 'UNKNOWN', "claim has no 'row'");
    if (!isFile(r.path)) return claimResult(c, 'UNKNOWN', `file missing: ${r.path}`);
    const heading = c.heading == null || !String(c.heading).trim() ? 'Summary' : String(c.heading);
    const row = String(c.row);

    let acc = null;
    if (c.accepted != null) {
        const av = intOf(c.accepted.value);
        if (av == null) return claimResult(c, 'UNKNOWN', "accepted needs an integer 'value'");
        if (c.accepted.reason == null || !String(c.accepted.reason).trim()) return claimResult(c, 'UNKNOWN', 'accepted has no reason');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.accepted.since ?? ''))) return claimResult(c, 'UNKNOWN', "accepted needs 'since' as an ISO date");
        acc = { value: av, key: `${c.accepted.since}|${av}`, since: String(c.accepted.since), reason: String(c.accepted.reason) };
    }

    const read = tableCount(readText(r.path), heading, row);
    if (!read.ok) return claimResult(c, 'UNKNOWN', `${read.error} in ${r.path}`);
    const now = read.value;

    const recs = readRatchets(derivedPaths(ctx).stateDir);
    if (!recs.ok) return claimResult(c, 'UNKNOWN', recs.error);
    const rec = recs.map.get(String(c.id));

    let detail = ''; let note = ''; let used = rec ? rec.acceptedUsed : '';
    if (rec == null) {
        detail = `${row} is ${now}; no record yet, baseline recorded`;
        note = `ratchet ${c.id}: baseline recorded, ${row} = ${now}`;
    } else if (now < rec.value) {
        detail = `${row} fell from ${rec.value} to ${now}`;
        note = `ratchet ${c.id}: ${row} fell from ${rec.value} to ${now}; the record tightens to ${now}`;
    } else if (now === rec.value) {
        detail = `${row} is ${now}, the recorded value`;
    } else if (acc && acc.key !== rec.acceptedUsed && now <= acc.value) {
        used = acc.key;
        detail = `${row} rose from ${rec.value} to ${now} under the signed raise of ${acc.since}`;
        note = `ratchet ${c.id}: ${row} rose from ${rec.value} to ${now}, signed ${acc.since}: ${acc.reason}`;
    } else {
        const why = !acc ? "no 'accepted' entry signs the rise"
            : acc.key === rec.acceptedUsed ? `the accepted raise of ${acc.since} to ${acc.value} was already spent; a new rise needs a new entry`
                : `the accepted raise covers ${acc.value}, not ${now}`;
        return claimResult(c, 'FAIL', `${row} rose from ${rec.value} to ${now} in ${r.path}; ${why}. Give the new rule a mechanism or another grade, or sign the raise in the claim (accepted: value, since, reason).`);
    }
    const res = claimResult(c, 'PASS', detail);
    res.record = { value: now, acceptedUsed: used };
    if (note) res.note = note;
    return res;
}

// Merges the records carried by passing ratchet claims into <state>/ratchets.json. The file is
// rewritten only when a record changed, so a re-run with nothing changed is byte-identical.
export function saveRatchets(stateDir, claims, stamp) {
    const carry = claims.filter((c) => c.status === 'PASS' && c.record);
    if (carry.length === 0) return;
    const recs = readRatchets(stateDir);
    if (!recs.ok) return;                     // the claim already reported it as UNKNOWN
    const map = recs.map; let changed = false;
    for (const c of carry) {
        const old = map.get(String(c.id));
        if (old == null || old.value !== c.record.value || old.acceptedUsed !== String(c.record.acceptedUsed)) {
            map.set(String(c.id), { value: c.record.value, recordedAt: stamp, acceptedUsed: String(c.record.acceptedUsed) });
            changed = true;
        }
    }
    if (!changed) return;
    const out = {};
    for (const k of [...map.keys()].sort()) { const v = map.get(k); out[k] = { value: v.value, recordedAt: v.recordedAt, acceptedUsed: v.acceptedUsed }; }
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(ratchetPath(stateDir), JSON.stringify(out, null, 2) + '\n', 'utf8');
}
