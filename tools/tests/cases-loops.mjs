// cases-loops.mjs - the lint check for LOOPS.md, the kit's loops-and-gates charts (CR-2026-10-15-CHART).
// Imported by run.mjs. Never run directly. The charts are drawn by hand; this check catches the drift
// a machine can see: a clause id that no longer exists, a chart line too wide to show without
// sideways scrolling, a character that renders badly in a terminal or a screen reader, and a chart
// with no words after it.

import fs from 'node:fs';
import path from 'node:path';

export default function loopsCases(t) {
    const { T, kit, record, section, readText, put } = t;

    section('-- LOOPS.md: the loops-and-gates charts');
    const loopsPath = path.join(kit, 'LOOPS.md');
    const maxCols = 64;   // the narrowest GitHub code block that shows a chart without scrolling, measured 2026-10-15
    if (!fs.existsSync(loopsPath)) { record('loops: LOOPS.md exists', 'present', 'absent', loopsPath); return; }
    const lines = readText(loopsPath).replace(/^\uFEFF/, '').split(/\r?\n/);
    const lawIds = new Set(JSON.parse(readText(path.join(kit, 'law.json'))).clauses.map((c) => String(c.id)));
    // The group prefixes a chart may cite, enumerated: a prefix this pattern does not name is never
    // read, so a citation of a group it lacks passes the lint unseen. A new group in law.json is
    // added here with its first chart.
    const CITE_RX = /\b(SAFE|PRIN|OWN|DES|GATE|AUTO|VCS|OBS|WEB|GAME|DISP|SKIN|VOICE|MAP|STACK|CTRL|KIT)-\d{2}\b/g;
    const citations = (text) => {
        const cited = [...new Set([...text.matchAll(CITE_RX)].map((m) => m[0]))];
        const unknown = cited.filter((c) => !lawIds.has(c));
        return { cited, unknown, verdict: cited.length > 0 && unknown.length === 0 ? 'known' : cited.length === 0 ? 'none-cited' : 'unknown: ' + unknown.join(', ') };
    };
    record('loops: every clause id cited is in law.json', 'known', citations(lines.join('\n')).verdict);

    // Walk the fenced chart blocks (```text ... ```): width, characters, and words after each one.
    const wide = []; const bad = []; const noList = []; let charts = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!/^```text\s*$/.test(lines[i])) continue;
        charts++; const start = i + 1; let j = start;
        while (j < lines.length && !/^```\s*$/.test(lines[j])) {
            const l = lines[j];
            if (l.length > maxCols) wide.push(`line ${j + 1}: ${l.length} columns`);
            if (/\t/.test(l) || /[^\x20-\x7E]/.test(l)) bad.push(`line ${j + 1}`);
            j++;
        }
        // The words after the chart: a numbered list must start within a few lines of the fence.
        let found = false;
        for (let k = j + 1; k < lines.length && k <= j + 4; k++) if (/^\s*1\.\s/.test(lines[k])) { found = true; break; }
        if (!found) noList.push(`chart at line ${start}`);
        i = j;
    }
    record('loops: LOOPS.md holds charts', 'charts', charts > 0 ? 'charts' : 'none');
    record(`loops: no chart line is wider than ${maxCols} columns`, 'fits', wide.length === 0 ? 'fits' : 'wide: ' + wide.join('; '));
    record('loops: charts hold plain ASCII and no tab', 'ascii', bad.length === 0 ? 'ascii' : 'bad: ' + bad.join(', '));
    record('loops: every chart is followed by a numbered list', 'listed', noList.length === 0 ? 'listed' : 'missing: ' + noList.join('; '));

    // KIT (0.3.0): a kit clause cited in a chart is checked like any other. A planted LOOPS.md cites
    // KIT-01 and KIT-03, which law.json has, and KIT-99, which nothing has: the lint reports the one
    // and passes the others. With the prefix not named above, every KIT citation passed unseen.
    const planted = path.join(T, 'loops-kit', 'LOOPS.md');
    put(planted, '# Loops\n\n```text\nregistry -> render -> repo -> hook   (KIT-03, KIT-99)\n```\n\n1. KIT-01 holds the vendored tree to the bytes its VERSION names.\n');
    const p = citations(readText(planted));
    record('loops: a KIT-99 citation in a planted LOOPS.md is reported unknown', 'unknown: KIT-99', p.verdict, 'cited: ' + (p.cited.join(', ') || 'nothing'));
    record('loops: KIT-01 and KIT-03 cited in the planted LOOPS.md are known to law.json', 'known', ['KIT-01', 'KIT-03'].every((id) => p.cited.includes(id) && !p.unknown.includes(id)) ? 'known' : p.cited.length === 0 ? 'not-cited' : 'unknown: ' + (p.unknown.join(', ') || 'none'), 'cited: ' + (p.cited.join(', ') || 'nothing'));
}
