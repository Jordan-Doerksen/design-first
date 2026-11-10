// bounded.mjs - the boundedFiles rows the card hook holds a file to, read from the brain's doctor.config.json through the pointer or, with no brain, from the repository's .claude/kit/extract.json (0.3.0).
// Imported by hooks/card.mjs; never run directly. One parser for both sources, so a row reads the
// same whichever file carries it.
//
//   parseBoundedFiles(rawCfg, expandPath, problems)
//       The rows of one config. rawCfg is the boundedFiles list, or the object that carries it.
//       Each row comes back as { glob, maxBytes, headLines, idPatterns: [RegExp], appendOnly } with
//       the defaults 30000, 15, [] and false; a value that does not parse keeps its default and is
//       named in problems. expandPath turns the typed glob (a string with ${ROOT}, ${BRAIN} or
//       %USERPROFILE%, or a host-neutral { repo, path } row) into a full path, or null to drop the
//       row (it names another host or another repository). An idPatterns entry JavaScript cannot
//       read is dropped with a line in problems, never thrown: one bad pattern must not disarm the
//       other rows. maxBytes or headLines at 0 or less turns that rule off for the row.
//   readBoundedFiles(C, ptr, problems)
//       The rows for this call: the brain's doctor.config.json when the pointer names a brain that
//       has one; else the extract lib/common.mjs extractPath names (DF_EXTRACT_PATH, a test seam,
//       when it names a file, then ${CLAUDE_PROJECT_DIR}/.claude/kit/extract.json), the one candidate
//       rule the guard reads too, whose `values` carry the same key; else [].
//       A file that exists and is not JSON, a doctor.config.json that is not a JSON object, and an
//       extract whose values is not an object throw, as lib/common.mjs readBrainConfig does for the
//       guard: the caller decides what that costs (the card hook allows the call and logs an ERROR
//       line, the kit's failure policy), and no reader takes a broken file for no rows in silence.
//       A doctor.config.json or an extract the parser cannot read throws '<doctor.config.json|extract>
//       at <path> is not JSON: <the parser's words>', since the parser's own words name no file: the
//       ERROR line and the reply then say which file is broken and how, as they do for a config that is
//       not an object and as the guard's advisory does.
//   globMatches(full, glob)
//       The glob against a full path: only * is a wildcard and crosses folders (** is the same), as
//       the guard's readCeilingExempt globs do; both separators are equal; case folds where the kit
//       folds paths (Windows, macOS) and compares exactly on Linux.
//
// What this reader cannot see: a row the extract writer dropped as a host path, a config edited
// after the hook read it (each call reads afresh, so nothing is stale for longer than one call).

import path from 'node:path';
import { str, has, isFile, isDir, isPlainObject, readText, parseJson, toRegex, parseIntStrict, expandConfigPath, resolveRepoRow, extractPath, FOLD_CASE } from './common.mjs';

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export const BOUNDED_DEFAULTS = Object.freeze({ maxBytes: 30000, headLines: 15, appendOnly: false });

export function parseBoundedFiles(rawCfg, expandPath, problems = []) {
    const list = Array.isArray(rawCfg) ? rawCfg : rawCfg != null && typeof rawCfg === 'object' ? asList(rawCfg.boundedFiles) : [];
    const rows = [];
    list.forEach((r, i) => {
        const where = `boundedFiles[${i}]`;
        if (r == null || typeof r !== 'object' || Array.isArray(r)) { problems.push(`${where}: not an object ({ glob, maxBytes, headLines, idPatterns, appendOnly })`); return; }
        const typed = r.glob;
        if (typed == null || (typeof typed !== 'object' && str(typed).trim() === '')) { problems.push(`${where}: no glob`); return; }
        let glob = null;
        try { glob = typeof expandPath === 'function' ? expandPath(typed) : typeof typed === 'object' ? null : str(typed); }
        catch (e) { problems.push(`${where}: glob could not be expanded: ${e.message}`); return; }
        if (!glob) return;   // another host's path or another repository's row: not this hook's
        const row = { glob: String(glob), maxBytes: BOUNDED_DEFAULTS.maxBytes, headLines: BOUNDED_DEFAULTS.headLines, idPatterns: [], appendOnly: BOUNDED_DEFAULTS.appendOnly };
        for (const k of ['maxBytes', 'headLines']) {
            if (!has(r, k)) continue;
            const v = parseIntStrict(r[k]);
            if (v == null) problems.push(`${where}: ${k} '${str(r[k])}' is not an integer, the default ${row[k]} applies`);
            else row[k] = v;
        }
        for (const p of asList(r.idPatterns)) {
            if (p == null || str(p).trim() === '') continue;
            try { row.idPatterns.push(toRegex(str(p))); }
            catch (e) { problems.push(`${where}: idPatterns entry '${str(p)}' is not a regex JavaScript can read (${e.message}), skipped`); }
        }
        if (has(r, 'appendOnly')) row.appendOnly = r.appendOnly === true || str(r.appendOnly).trim().toLowerCase() === 'true';
        rows.push(row);
    });
    return rows;
}

// A typed glob as a full path. A string expands as the other path keys do (${ROOT}, ${BRAIN},
// %USERPROFILE%; a bare relative path is root-relative; a token with nothing to stand for leaves no
// path). A { repo, path } row is host-neutral: lib/common.mjs resolveRepoRow, the guard's own resolver,
// turns it into ${CLAUDE_PROJECT_DIR}/<path> only when the project folder's name, as typed or as it
// resolves through a link, is that repository (without case), else it is dropped; a repo of "*" (a
// glob that named the whole root on the PC, lead decision M25) resolves there in every clone.
export function expandBoundedGlob(typed, root, brain, projectDir) {
    if (typed != null && typeof typed === 'object') return resolveRepoRow(typed, projectDir);
    return expandConfigPath(str(typed), root, brain);
}

// Where this call's rows come from: { kind: 'brain' | 'extract' | 'none', path }. The extract is the
// one lib/common.mjs extractPath names, the candidate rule the guard's readBrainConfig reads through
// too, so a seam that names no file never hides the clone's own extract from one reader alone.
export function boundedSource(C, ptr) {
    if (ptr && ptr.pointer != null && ptr.brain && isDir(ptr.brain)) {
        const cfg = path.join(ptr.brain, 'doctor.config.json');
        if (isFile(cfg)) return { kind: 'brain', path: cfg };
    }
    const ex = extractPath();
    return ex ? { kind: 'extract', path: ex } : { kind: 'none', path: null };
}

export function readBoundedFiles(C, ptr, problems = []) {
    const src = boundedSource(C, ptr);
    if (src.kind === 'none' || !isFile(src.path)) return [];
    const brainSide = src.kind === 'brain';
    const text = readText(src.path);
    let doc;
    try { doc = parseJson(text); } catch (e) { throw new Error(`${brainSide ? 'doctor.config.json' : 'extract'} at ${src.path} is not JSON: ${e.message}`); }
    if (brainSide && !isPlainObject(doc)) throw new Error(`doctor.config.json at ${src.path} is not a JSON object`);
    if (!brainSide && !(isPlainObject(doc) && isPlainObject(doc.values))) throw new Error(`extract at ${src.path} has no values object`);
    const project = str(process.env.CLAUDE_PROJECT_DIR).trim();
    const expand = (typed) => expandBoundedGlob(typed, brainSide ? ptr.root : null, brainSide ? ptr.brain : null, project);
    return parseBoundedFiles(brainSide ? doc.boundedFiles : doc.values.boundedFiles, expand, problems);
}

const globCache = new Map();
export function globRegex(glob) {
    const key = String(glob);
    if (!globCache.has(key)) {
        const raw = key.replace(/\\/g, '/').replace(/\*\*/g, '*');
        const body = raw.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*');
        globCache.set(key, new RegExp('^' + body + '$', FOLD_CASE ? 'i' : ''));
    }
    return globCache.get(key);
}
export function globMatches(full, glob) {
    if (!full || !glob) return false;
    return globRegex(glob).test(String(full).replace(/\\/g, '/'));
}
