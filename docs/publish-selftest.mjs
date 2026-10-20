// publish-selftest.mjs - runs docs/publish.mjs against a throwaway site under the system temp
// folder and checks the kit.json it writes: every key of the contract (CR-2026-10-20-SITE), the
// clause and grade counts against law.json, the transcripts against their source files, and that
// no value is empty. Never touches the real site. Run by tools/tests/run.mjs; also on its own:
//   node docs/publish-selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseJson } from '../hooks/lib/json.mjs';
import { readText, TRANSCRIPTS, CONTRACT_GRADES } from './data.mjs';

const DOCS = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.dirname(DOCS);
let pass = 0; let fail = 0;
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const say = (s = '', code) => process.stdout.write((COLOR && code ? `\x1b[${code}m${s}\x1b[0m` : s) + '\n');
const check = (name, ok, why = '') => { if (ok) { say(`  PASS  ${name}`, 32); pass++; } else { say(`  FAIL  ${name}`, 31); if (why) say(`        ${why}`, 90); fail++; } };

const T = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'design-first-publish-')));
const site = path.join(T, 'site');
fs.mkdirSync(path.join(site, 'data'), { recursive: true });
fs.writeFileSync(path.join(site, 'data', 'registry.json'), '{ "projects": [] }\n', 'utf8');
say(); say(`  Publishing to ${site}`, 36); say();

// 1. a folder that is not the site is refused before anything is written
const notSite = path.join(T, 'not-site');
fs.mkdirSync(notSite);
let r = spawnSync(process.execPath, [path.join(DOCS, 'publish.mjs'), '-Site', notSite], { encoding: 'utf8', windowsHide: true });
check('a folder with no data/registry.json is refused (exit 1)', r.status === 1 && /not the site checkout/.test(r.stderr), r.stderr);
check('nothing is written to the refused folder', !fs.existsSync(path.join(notSite, 'method')));

// 2. the publish itself
r = spawnSync(process.execPath, [path.join(DOCS, 'publish.mjs'), '-Site', site], { encoding: 'utf8', windowsHide: true });
check('publish exits 0 on the temp site', r.status === 0, r.stderr + r.stdout);
check('publish says what it wrote', /^wrote method\/data\/kit\.json  \(design-first \S+, \d+ clauses: /m.test(r.stdout), r.stdout);
check('publish no longer copies the page (no tools/design-first/ in the site)', !fs.existsSync(path.join(site, 'tools', 'design-first')));
check('publish no longer edits the registry', fs.readFileSync(path.join(site, 'data', 'registry.json'), 'utf8') === '{ "projects": [] }\n');
const outPath = path.join(site, 'method', 'data', 'kit.json');
check('kit.json exists', fs.existsSync(outPath));
let data = null;
try { data = parseJson(fs.readFileSync(outPath, 'utf8')); } catch (e) { check('kit.json parses', false, e.message); }

if (data) {
    // 3. every key of the contract, in the contract's order, and no other
    const KEYS = ['kit', 'version', 'built', 'adopt_questions', 'transcripts', 'transcript_meta', 'clauses', 'grade_counts', 'install'];
    check('the top-level keys are the contract, in order', JSON.stringify(Object.keys(data)) === JSON.stringify(KEYS), Object.keys(data).join(', '));

    // 4. no value is empty, at any depth
    const empties = [];
    const walk = (v, at) => {
        if (v == null) { empties.push(at); return; }
        if (typeof v === 'string') { if (v.trim() === '') empties.push(at); return; }
        if (typeof v === 'number') return;
        if (Array.isArray(v)) { if (v.length === 0) empties.push(at); v.forEach((x, i) => walk(x, `${at}[${i}]`)); return; }
        if (typeof v === 'object') { const ks = Object.keys(v); if (ks.length === 0) empties.push(at); for (const k of ks) walk(v[k], `${at}.${k}`); }
    };
    for (const k of KEYS) walk(data[k], k);
    // A transcript may hold a blank line on purpose (the recording's own spacing); those are not empties.
    const realEmpties = empties.filter((p) => !/^transcripts\.\w+\[\d+\]$/.test(p));
    check('no value is empty', realEmpties.length === 0, realEmpties.slice(0, 10).join(', '));

    // 5. the facts against their sources
    const plugin = parseJson(readText(path.join(KIT, '.claude-plugin', 'plugin.json')));
    const law = parseJson(readText(path.join(KIT, 'law.json')));
    check('kit and version are plugin.json\'s', data.kit === plugin.name && data.version === plugin.version, `${data.kit} ${data.version}`);
    check('built is an ISO date', /^\d{4}-\d{2}-\d{2}$/.test(data.built), data.built);
    check(`clauses count equals law.json (${law.clauses.length})`, data.clauses.length === law.clauses.length, String(data.clauses.length));
    check('every clause has id, group, grade and rule, and only those', data.clauses.every((c) => JSON.stringify(Object.keys(c)) === '["id","group","grade","rule"]'));
    const lawIds = law.clauses.map((c) => c.id).join(',');
    check('the clause ids are law.json\'s, in its order', data.clauses.map((c) => c.id).join(',') === lawIds);
    const expectCounts = {};
    for (const c of law.clauses) { const g = String(c.grade).toUpperCase(); expectCounts[g] = (expectCounts[g] || 0) + 1; }
    const wrong = Object.keys({ ...expectCounts, ...data.grade_counts }).filter((g) => (expectCounts[g] || 0) !== data.grade_counts[g]);
    check('grade_counts equals a count over law.json by grade', wrong.length === 0, `differ: ${wrong.join(', ')} in ${JSON.stringify(data.grade_counts)}`);
    const order = Object.keys(data.grade_counts).filter((g) => g !== 'DENY');
    check('grade_counts lists the contract\'s six grades in its order', JSON.stringify(order) === JSON.stringify(CONTRACT_GRADES), order.join(', '));
    const sum = Object.values(data.grade_counts).reduce((a, b) => a + b, 0);
    check('grade_counts sums to the clause count', sum === data.clauses.length, String(sum));
    check('grade_counts carries ADVISE and OWNER', 'ADVISE' in data.grade_counts && 'OWNER' in data.grade_counts, Object.keys(data.grade_counts).join(', '));
    check('adopt_questions are numbered 1..n with label, question and recommended', data.adopt_questions.every((q, i) => q.n === i + 1 && JSON.stringify(Object.keys(q)) === '["n","label","question","recommended"]'), JSON.stringify(data.adopt_questions.map((q) => q.n)));
    check('the transcripts are the four recordings', JSON.stringify(Object.keys(data.transcripts)) === JSON.stringify(Object.keys(TRANSCRIPTS)), Object.keys(data.transcripts).join(', '));
    for (const [key, file] of Object.entries(TRANSCRIPTS)) {
        const src = readText(path.join(DOCS, 'src', `transcript-${file}.txt`)).split('\n');
        check(`transcripts.${key} is transcript-${file}.txt without its header line`, JSON.stringify(data.transcripts[key]) === JSON.stringify(src.slice(1)));
        check(`transcript_meta matches transcript-${file}.txt's header`, src[0].startsWith(`# recorded ${data.transcript_meta.recorded} - design-first ${data.transcript_meta.kit_version}`), src[0]);
    }
    check('transcript_meta has recorded, kit_version and machine', JSON.stringify(Object.keys(data.transcript_meta)) === '["recorded","kit_version","machine"]');
    const readme = readText(path.join(KIT, 'README.md'));
    check('every install command is in the README', data.install.every((l) => readme.includes(l)), data.install.join(' | '));
    check('install carries the plugin install command', data.install.some((l) => /^claude plugin install /.test(l)), data.install.join(' | '));
    // 6. a second run writes the same bytes (the built date aside, the file is deterministic)
    const first = fs.readFileSync(outPath, 'utf8');
    r = spawnSync(process.execPath, [path.join(DOCS, 'publish.mjs'), '-Site', site], { encoding: 'utf8', windowsHide: true });
    check('a second publish writes the same bytes', r.status === 0 && fs.readFileSync(outPath, 'utf8') === first);
}

fs.rmSync(T, { recursive: true, force: true });
say(); say(`  ${pass} passed, ${fail} failed, ${pass + fail} total`, fail ? 31 : 32);
process.exit(fail ? 1 : 0);
