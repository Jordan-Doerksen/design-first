// render.mjs - Markdown rendering for build-law.mjs. Imported; not a CLI.
// Output is deterministic: no timestamp, group order from law.json, ids in ordinal order.

import path from 'node:path';
import { GRADE_ORDER, getProp } from './validate.mjs';

const protectCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function installedFlag(installed, c) {
    // null when no installed state was given: kit grades stand as declared.
    if (installed == null || c.enforcedBy == null) return null;
    const kind = String(c.enforcedBy.kind ?? '').toLowerCase(); const ref = String(c.enforcedBy.ref ?? '');
    switch (kind) {
        case 'hook': {
            const name = path.basename(ref.split('#')[0]).replace(/\.[^.]*$/, '');
            // A hook the installed state does not name keeps its kit grade; only a recorded false
            // (adopt found the script missing) prints HONOUR. The state records the hooks adopt
            // saw (state/law-installed.json, kept for the BRAIN-LAW-01 rebuild), so a hook that a
            // later plugin version registers is absent from it, and an absent name read as false
            // printed "(mechanism not installed)" over a hook that runs (CR-2026-10-15-GAPS D6).
            // A kit hook script that hooks/hooks.json does not register never reaches this line:
            // validate.mjs fails the build for a clause that names one.
            const flag = getProp(getProp(installed, 'hooks'), name);
            if (flag == null) return null;
            return Boolean(flag);
        }
        case 'permission-rule': return Boolean(getProp(installed, 'rootSettings'));
        case 'doctor-claim': return Boolean(getProp(installed, 'pointer'));
        case 'tool': return Boolean(getProp(installed, 'pointer'));
        case 'survey': return Boolean(getProp(installed, 'pointer'));   // the Doctor runs with a brain
        default: return true;
    }
}

function effectiveGrade(installed, c) {
    if (installedFlag(installed, c) === false) return { grade: 'HONOUR', note: ' (mechanism not installed)' };
    return { grade: String(c.grade).toUpperCase(), note: '' };
}

export function formatLaw(groups, clauses, installed) {
    const L = [];
    L.push('# LAW');
    L.push('');
    L.push('Generated from `law.json` by `tools/law/build-law.mjs`. Do not edit by hand: the Doctor compares this file with a fresh build and goes RED on any difference.');
    L.push('');
    L.push('Every clause has a permanent id (cite the id, never a line number), one sentence that carries no values, one owning file that holds the full text and the numbers, and an enforcement grade that says whether a machine will stop you breaking it.');
    L.push('');
    L.push('- **DENY** a permission deny rule refuses unconditionally on its pattern');
    L.push('- **HOOK** a hook inspects the call and denies it; what it cannot see is written in the owning file');
    // The Stop hook is ADVISE too (CR-2026-10-15-GAPS D4): it holds the first stop of a turn once,
    // with its card, and lets the turn end on the second. "Injects context and the call proceeds"
    // was true of the other ADVISE hooks only.
    L.push('- **ADVISE** a hook adds context or asks once; the call or the turn proceeds');
    L.push('- **GATE** a machine stops and asks, or the Doctor goes RED: an ask rule, a Doctor claim, a tool refusal');
    L.push('- **BUILDABLE** the mechanism is specified and not shipped');
    L.push('- **OWNER** a standing ruling; no mechanism, and none should try');
    L.push('- **HONOUR** a request; nothing fires');

    const counts = new Map(GRADE_ORDER.map((g) => [g, 0]));
    for (const [name, title] of Object.entries(groups)) {
        const rows = clauses.filter((c) => String(c.group).toLowerCase() === name.toLowerCase())
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        if (rows.length === 0) continue;
        L.push('');
        L.push(`## ${name} - ${title}`);
        L.push('');
        L.push('| id | grade | rule | owner |');
        L.push('|---|---|---|---|');
        for (const c of rows) {
            const eff = effectiveGrade(installed, c);
            counts.set(eff.grade, (counts.get(eff.grade) || 0) + 1);
            L.push(`| ${c.id} | ${eff.grade}${eff.note} | ${protectCell(c.rule)} | \`${c.owner}\` |`);
        }
    }

    L.push('');
    L.push('## Summary');
    L.push('');
    L.push('| grade | count |');
    L.push('|---|---|');
    for (const g of GRADE_ORDER) L.push(`| ${g} | ${counts.get(g)} |`);
    L.push(`| total | ${clauses.length} |`);
    L.push('');
    return L.join('\n');
}
