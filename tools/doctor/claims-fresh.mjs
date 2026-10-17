// claims-fresh.mjs - two claim types from CR-2026-10-13-HONOUR, imported by claims.mjs.
//   file_fresh         (VCS-06)  the last dated line of a log is young enough
//   config_paths_each  (VCS-12)  every folder in a list holds a named file with named lines
// Both are read-only. Never run directly.

import fs from 'node:fs';
import path from 'node:path';
import { readText, parseIso, getLeaf } from '../../hooks/lib/common.mjs';
import { readDoctorConfig } from './context.mjs';
import { claimResult, resolveClaimPath, isFile, isDir, DATED_LINE_RX, positiveInt } from './claims-base.mjs';
import { DAY, isoDay } from './util.mjs';

// ---------------------------------------------------------------- file_fresh
// Fields: path, maxDays. The last line that STARTS with an ISO date or timestamp is the record;
// undated lines (banners, continuations) are skipped. A missing file is a FAIL, not UNKNOWN: the
// claim says a drill was logged, and nothing proved is the failure mode VCS-06 names.
export function fileFreshClaim(c, ctx) {
    const r = resolveClaimPath(c.path, ctx);
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const maxDays = positiveInt(c.maxDays);
    if (maxDays == null) return claimResult(c, 'UNKNOWN', "'maxDays' must be a positive integer");
    if (!isFile(r.path)) {
        // graceFromInstall: a fresh brain has no drill yet. The adopt date is a fact on the disk, the
        // write time of <brain>/state/installed.json, so the first drill is due maxDays after it.
        if (c.graceFromInstall === true && ctx.brain) {
            const inst = path.join(ctx.brain, 'state', 'installed.json');
            if (isFile(inst)) {
                const due = fs.statSync(inst).mtimeMs + maxDays * DAY;
                if (Date.now() <= due) return claimResult(c, 'PASS', `no drill logged yet; the first one is due by ${isoDay(due)} (${maxDays} days after adopt)`);
                return claimResult(c, 'FAIL', `no file at ${r.path}; the first drill was due by ${isoDay(due)}, ${maxDays} days after adopt`);
            }
        }
        return claimResult(c, 'FAIL', `no file at ${r.path} (nothing has proved the backup gives anything back)`);
    }
    let last = null;
    for (const line of readText(r.path).split(/\r?\n/)) {
        const m = DATED_LINE_RX.exec(line);
        if (!m) continue;
        const t = parseIso(m[1], true);
        if (t == null) continue;
        last = t;
    }
    if (last == null) return claimResult(c, 'FAIL', `no dated line in ${r.path} (a line that starts with an ISO date is the record)`);
    const age = Math.floor((Date.now() - last) / DAY);
    const stamp = isoDay(last);
    if (age > maxDays) return claimResult(c, 'FAIL', `last dated line ${stamp} is ${age} day(s) old; the limit is ${maxDays} (${r.path})`);
    return claimResult(c, 'PASS', `last dated line ${stamp}, ${age} day(s) old, limit ${maxDays}`);
}

// ---------------------------------------------------------------- config_paths_each
// Fields: configKey (a list key in doctor.config.json, already expanded by the config reader) or
// paths[] (claim paths, expanded here); file; contains[]. Every folder must hold `file` with every
// string in `contains`. An empty list is a PASS that says so: nothing listed, nothing to prove.
function configListForClaim(key, ctx) {
    const cfgPath = ctx.brain ? path.join(ctx.brain, 'doctor.config.json') : path.join(ctx.kit, 'templates', 'doctor.config.json');
    const cr = readDoctorConfig(cfgPath, ctx);
    if (!cr.ok) return { detail: `config unreadable: ${cr.error}` };
    const k = Object.keys(cr.cfg).find((x) => x.toLowerCase() === key.toLowerCase());
    if (k === undefined) return { detail: `config key '${key}' is not in ${cfgPath} (nor a default)` };
    const v = cr.cfg[k];
    return { list: (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x) => x).map(String) };
}

export function configPathsEachClaim(c, ctx) {
    const file = String(c.file ?? '');
    if (!file.trim()) return claimResult(c, 'UNKNOWN', "claim has no 'file'");
    const needles = (Array.isArray(c.contains) ? c.contains : c.contains == null ? [] : [c.contains]).filter((x) => x).map(String);
    let list; let source;
    if (c.configKey) {
        const got = configListForClaim(String(c.configKey), ctx);
        if (!got.list) return claimResult(c, 'UNKNOWN', got.detail);
        list = got.list; source = `config '${c.configKey}'`;
    } else if (Object.prototype.hasOwnProperty.call(c, 'paths')) {
        list = [];
        for (const raw of Array.isArray(c.paths) ? c.paths : [c.paths]) {
            const r = resolveClaimPath(raw, ctx);
            if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
            list.push(r.path);
        }
        source = 'the claim';
    } else return claimResult(c, 'UNKNOWN', "claim needs 'configKey' or 'paths'");
    if (list.length === 0) return claimResult(c, 'PASS', `nothing listed under ${source}; nothing to prove, said out loud`);
    const faults = [];
    for (const folder of list) {
        const leaf = getLeaf(folder);
        if (!isDir(folder)) { faults.push(`${leaf}: folder missing (${folder})`); continue; }
        const f = path.join(folder, file);
        if (!isFile(f)) { faults.push(`${leaf}: missing ${file}`); continue; }
        const body = readText(f);
        for (const n of needles) { if (!body.includes(n)) { faults.push(`${leaf}: ${file} lacks '${n}'`); break; } }
    }
    if (faults.length > 0) return claimResult(c, 'FAIL', faults.join('; '));
    return claimResult(c, 'PASS', `${list.length} folder(s) from ${source} each carry ${file} with ${needles.join(', ')}`);
}
