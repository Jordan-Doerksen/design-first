// claims-base.mjs - what every claim type shares: the result shape and the path rule. Imported by
// claims.mjs and the claims-*.mjs files. Never run directly. READ-ONLY.

import fs from 'node:fs';
import { expandDfPath, isUnexpanded } from './context.mjs';

export function claimResult(c, status, detail) {
    return { id: c.id, type: c.type, status, detail, why: c.why == null ? '' : String(c.why) };
}

// Expands a claim path; returns { path } or { detail } when it is empty or a variable could not be
// expanded. `field` names the claim field in the empty case.
export function resolveClaimPath(raw, ctx, field = 'path') {
    const p = expandDfPath(raw == null ? '' : String(raw), ctx);
    if (p === '') return { detail: `claim has no '${field}'` };
    if (isUnexpanded(p)) return { detail: `path has an unexpanded variable: ${p}` };
    return { path: p };
}

export const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
export const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// A line that STARTS with an ISO date or timestamp is dated.
export const DATED_LINE_RX = /^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/i;

export function positiveInt(v) {
    const s = String(v ?? '').trim();
    if (!/^[+-]?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}
