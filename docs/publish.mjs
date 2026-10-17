// publish.mjs - copies the built page to the owner's one site and registers it there (DECISIONS 3.1).
//
//   node docs/publish.mjs [-Site <path to jordan-doerksen.github.io checkout>]
//
// Copies docs/index.html, page.css, page.js to <site>/tools/design-first/ and adds one entry to
// <site>/data/registry.json if the slug is absent (never edits an existing entry). It does not
// commit: the owner reads the diff and commits. Runs docs/build.mjs -Check first; a stale
// index.html stops the publish. With no -Site, the checkout is the one on the owner's Windows
// machine; on any other machine -Site is required.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../tools/lib/args.mjs';
import { parseJson } from '../hooks/lib/json.mjs';

const DOCS = path.dirname(fileURLToPath(import.meta.url));
function fail(msg) { process.stderr.write(`publish: ${msg}\n`); process.exit(1); }

let opts;
try { opts = parseArgs(process.argv.slice(2), { values: ['Site'] }); } catch (e) { fail(e.message); }
const site = opts.Site || (process.platform === 'win32' ? 'C:\\projects\\web\\jordan-doerksen.github.io' : null);
if (!site) fail('-Site <path to the site checkout> is required on this machine');

const check = spawnSync(process.execPath, [path.join(DOCS, 'build.mjs'), '-Check'], { stdio: 'inherit' });
if (check.status !== 0) fail('docs/index.html is stale; run node docs/build.mjs and commit it first');
const regPath = path.join(site, 'data', 'registry.json');
if (!fs.existsSync(regPath)) fail(`not the site checkout (no data/registry.json): ${site}`);

const dest = path.join(site, 'tools', 'design-first');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['index.html', 'page.css', 'page.js']) {
    fs.copyFileSync(path.join(DOCS, f), path.join(dest, f));
    process.stdout.write(`copied ${f} -> tools/design-first/${f}\n`);
}

const raw = fs.readFileSync(regPath, 'utf8');
const reg = parseJson(raw);
if ((reg.projects || []).some((p) => p.slug === 'design-first')) {
    process.stdout.write('registry: design-first already registered; not touched\n');
} else {
    const plugin = parseJson(fs.readFileSync(path.join(path.dirname(DOCS), '.claude-plugin', 'plugin.json'), 'utf8'));
    const entry = {
        slug: 'design-first', name: 'design-first', category: 'tools',
        blurb: 'A working method for building with coding agents, as a Claude Code plugin: interview before code, every rule graded by what enforces it, a Doctor that checks the disk.',
        tags: ['Tools', 'Claude Code', 'Node.js'], status: 'live', tier: 'full',
        url: '/tools/design-first/', repo: 'https://github.com/Jordan-Doerksen/design-first', featured: false,
        spec: `v${plugin.version} \u00b7 MIT \u00b7 WINDOWS, MACOS, LINUX`,
    };
    // The entry is inserted as text at the end of the "projects" array, in the file's own indent and
    // line endings. Workaround: a round trip through a JSON writer rewrote the whole file in its own
    // layout (one run produced a 2,045-line diff for a 12-line change), so the file is never round-tripped.
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    const um = /\n( +)"categories"/.exec(raw);
    const unit = um ? um[1] : '  ';
    const i2 = unit.repeat(2); const i3 = unit.repeat(3);
    const keys = Object.keys(entry);
    const lines = [`${i2}{`];
    keys.forEach((key, k) => {
        const v = entry[key];
        const val = typeof v === 'string' ? JSON.stringify(v) : typeof v === 'boolean' ? String(v) : '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
        lines.push(`${i3}"${key}": ${val}${k < keys.length - 1 ? ',' : ''}`);
    });
    lines.push(`${i2}}`);
    // The projects array closes with the last "]" before the final "}" of the document.
    const closeDoc = raw.lastIndexOf('}');
    const closeArr = raw.lastIndexOf(']', closeDoc);
    if (closeArr < 0) fail('registry.json: could not find the end of the projects array');
    const before = raw.slice(0, closeArr).trimEnd();
    const after = raw.slice(closeArr);
    fs.writeFileSync(regPath, before + ',' + nl + lines.join(nl) + nl + unit + after.trimStart(), 'utf8');
    process.stdout.write('registry: added design-first (tools, full) as a text insert; read the diff before committing\n');
}
process.stdout.write(`done. In the site checkout: git -C "${site}" status\n`);
