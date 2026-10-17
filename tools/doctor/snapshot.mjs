// snapshot.mjs - write the before-state a snapshot_diff claim compares against (CR-2026-10-14-REVIEW).
//
//   node tools/doctor/snapshot.mjs -Root <folder> -Out <file.json> [-Exclude a,b/c]
//
// Walks Root (skipping .git and every Exclude path, the same rule the claim applies), and writes
// { schema: 1, root, taken, files: [{ path, size, sha256 }] } to Out: UTF-8 without BOM, LF, paths
// sorted, forward slashes, lower case. Prints one line saying what it wrote. The file is a generated
// fact about the disk (VCS-15); nothing in it is typed.
//
// Exit 0 = written. Exit 1 = Root is not a folder, or Out could not be written. Nothing else is touched.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { toFullPath } from '../../hooks/lib/common.mjs';
import { relKey } from './claims-tree.mjs';
import { snapshotFiles } from './claims-snapshot.mjs';

let opts;
try { opts = parseArgs(process.argv.slice(2), { values: ['Root', 'Out'], lists: ['Exclude'] }); }
catch (e) { process.stdout.write(`snapshot: ${e.message}\n`); process.exit(1); }
if (!opts.Root || !opts.Out) { process.stdout.write('snapshot: -Root <folder> and -Out <file.json> are required\n'); process.exit(1); }
let isDir = false;
try { isDir = fs.statSync(opts.Root).isDirectory(); } catch { isDir = false; }
if (!isDir) { process.stdout.write(`snapshot: root is not a folder: ${opts.Root}\n`); process.exit(1); }
const rootFull = toFullPath(path.resolve(opts.Root));
const ex = opts.Exclude.filter((x) => x.trim()).map(relKey);
const files = snapshotFiles(rootFull, ex);
const doc = { schema: 1, root: rootFull, taken: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), exclude: ex, files };
let outFull;
try {
    outFull = path.resolve(opts.Out);
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    fs.writeFileSync(outFull, JSON.stringify(doc, null, 2) + '\n', 'utf8');
} catch (e) {
    process.stdout.write(`snapshot: could not write ${opts.Out} (${e.message})\n`);
    process.exit(1);
}
process.stdout.write(`snapshot: ${files.length} file(s) under ${rootFull} written to ${outFull}\n`);
