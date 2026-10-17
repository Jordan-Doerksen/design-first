// guard-gate-rules.mjs - guard rule 10: the design gate (GATE-08, GATE-09). Imported by guard.mjs
// after guard-rules.mjs, whose helpers (getRepoRoot, getManifestPaths, getSizeChange) it uses.
// Never run directly.
//
// A repository declares a design gate with one line in its DECISIONS.md, at the root or in docs/:
// `Design gate: on` (or a table row `| Design gate | on |`). While that line stands and the
// repository has no `records/gate-cleared.md`, every source Edit, Write or NotebookEdit is refused
// (a shell write is not inspected); documents, config and data stay writable, because the gate is
// cleared by writing documents. The record is read, not trusted: it carries one `Findings: <n>`
// line with n above zero (a review that finds nothing is a failed review, GATE-09; two Findings
// lines are ambiguous), and every `- ` line in it is a finding line in the form
// `- <id> resolved: <where>` or `- <id> recorded: <where>`, with n distinct ids. A list line in
// another style (`* `, `+ `, `1. `, `1) `) or inside a quote (`> - `) is refused, so no finding
// hides from the count. A record that falls short refuses the write and says which line. While the
// gate is not cleared, an Edit or Write that removes the gate line from the manifest is refused too:
// the owner ends a gate, by Change Request, never the agent.
//
// anchor: design-gate  mode: deny  verbs: gap-review,clear-gate

import path from 'node:path';
import { newDeny, isUnder, getLeaf, getExt, isFile, pathEq, has } from './common.mjs';
import { getRepoRoot, getManifestPaths, getSizeChange, readFileText } from './guard-rules.mjs';

const GATE_ON_RX = /^\s*\|?\s*\**\s*design gate\s*\**\s*(\||:)\s*\**\s*on\b/im;

// A finding line. The id is the finding's label and carries a digit (F1, F12, S1-8), so a word such
// as 'not' or 'never' cannot stand in the id's place. The status word comes right after the id, and
// the place that holds the answer comes after the colon.
const FINDING_RX = /^\s*-\s+(?<id>(?=[^\s:]*\d)[^\s:]+)\s+(?<status>resolved|recorded)\s*:\s*\S/i;
const NEGATED_STATUS_RX = /(\bnot|\bnever|\bno longer|n't|\bun)\s*(yet\s+|fully\s+)?(resolved|recorded)\b/i;
const FINDING_FORM = "'- <id> resolved: <where>' or '- <id> recorded: <where>'";
const RECORD_REL = path.join('records', 'gate-cleared.md');

// The manifest files of a repository that declare the gate. Both places are read when both exist:
// reading the root first and stopping there would let a new, empty root DECISIONS.md switch off
// a gate declared in docs/DECISIONS.md.
function gateManifests(repoRoot) {
    return getManifestPaths(repoRoot).filter((m) => GATE_ON_RX.test(readFileText(m)));
}

// Why one '- ' line of the record is not a finding line, in words the agent can act on.
function findingProblem(line) {
    const t = line.trim();
    let m;
    if (NEGATED_STATUS_RX.test(t)) return `a finding's status is negated: '${t}'; a finding that is not resolved is recorded in the manifest's Open Questions, then listed as '- <id> recorded: <where>'`;
    if ((m = /^-\s+(?<id>[^\s:]+)\s+(resolved|recorded)\b/i.exec(t))) {
        const id = m.groups.id;
        if (!/\d/.test(id)) return `the finding id '${id}' carries no digit: '${t}'; write ${FINDING_FORM}`;
        return `a finding names no place after its status: '${t}'; write ${FINDING_FORM}`;
    }
    if (/\b(resolved|recorded)\b/i.test(t)) return `a finding's status is not right after its id: '${t}'; write ${FINDING_FORM}`;
    return `a '- ' line is not a finding line: '${t}'; every '- ' line in the record is a finding, in the form ${FINDING_FORM}`;
}

// 'off' (no gate declared or no manifest), 'open' (declared, no record), 'cleared', or
// 'bad: <reason>' (a record that does not clear the gate).
// Workaround (CR-2026-10-15-GAPS D2): the record used to count every '- ' line in the file, check
// only that the count was not short, and find 'resolved' anywhere in a line, so an honest
// '- F1 not resolved yet' cleared the gate. A line now counts only in the finding form, any other
// '- ' line refuses, and the distinct ids must equal Findings.
export function gateState(repoRoot) {
    if (gateManifests(repoRoot).length === 0) return 'off';
    const record = path.join(repoRoot, RECORD_REL);
    if (!isFile(record)) return 'open';
    const r = readFileText(record);
    // Workaround (CR-2026-10-15-GAPS review): only the first Findings line was read, so a record
    // with 'Findings: 1' above 'Findings: 3' was read as one finding. Two Findings lines are two
    // answers to one question, and the record is refused as ambiguous.
    const counts = [...r.matchAll(/^[ \t]*findings[ \t]*:.*$/gim)].map((x) => x[0].trim());
    if (counts.length > 1) return `bad: ${counts.length} "Findings:" lines in ${RECORD_REL} ('${counts.join("', '")}'); the record states one count, on one line`;
    const fm = /^findings:\s*(\d+)\s*$/im.exec(r);
    if (!fm) return `bad: no "Findings: <n>" line in ${RECORD_REL}`;
    // Workaround (CR-2026-10-15-GAPS D2 check): a count past the integer range ('Findings:
    // 99999999999') crashed the parser, and the guard's internal-error path allowed the source write,
    // so a record could open the gate by crashing the parser. A count that does not parse is a bad record.
    const n = Number(fm[1]);
    if (!Number.isSafeInteger(n) || n > 2147483647) return `bad: "Findings: ${fm[1]}" is not a count of findings`;
    if (n < 1) return 'bad: "Findings: 0"; a review that finds nothing is a failed review (GATE-09)';
    const ids = [];
    for (const line of r.split(/\r?\n/)) {
        // Workaround (CR-2026-10-15-GAPS review): only '- ' lines were read, so '* F2 open' or
        // '1. F2 open' sat beside a clean '- F1 resolved: x' and the gate cleared on 'Findings: 1'.
        // A list line in another style is refused by name: every list line in the record is a '- '
        // finding line.
        if (/^\s*([*+]|\d+[.)])\s+\S/.test(line)) return `bad: a list line in another style: '${line.trim()}'; every list line in the record is a '- ' line, in the form ${FINDING_FORM}`;
        // Workaround (CR-2026-10-15-GAPS hooks check): a list inside a quote ('> - F2 open',
        // '> * F2 open') was read as neither, so a finding hid there as it did in another style.
        if (/^\s*(>\s*)+([-*+]|\d+[.)])\s+\S/.test(line)) return `bad: a list line inside a quote: '${line.trim()}'; every list line in the record is a '- ' line outside any quote, in the form ${FINDING_FORM}`;
        if (!/^\s*-\s+\S/.test(line)) continue;
        const m = FINDING_RX.exec(line);
        if (m) {
            // One id however it is marked up: '**F1**', '`F1`', '[F1]' and 'F1.' are the id F1, so
            // the same finding written two ways is not counted as two.
            const id = m.groups.id.replace(/^[*_`[\]().,;]+|[*_`[\]().,;]+$/g, '');
            if (!ids.some((x) => x.toLowerCase() === id.toLowerCase())) ids.push(id);
            continue;
        }
        return 'bad: ' + findingProblem(line);
    }
    if (ids.length !== n) {
        const listed = ids.length > 0 ? ` (${ids.join(', ')})` : '';
        return `bad: Findings: ${n} declared, ${ids.length} distinct finding id(s) listed${listed}; one finding line per finding, in the form ${FINDING_FORM}`;
    }
    return 'cleared';
}

// An Edit or Write of a manifest file that removes its gate line while the gate is not cleared.
// Workaround (CR-2026-10-15-GAPS D2): every DECISIONS.md write passed, because it is not source,
// so the agent could end an open gate by deleting one line, and nothing answered.
function gateLineRemoval(full, tool, ti, owner) {
    if (tool !== 'Edit' && tool !== 'Write') return null;
    if (getLeaf(full).toLowerCase() !== 'decisions.md') return null;
    if (!isFile(full)) return null;   // a new file removes no line
    const root = getRepoRoot(full);
    if (!root) return null;
    if (!getManifestPaths(root).some((m) => pathEq(m, full))) return null;   // not this repository's manifest
    if (!GATE_ON_RX.test(readFileText(full))) return null;
    const state = gateState(root);
    if (state === 'off' || state === 'cleared') return null;
    let change = getSizeChange(tool, ti, full);
    if (change == null && tool === 'Edit') {
        // Workaround (CR-2026-10-15-GAPS D2 check): the host's Edit finds old_string after folding
        // curly quotes to straight ones; the exact matcher above does not. An old_string with a
        // straight quote where the file has a curly one went unplaced, the check allowed, and the
        // host removed the gate line. Fold both sides the same way and look again.
        const fold = (s) => (s == null ? '' : String(s).replace(/\r\n/g, '\n').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'));
        const base = fold(readFileText(full)); const old = fold(ti.old_string); const nw = fold(ti.new_string);
        const i = old ? base.indexOf(old) : -1;
        if (i >= 0) {
            const all = Boolean(has(ti, 'replace_all') && ti.replace_all);
            change = { text: all ? base.split(old).join(nw) : base.slice(0, i) + nw + base.slice(i + old.length) };
        }
    }
    if (change == null) return null;               // the host refuses an Edit that matches nowhere
    if (GATE_ON_RX.test(change.text)) return null;
    const record = path.join(root, RECORD_REL);
    const why = state === 'open' ? `${record} does not exist` : `${record} does not clear it: ${state.slice(5)}`;
    const reason = `BLOCKED - this edit removes the "Design gate: on" line from ${full} while the design gate is open (${why}). ` +
        `GATE-08: work where a wrong output costs money, safety or a person's trust gets an adversarial gap review before the code, and only ${owner} ends a gate, by Change Request (GATE-06). ` +
        `Clear the gate with the record, or ask ${owner} to remove the line.`;
    return newDeny('guard', 'design gate line removed while the gate is open', reason);
}

export function designGateRule(full, sourceExts, owner, skipUnder, tool = '', ti = null) {
    if (!full) return null;
    for (const s of skipUnder) if (s && isUnder(full, s)) return null;
    const removal = gateLineRemoval(full, tool, ti, owner);
    if (removal) return removal;
    const ext = getExt(full);
    if (!sourceExts.includes(ext)) return null;
    const root = getRepoRoot(full);
    if (!root) return null;
    const state = gateState(root);
    if (state === 'off' || state === 'cleared') return null;
    const record = path.join(root, RECORD_REL);
    if (state === 'open') {
        const manifest = gateManifests(root)[0];
        const reason = `BLOCKED - ${manifest} declares "Design gate: on" and ${record} does not exist. ` +
            "GATE-08: work where a wrong output costs money, safety or a person's trust gets an adversarial gap review of the spec and the manifest before the code. " +
            `Run the review, resolve or record every finding, then write the record: a "Findings: <n>" line with n above zero and one line per finding in the form ${FINDING_FORM}, n distinct ids. ` +
            `Documents stay writable. If this repository is not gated after all, ${owner} removes the line from DECISIONS.md by Change Request; the guard refuses that edit from the agent while the gate is open.`;
        return newDeny('guard', 'design gate open (no gate-cleared record)', reason);
    }
    const why = state.slice(5);
    const reason = `BLOCKED - ${record} does not clear the design gate: ${why}. ` +
        'GATE-09: the gate is cleared when every finding is resolved or recorded, never because the review returned nothing. Fix the record, then build.';
    return newDeny('guard', 'design gate not cleared', reason);
}
