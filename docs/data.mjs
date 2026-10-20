// data.mjs - the kit's own facts, read once from the kit's own files, for docs/build.mjs (the page
// and the README blocks) and docs/publish.mjs (the site's method/data/kit.json). One parser for
// both (DISP-07): a second reader of commands/adopt.md or the transcripts would drift from the
// first, and the page and the site would then disagree about the same file. Imported; not a CLI.
//
//   readKit(kitRoot) -> { plugin, law, readme, adoptQs, transcripts, install }
//
// Nothing here is typed (DECISIONS 3.3, PRIN-03): the adopt questions come from commands/adopt.md,
// the transcripts from docs/src/transcript-*.txt with their first line as the recording's header,
// the install commands from README.md's "Install and adopt" code block, the clauses from law.json.

import fs from 'node:fs';
import path from 'node:path';
import { parseJson } from '../hooks/lib/json.mjs';

export const readText = (p) => { let t = fs.readFileSync(p, 'utf8'); if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); return t.replace(/\r\n/g, '\n'); };

// The four recorded runs, by the name the page and the site both use for each.
export const TRANSCRIPTS = { adopt: 'adopt', doctor: 'doctor', doctor_kit: 'doctor-kit', guard: 'guard' };

// A README section's body: the lines after "## <heading>" up to the next "## ".
export function readmeSection(md, heading) {
    const out = []; let inside = false;
    for (const l of md.split('\n')) {
        if (/^## /.test(l)) { if (inside) break; if (l.toLowerCase() === `## ${heading}`.toLowerCase()) { inside = true; continue; } }
        else if (inside) out.push(l);
    }
    if (!inside) throw new Error(`README section not found: ${heading}`);
    return out.join('\n').trim();
}

// adopt.md questions: "N. **Name** - "text"", the options on the line under it, the recommended one
// first. The text is the quote after "- " or ": ", since question 7 carries a condition and a
// quoted "<root>" before its text (the first quote on that line is not the question).
export function parseAdoptQuestions(adoptMd) {
    const lines = adoptMd.split('\n');
    const qs = [];
    lines.forEach((l, i) => {
        const m = /^(\d)\. \*\*([^*]+)\*\*.*?(?:- |: )"(.*?)"/.exec(l);
        if (!m) return;
        const opt = /^\s+Options:\s*(.*)$/.exec(lines[i + 1] || '');
        const rec = opt ? /^(.*?)\s*\(Recommended/.exec(opt[1]) : null;
        if (!rec) throw new Error(`commands/adopt.md: question ${m[1]} (${m[2]}) has no Options line with a (Recommended) first option`);
        const when = /\*\*(only if [^*]+)\*\*/.exec(l);
        qs.push({ n: Number(m[1]), name: m[2], text: m[3], rec: rec[1], when: when ? when[1] : null });
    });
    if (qs.length === 0) throw new Error('commands/adopt.md: no numbered questions found');
    return qs;
}

// A transcript: its header line ("# recorded <date> - design-first <version> - <machine>") parsed,
// and the lines after it as recorded.
export function parseTranscript(text, name) {
    const lines = text.split('\n');
    const hdr = lines[0];
    const m = /^# recorded (\S+) - design-first (\S+)(?: - (.*))?$/i.exec(hdr);
    if (!m) throw new Error(`transcript-${name}.txt has no header`);
    return { header: hdr.replace(/^[# ]+/, ''), recorded: m[1], kitVersion: m[2], machine: (m[3] || '').trim(), lines: lines.slice(1) };
}

// The README's install block: the commands in the first fenced block of "Install and adopt".
export function parseInstall(readme) {
    const m = /```[a-z]*\n([\s\S]*?)```/i.exec(readmeSection(readme, 'Install and adopt'));
    if (!m) throw new Error('README.md: no code block under Install and adopt');
    return m[1].trimEnd().split('\n').map((l) => l.trim()).filter((l) => l);
}

export function readKit(kitRoot) {
    const docs = path.join(kitRoot, 'docs');
    const src = path.join(docs, 'src');
    const plugin = parseJson(readText(path.join(kitRoot, '.claude-plugin', 'plugin.json')));
    const law = parseJson(readText(path.join(kitRoot, 'law.json')));
    const readme = readText(path.join(kitRoot, 'README.md'));
    const adoptQs = parseAdoptQuestions(readText(path.join(kitRoot, 'commands', 'adopt.md')));
    const transcripts = {};
    for (const [key, file] of Object.entries(TRANSCRIPTS)) transcripts[key] = parseTranscript(readText(path.join(src, `transcript-${file}.txt`)), file);
    return { plugin, law, readme, adoptQs, transcripts, install: parseInstall(readme) };
}

export const CONTRACT_GRADES = ['HOOK', 'GATE', 'BUILDABLE', 'HONOUR', 'ADVISE', 'OWNER'];

// The site's data file (CR-2026-10-20-SITE, the Site card's "Phase 2, step 1" contract). The
// clauses and the grade counts are the kit's own law.json, never a brain overlay: the page
// describes the public kit. transcript_meta is what the recordings' own headers say, never
// restamped; the four headers agree today, and a disagreement is an error rather than a guess.
export function kitData(kit, builtDate) {
    const t = kit.transcripts;
    const metas = Object.values(t);
    for (const k of ['recorded', 'kitVersion']) {
        const vals = new Set(metas.map((m) => m[k]));
        if (vals.size !== 1) throw new Error(`the transcript headers disagree on ${k}: ${[...vals].join(', ')}`);
    }
    const first = t.adopt;
    const clauses = [...kit.law.clauses].map((c) => ({ id: String(c.id), group: String(c.group), grade: String(c.grade).toUpperCase(), rule: String(c.rule) }));
    // The contract's six grades always appear, in its order, since a grade with no clause is a true
    // count of 0 and the page should not have to guess at a missing key; DENY, which the contract
    // does not list, appears first only when a clause carries it. Any other grade is an error.
    const grade_counts = {};
    if (clauses.some((c) => c.grade === 'DENY')) grade_counts.DENY = 0;
    for (const g of CONTRACT_GRADES) grade_counts[g] = 0;
    for (const c of clauses) {
        if (!(c.grade in grade_counts)) throw new Error(`unknown grade ${c.grade} on ${c.id}`);
        grade_counts[c.grade]++;
    }
    return {
        kit: String(kit.plugin.name),
        version: String(kit.plugin.version),
        built: builtDate,
        adopt_questions: kit.adoptQs.map((q) => ({ n: q.n, label: q.name, question: q.text, recommended: q.rec })),
        transcripts: Object.fromEntries(Object.keys(TRANSCRIPTS).map((k) => [k, t[k].lines])),
        transcript_meta: { recorded: first.recorded, kit_version: first.kitVersion, machine: first.machine },
        clauses,
        grade_counts,
        install: kit.install,
    };
}
