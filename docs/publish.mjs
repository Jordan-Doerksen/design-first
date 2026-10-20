// publish.mjs - writes the kit's facts to the owner's one site as one data file (DECISIONS 3.1,
// CR-2026-10-20-SITE).
//
//   node docs/publish.mjs [-Site <path to jordan-doerksen.github.io checkout>]
//
// Writes <site>/method/data/kit.json: the facts and recordings the site's method page reads
// (the adopt questions, the four transcripts and their header, the clauses and grade counts from
// the kit's own law.json, the install commands, the version). Every value is read from the kit's
// files by docs/data.mjs, the parser docs/build.mjs renders the page from (PRIN-03, DISP-07).
// It does not commit: the owner reads the diff and commits. Runs docs/build.mjs -Check first; a
// stale index.html stops the publish. With no -Site, the checkout is the one on the owner's
// Windows machine; on any other machine -Site is required.
//
// Until 0.2.6 it copied docs/index.html, page.css and page.js to <site>/tools/design-first/ and
// added a registry entry. It no longer does either, and it deletes nothing there: the site turns
// that folder into a redirect stub itself.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../tools/lib/args.mjs';
import { readKit, kitData } from './data.mjs';

const DOCS = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.dirname(DOCS);
function fail(msg) { process.stderr.write(`publish: ${msg}\n`); process.exit(1); }

let opts;
try { opts = parseArgs(process.argv.slice(2), { values: ['Site'] }); } catch (e) { fail(e.message); }
const site = opts.Site || (process.platform === 'win32' ? 'C:\\projects\\web\\jordan-doerksen.github.io' : null);
if (!site) fail('-Site <path to the site checkout> is required on this machine');

const check = spawnSync(process.execPath, [path.join(DOCS, 'build.mjs'), '-Check'], { stdio: 'inherit' });
if (check.status !== 0) fail('docs/index.html is stale; run node docs/build.mjs and commit it first');
if (!fs.existsSync(path.join(site, 'data', 'registry.json'))) fail(`not the site checkout (no data/registry.json): ${site}`);

let data;
try { data = kitData(readKit(KIT), new Date().toISOString().slice(0, 10)); } catch (e) { fail(e.message); }
const dest = path.join(site, 'method', 'data', 'kit.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n', 'utf8');
const counts = Object.entries(data.grade_counts).map(([g, n]) => `${g} ${n}`).join(', ');
process.stdout.write(`wrote method/data/kit.json  (${data.kit} ${data.version}, ${data.clauses.length} clauses: ${counts}; ${data.adopt_questions.length} adopt questions; transcripts recorded ${data.transcript_meta.recorded} at ${data.transcript_meta.kit_version})\n`);
process.stdout.write(`done. In the site checkout: git -C "${site}" status\n`);
