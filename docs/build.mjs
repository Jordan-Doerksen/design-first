// build.mjs - renders docs/index.html from docs/src/template.html and the kit's own files.
// Nothing on the page is typed (DECISIONS 3.3): counts, clauses, hooks, claim types, commands,
// the README's method list, grade table, limits and install block, the LOOPS.md overview chart
// and its steps, the adopt questions, and the recorded transcripts all come from the files named
// below. Deterministic: same inputs, same bytes (LF).
//
//   node docs/build.mjs          # writes docs/index.html and the README's generated blocks
//   node docs/build.mjs -Check   # exit 1 if either differs from a fresh render
//
// The Doctor's generated_matches claims run it as
//   build.mjs -Source <template> -Out <temp file> [-BrainRoot <ignored>]     (KIT-DOCS-01, the page)
//   build.mjs -Source README.md -Out <temp file>                            (KIT-README-01, the README)
// and compare the temp file with the file in the tree byte for byte after CRLF->LF. A source named
// README.md selects README mode (CR-2026-10-18-READ): the README is emitted with each block between
// its markers rendered (the inventory from ARCHITECTURE.md's Domains table and hooks/hooks.json; the
// adopt questions and files from commands/adopt.md and tools/lib/adopt-plan.mjs; the commands from
// commands/*.md, CR-2026-10-19-START), and everything outside the markers copied as written.
//
// Not a hook, not a timer. Run it after a change to any input, then commit the output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../tools/lib/args.mjs';
import { parseJson } from '../hooks/lib/json.mjs';
import { newPlan } from '../tools/lib/adopt-plan.mjs';
// The adopt questions, the transcripts, the README sections and the install block are parsed in
// docs/data.mjs, which docs/publish.mjs reads too (DISP-07: one parser, so the page and the site's
// kit.json never disagree about the same file).
import { readText, readmeSection, parseAdoptQuestions, parseTranscript } from './data.mjs';

const DOCS = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.dirname(DOCS);
const SRC = path.join(DOCS, 'src');

function fail(msg) { process.stderr.write(`docs/build: ${msg}\n`); process.exit(1); }

let opts;
try {
    // -BrainRoot is accepted for the Doctor's generator contract; the page has no brain input.
    opts = parseArgs(process.argv.slice(2), { values: ['Source', 'Out', 'BrainRoot'], switches: ['Check'] });
} catch (e) { fail(e.message); }

// HTML-encoded as .NET's WebUtility.HtmlEncode does, so the page's bytes are the ones the kit has
// always generated: the five markup characters, U+00A0 to U+00FF, and characters past U+FFFF, the
// last two as decimal references.
function esc(s) {
    let out = '';
    const t = String(s);
    for (let i = 0; i < t.length; i++) {
        const ch = t[i]; const code = t.charCodeAt(i);
        if (ch === '<') out += '&lt;';
        else if (ch === '>') out += '&gt;';
        else if (ch === '"') out += '&quot;';
        else if (ch === "'") out += '&#39;';
        else if (ch === '&') out += '&amp;';
        else if (code >= 160 && code < 256) out += `&#${code};`;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < t.length) {
            const cp = t.codePointAt(i);
            if (cp >= 0x10000) { out += `&#${cp};`; i++; } else out += ch;
        } else out += ch;
    }
    return out;
}
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const code = (s) => s.replace(/`([^`]+)`/g, '<code>$1</code>');
const byName = (a, b) => { const x = a.toLowerCase(); const y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };

// ------------------------------------------------------------------ inputs
const plugin = parseJson(readText(path.join(KIT, '.claude-plugin', 'plugin.json')));
const law = parseJson(readText(path.join(KIT, 'law.json')));
const hooks = parseJson(readText(path.join(KIT, 'hooks', 'hooks.json')));
const claims = parseJson(readText(path.join(KIT, 'tools', 'doctor', 'claims.json')));
const readme = readText(path.join(KIT, 'README.md'));
const arch = readText(path.join(KIT, 'ARCHITECTURE.md'));
const loops = readText(path.join(KIT, 'LOOPS.md'));
const adoptMd = readText(path.join(KIT, 'commands', 'adopt.md'));
const license = readText(path.join(KIT, 'LICENSE')).split('\n')[0];
// README mode: the source is the README itself; the page template is not an input.
const readmeMode = !!(opts.Source && /readme\.md$/i.test(opts.Source));
const template = readText(opts.Source && !readmeMode ? path.resolve(opts.Source) : path.join(SRC, 'template.html'));

const version = String(plugin.version);
const repoUrl = 'https://github.com/Jordan-Doerksen/design-first';

// ------------------------------------------------------------------ clauses and grades
const clauses = [...law.clauses].sort((a, b) => byName(String(a.group), String(b.group)) || byName(String(a.id), String(b.id)));
// The same grade set as the law build (tools/law/validate.mjs), strongest first. A DENY rule refuses,
// so it counts as stopped (CR-2026-10-15-GAPS D6).
const gradeOrder = ['DENY', 'HOOK', 'GATE', 'ADVISE', 'OWNER', 'BUILDABLE', 'HONOUR'];
const gradeOf = (c) => String(c.grade).toUpperCase();
const gradeCount = Object.fromEntries(gradeOrder.map((g) => [g, clauses.filter((c) => gradeOf(c) === g).length]));
for (const c of clauses) if (!(gradeOf(c) in gradeCount)) fail(`unknown grade ${c.grade} on ${c.id}`);
const total = clauses.length;
const stopped = gradeCount.DENY + gradeCount.HOOK + gradeCount.GATE;
const honour = gradeCount.HONOUR;

const groupRows = [];
for (const gid of Object.keys(law.groups)) {
    const inGroup = clauses.filter((c) => String(c.group).toLowerCase() === gid.toLowerCase());
    if (inGroup.length === 0) continue;
    const parts = gradeOrder.map((g) => { const n = inGroup.filter((c) => gradeOf(c) === g).length; return n ? `<span class="g g-${g.toLowerCase()}">${n} ${g}</span>` : null; }).filter((x) => x);
    groupRows.push(`<li><span class="ix-id">${esc(gid)}</span><span class="ix-name">${esc(law.groups[gid])}</span><span class="ix-n">${inGroup.length}</span><span class="ix-grades">${parts.join(' ')}</span></li>`);
}
const mechOf = (c) => (c.enforcedBy ? `${c.enforcedBy.kind}: ${c.enforcedBy.ref}` : '');
const clauseRows = clauses.map((c) => `<tr id="${attr(c.id)}"><th scope="row"><a href="#${attr(c.id)}">${esc(c.id)}</a></th><td><span class="g g-${String(c.grade).toLowerCase()}">${esc(c.grade)}</span></td><td>${esc(c.rule)}</td><td class="mech">${esc(mechOf(c) || 'nothing on the disk; the reader')}</td></tr>`);
const clauseJson = JSON.stringify(clauses.map((c) => ({ id: c.id, group: c.group, grade: c.grade, rule: c.rule, verb: c.verb, mech: mechOf(c) })));
const clauseOptions = clauses.map((c) => `<option value="${attr(c.id)}">${esc(c.id)} - ${esc(c.grade)}</option>`);

// ------------------------------------------------------------------ hooks
// One record per registered hook, read from hooks.json and each script's first comment line (less
// its own file name): what the hook is for. The page and the README inventory both render these.
const hookList = [];
for (const [event, entries] of Object.entries(hooks.hooks)) {
    for (const entry of entries) {
        for (const h of entry.hooks) {
            const m = /hooks\/([a-z-]+\.mjs)/i.exec(String(h.command ?? ''));
            if (!m) continue;
            const script = m[1];
            const first = (readText(path.join(KIT, 'hooks', script)).split('\n').find((l) => /^\/\//.test(l)) || '')
                .replace(/^\/\/\s*[a-z-]+\.mjs\s*-\s*/i, '').replace(/^\/\/\s*/, '');
            const matcher = entry.matcher ? String(entry.matcher) : 'every';
            hookList.push({ event, script, matcher, first });
        }
    }
}
const hookRows = hookList.map((h) => `<li><span class="ix-id">${esc(h.event)}</span><span class="ix-name"><code>${esc(h.script)}</code></span><span class="ix-n">${esc(h.matcher)}</span><span class="ix-grades">${esc(h.first)}</span></li>`);

// ------------------------------------------------------------------ the README inventory (CR-2026-10-18-READ)
// ARCHITECTURE.md's Domains table owns every folder's purpose (PRIN-05); the README renders its
// first two columns, then the hooks above. The block sits between two markers in README.md and
// nothing in it is typed.
const INV_START = '<!-- inventory:start -->';
const INV_END = '<!-- inventory:end -->';
function domainsTable(md) {
    const rows = [];
    let inside = false; let seenHeader = false;
    for (const l of md.split('\n')) {
        if (/^## /.test(l)) { if (inside) break; inside = /^## Domains\s*$/i.test(l); continue; }
        if (!inside || !/^\|/.test(l)) continue;
        if (!seenHeader) { seenHeader = true; continue; }       // the header row
        if (/^\|\s*-+/.test(l)) continue;                        // the rule row
        const cells = l.split('|').slice(1, -1).map((c) => c.trim());
        if (cells.length >= 2) rows.push({ domain: cells[0], purpose: cells[1] });
    }
    if (rows.length === 0) fail('ARCHITECTURE.md: Domains table not found');
    return rows;
}
const mdCell = (s) => String(s).replace(/\|/g, '\\|');
function inventoryBlock() {
    const lines = [INV_START, '<!-- rendered by docs/build.mjs from ARCHITECTURE.md (Domains) and hooks/hooks.json; do not edit by hand -->', '', '| path | holds |', '|---|---|'];
    for (const d of domainsTable(arch)) lines.push(`| ${mdCell(d.domain)} | ${mdCell(d.purpose)} |`);
    lines.push('', 'The hooks, as `hooks/hooks.json` registers them:', '', '| hook | event | on | what it does |', '|---|---|---|---|');
    // One row per script and event; a script registered under several matchers lists them together.
    const merged = [];
    for (const h of hookList) {
        const row = merged.find((m) => m.script === h.script && m.event === h.event);
        if (row) row.matchers.push(h.matcher); else merged.push({ script: h.script, event: h.event, matchers: [h.matcher], first: h.first });
    }
    for (const h of merged) lines.push(`| \`${h.script}\` | ${h.event} | ${mdCell(h.matchers.map((m) => m.split('|').join(', ')).join(', '))} | ${mdCell(h.first)} |`);
    lines.push('', INV_END);
    return lines.join('\n');
}

// ------------------------------------------------------------------ the README's adopt and commands blocks (CR-2026-10-19-START)
// What adopt asks, read from the command that asks it, and what it writes, read from the plan the
// script writes from, with the answers left as <root> and <brain>. A file only a git-repo brain
// gets is marked. The paths are joined with / on every system, so the bytes do not depend on it.
const ADOPT_START = '<!-- adopt:start -->';
const ADOPT_END = '<!-- adopt:end -->';
const CMD_START = '<!-- commands:start -->';
const CMD_END = '<!-- commands:end -->';
function adoptFiles() {
    const args = { kit: KIT, root: '<root>', brain: '<brain>', ownerName: 'owner', gitHubOwners: [], frozenPaths: [],
        settingsTarget: path.join('<root>', '.claude', 'settings.json'), snapshotPairs: [], today: '2000-01-01' };
    let plain; let repo;
    try { plain = newPlan({ ...args, brainIsRepo: false }); repo = newPlan({ ...args, brainIsRepo: true }); } catch (e) { fail(`adopt plan: ${e.message}`); }
    const inPlain = new Set(plain.map((p) => p.path));
    return repo.map((p) => ({ path: p.path.replace(/\\/g, '/'), note: p.note, gitOnly: !inPlain.has(p.path) }));
}
function adoptBlock() {
    const lines = [ADOPT_START, '<!-- rendered by docs/build.mjs from commands/adopt.md and tools/lib/adopt-plan.mjs; do not edit by hand -->', '',
        '| # | it asks | recommended answer |', '|---|---|---|'];
    for (const q of adoptQs) lines.push(`| ${q.n} | **${mdCell(q.name)}**${q.when ? ` (asked ${mdCell(q.when)})` : ''}: ${mdCell(q.text)} | ${mdCell(q.rec)} |`);
    lines.push('', 'The files it writes, from the plan `tools/adopt.mjs` writes from:', '', '| file | why |', '|---|---|');
    for (const f of adoptFiles()) lines.push(`| \`${mdCell(f.path)}\` | ${mdCell(f.note)}${f.gitOnly ? '; only when the brain is a git repo' : ''} |`);
    lines.push('', ADOPT_END);
    return lines.join('\n');
}
function commandsBlock() {
    const lines = [CMD_START, '<!-- rendered by docs/build.mjs from commands/*.md; do not edit by hand -->', '', '| command | what it does |', '|---|---|'];
    for (const c of commandList) lines.push(`| \`/design-first:${c.name}\` | ${mdCell(c.desc)} |`);
    lines.push('', CMD_END);
    return lines.join('\n');
}
const readmeBlocks = [
    { name: 'inventory', start: INV_START, end: INV_END, render: inventoryBlock },
    { name: 'adopt', start: ADOPT_START, end: ADOPT_END, render: adoptBlock },
    { name: 'commands', start: CMD_START, end: CMD_END, render: commandsBlock },
];
function renderReadme(md) {
    let out = md;
    for (const b of readmeBlocks) {
        const a = out.indexOf(b.start); const e = out.indexOf(b.end);
        if (a < 0 || e < 0 || e < a) fail(`README.md: ${b.name} markers not found (${b.start} ... ${b.end})`);
        out = out.slice(0, a) + b.render() + out.slice(e + b.end.length);
    }
    out = out.replace(/\r\n/g, '\n');
    if (!out.endsWith('\n')) out += '\n';
    return out;
}

// ------------------------------------------------------------------ Doctor claim types
const typeCount = new Map();
for (const cl of claims.claims) { const t = String(cl.type); typeCount.set(t, (typeCount.get(t) || 0) + 1); }
const claimRows = [...typeCount.keys()].sort(byName).map((t) => `<li><span class="ix-id"><code>${esc(t)}</code></span><span class="ix-n">${typeCount.get(t)} in the kit's own claims</span></li>`);

// ------------------------------------------------------------------ commands and the agent
const description = (text) => (text.split('\n').find((l) => /^description:\s*/i.test(l)) || '').replace(/^description:\s*/i, '');
const commandList = fs.readdirSync(path.join(KIT, 'commands')).filter((f) => /\.md$/i.test(f)).sort(byName)
    .map((f) => ({ name: f.replace(/\.md$/i, ''), desc: description(readText(path.join(KIT, 'commands', f))) }));
const cmdRows = commandList.map((c) => `<li><span class="ix-id"><code>/design-first:${esc(c.name)}</code></span><span class="ix-grades">${esc(c.desc)}</span></li>`);
const agentDesc = description(readText(path.join(KIT, 'agents', 'reviewer.md')));

// ------------------------------------------------------------------ README sections
const section = (md, heading) => { try { return readmeSection(md, heading); } catch (e) { fail(e.message); } };
function mdTable(block) {
    const rows = block.split('\n').filter((l) => /^\|/.test(l)).map((r) => r.replace(/^\|+|\|+$/g, '').split('|').map((c) => c.trim()))
        .filter((cells) => !/^-+$/.test(cells[0]));
    const head = rows[0]; const body = rows.slice(1);
    const h = '<tr>' + head.map((c) => `<th scope="col">${esc(c)}</th>`).join('') + '</tr>';
    const b = body.map((row) => '<tr>' + row.map((c) => `<td>${code(esc(c))}</td>`).join('') + '</tr>');
    return `<table><thead>${h}</thead><tbody>${b.join('')}</tbody></table>`;
}
function mdList(block) {
    const acc = [];
    for (const l of block.split('\n')) {
        if (/^- /.test(l)) acc.push(l.slice(2));
        else if (/^\s+\S/.test(l) && acc.length) acc[acc.length - 1] += ' ' + l.trim();
    }
    return '<ul>' + acc.map((x) => `<li>${code(esc(x))}</li>`).join('') + '</ul>';
}
function mdCode(block) {
    const m = /```[a-z]*\n([\s\S]*?)```/i.exec(block);
    if (!m) fail('no code block');
    return `<pre><code>${esc(m[1].trimEnd())}</code></pre>`;
}
// bold and code only; the README's method list and the LOOPS.md overview use nothing else
const mdInline = (s) => code(esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'));
function mdNumbered(block) {
    // "1. text" starts an item; an indented line continues the one before it
    const acc = [];
    for (const l of block.split('\n')) {
        const m = /^\d+\.\s+(.*)$/.exec(l);
        if (m) acc.push(m[1]);
        else if (/^\s+\S/.test(l) && acc.length) acc[acc.length - 1] += ' ' + l.trim();
    }
    if (acc.length === 0) fail('no numbered list');
    return acc.map((x) => `<li>${mdInline(x)}</li>`).join('\n');
}
// A clause id in running text links to its row in the clause table, when law.json has the id.
const clauseIds = new Set(clauses.map((c) => String(c.id)));
const linkIds = (html) => html.replace(/\b([A-Z]+-\d{2})\b/g, (m) => (clauseIds.has(m) ? `<a href="#${m}">${m}</a>` : m));
const method = linkIds(mdNumbered(section(readme, 'The method, on one page')));
// The template's own drawings and prose may cite clause ids; one that has left the law fails the build.
const typedIds = [...new Set([...template.matchAll(/\b(SAFE|PRIN|OWN|DES|GATE|AUTO|VCS|OBS|WEB|GAME|DISP|SKIN|VOICE|MAP)-\d{2}\b/g)].map((m) => m[0]))];
const unknownIds = typedIds.filter((x) => !clauseIds.has(x));
if (unknownIds.length) fail(`template cites a clause id that is not in law.json: ${unknownIds.join(', ')}`);

// LOOPS.md, "The overview": one sentence, one ```text chart, one numbered list (its lint is
// tools/tests/cases-loops.mjs). The chart is shown as drawn; clause ids in both link to the table.
const ov = /^([\s\S]*?)\n```text\n([\s\S]*?)```\n([\s\S]*)$/i.exec(section(loops, 'The overview'));
if (!ov) fail('LOOPS.md overview: expected a sentence, a ```text chart and a list');
const loopsIntro = mdInline(ov[1].trim());
const loopsChart = linkIds(esc(ov[2].trimEnd()));
const loopsSteps = linkIds(mdNumbered(ov[3]));

const gradeTable = mdTable(section(readme, 'What a grade means'));
const limits = mdList(section(readme, 'Limits, stated up front'));
const install = mdCode(section(readme, 'Install and adopt'));

// ARCHITECTURE core flow block
const cf = /## Core flow\s*```\n([\s\S]*?)```/i.exec(arch);
if (!cf) fail('ARCHITECTURE core flow block not found');
const coreFlow = esc(cf[1].trimEnd());

// adopt.md questions, parsed in docs/data.mjs (n, name, text, rec, when).
let adoptQs;
try { adoptQs = parseAdoptQuestions(adoptMd); } catch (e) { fail(e.message); }
const questions = adoptQs.map((q) => `<li><b>${esc(q.name)}</b> ${code(esc(q.text))}</li>`);
const readmeOut = renderReadme(readme);

// ------------------------------------------------------------------ transcripts
let recorded = ''; let recordedKit = '';
function transcript(name) {
    let t;
    try { t = parseTranscript(readText(path.join(SRC, `transcript-${name}.txt`)), name); } catch (e) { fail(e.message); }
    recorded = t.recorded; recordedKit = t.kitVersion;
    // The line classes match without case, as they always have (so 'RED' also marks 'registered').
    const out = t.lines.map((l) => {
        if (l.trim() === '') return '<span class="ln"> </span>';
        let cls = 'ln';
        if (/^\s*(wrote|git|law)\s|\[ ok \]/i.test(l)) cls += ' ok';
        if (/FAIL\s|\[WARN\]|RED/i.test(l)) cls += ' bad';
        if (/VERDICT: GREEN|every claim holds|nothing needs action/i.test(l)) cls += ' good';
        if (/^\S/.test(l) && /^[a-z]+$/i.test(l)) cls += ' hd';
        return `<span class="${cls}">${esc(l)}</span>`;
    });
    return [t.header, out.join('\n')];
}
const tAdopt = transcript('adopt');
const tDoctor = transcript('doctor');
const tKit = transcript('doctor-kit');
const tGuard = transcript('guard');

// ------------------------------------------------------------------ render
const fill = {
    VERSION: esc(version), RECORDED: esc(recorded), RECORDED_KIT: esc(recordedKit), REPO: repoUrl,
    TOTAL: total, STOPPED: stopped, HONOUR: honour, HOOKS_N: gradeCount.HOOK, GATES_N: gradeCount.GATE,
    GRADE_COUNTS: gradeOrder.map((g) => `<li><span class="g g-${g.toLowerCase()}">${g}</span><b>${gradeCount[g]}</b></li>`).join(''),
    GRADE_TABLE: gradeTable, GROUP_ROWS: groupRows.join('\n'), CLAUSE_ROWS: clauseRows.join('\n'),
    CLAUSE_OPTIONS: clauseOptions.join('\n'), CLAUSE_JSON: clauseJson, HOOK_ROWS: hookRows.join('\n'),
    CLAIM_ROWS: claimRows.join('\n'), CMD_ROWS: cmdRows.join('\n'), AGENT_DESC: esc(agentDesc),
    QUESTIONS: questions.join('\n'), CORE_FLOW: coreFlow, METHOD: method, LOOPS_INTRO: loopsIntro,
    LOOPS_CHART: loopsChart, LOOPS_STEPS: loopsSteps, LIMITS: limits, INSTALL: install, LICENSE: esc(license),
    T_ADOPT: tAdopt[1], T_ADOPT_H: esc(tAdopt[0]), T_DOCTOR: tDoctor[1], T_DOCTOR_H: esc(tDoctor[0]),
    T_KIT: tKit[1], T_KIT_H: esc(tKit[0]), T_GUARD: tGuard[1], T_GUARD_H: esc(tGuard[0]),
};
let html = template;
for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(String(v));
const left = /\{\{[A-Z_]+\}\}/.exec(html);
if (left) fail(`unfilled placeholder: ${left[0]}`);
html = html.replace(/\r\n/g, '\n');
if (!html.endsWith('\n')) html += '\n';

const readmePath = path.join(KIT, 'README.md');
if (readmeMode) {
    // The Doctor's README claim: render to -Out, nothing else is written.
    const outPath = opts.Out ? path.resolve(opts.Out) : readmePath;
    fs.writeFileSync(outPath, readmeOut, 'utf8');
    process.stdout.write(`wrote ${outPath}  (README blocks: ${domainsTable(arch).length} domains, ${hookList.length} hooks, ${adoptQs.length} adopt questions, ${commandList.length} commands)\n`);
    process.exit(0);
}
const outPath = opts.Out ? path.resolve(opts.Out) : path.join(DOCS, 'index.html');
if (opts.Check) {
    const cur = fs.existsSync(outPath) ? readText(outPath) : '';
    let stale = false;
    if (cur !== html) { process.stdout.write('docs/index.html is stale: run node docs/build.mjs\n'); stale = true; }
    else process.stdout.write('docs/index.html matches a fresh render\n');
    if (readme !== readmeOut) { process.stdout.write('README.md generated blocks are stale: run node docs/build.mjs\n'); stale = true; }
    else process.stdout.write('README.md generated blocks match a fresh render\n');
    process.exit(stale ? 1 : 0);
}
fs.writeFileSync(outPath, html, 'utf8');
process.stdout.write(`wrote ${outPath}  (${total} clauses, ${stopped} stopped by a machine, ${honour} on honour; transcripts recorded ${recorded})\n`);
// With no -Out the README's generated blocks are refreshed in place (a -Out run is a render of the
// page alone, as the Doctor's page claim calls it).
if (!opts.Out && readme !== readmeOut) {
    fs.writeFileSync(readmePath, readmeOut, 'utf8');
    process.stdout.write(`wrote ${readmePath}  (generated blocks: ${domainsTable(arch).length} domains, ${hookList.length} hooks, ${adoptQs.length} adopt questions, ${commandList.length} commands)\n`);
}
