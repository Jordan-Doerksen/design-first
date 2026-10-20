// cases-loops.mjs - the lint check for LOOPS.md, the kit's loops-and-gates charts (CR-2026-10-15-CHART).
// Imported by run.mjs. Never run directly. The charts are drawn by hand; this check catches the drift
// a machine can see: a clause id that no longer exists, a chart line too wide to show without
// sideways scrolling, a character that renders badly in a terminal or a screen reader, and a chart
// with no words after it.

import fs from 'node:fs';
import path from 'node:path';

export default function loopsCases(t) {
    const { kit, record, section, readText } = t;

    section('-- LOOPS.md: the loops-and-gates charts');
    const loopsPath = path.join(kit, 'LOOPS.md');
    const maxCols = 64;   // the narrowest GitHub code block that shows a chart without scrolling, measured 2026-10-15
    if (!fs.existsSync(loopsPath)) { record('loops: LOOPS.md exists', 'present', 'absent', loopsPath); return; }
    const lines = readText(loopsPath).replace(/^\uFEFF/, '').split(/\r?\n/);
    const lawIds = new Set(JSON.parse(readText(path.join(kit, 'law.json'))).clauses.map((c) => String(c.id)));
    const cited = [...new Set([...lines.join('\n').matchAll(/\b(SAFE|PRIN|OWN|DES|GATE|AUTO|VCS|OBS|WEB|GAME|DISP|SKIN|VOICE|MAP|STACK)-\d{2}\b/g)].map((m) => m[0]))];
    const unknown = cited.filter((c) => !lawIds.has(c));
    record('loops: every clause id cited is in law.json', 'known', cited.length > 0 && unknown.length === 0 ? 'known' : cited.length === 0 ? 'none-cited' : 'unknown: ' + unknown.join(', '));

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
}
