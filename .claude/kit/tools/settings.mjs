// settings.mjs - renders every hook registration from hooks/registry.json: hooks/hooks.json in the plugin form, a repository's .claude/settings.json in the vendored form, with one permissions set per host.
//
//   node tools/settings.mjs [-Plugin | -Vendored] [-Host pc|cloud] [-Set pc|cloud-brain|cloud-writer|cloud-checker]
//                           [-Source <registry>] [-Out <path>] [-Check] [-BrainRoot <x>]
//
// The registry is the one place a registration is typed, and this tool is the only writer of the
// files that carry one (0.3.0, KIT-03). The rules, in the order they run:
//   1. form      - -Plugin, the default, runs each script as node "${CLAUDE_PLUGIN_ROOT}/<script>";
//                  -Vendored as node "${CLAUDE_PROJECT_DIR}/.claude/kit/<script>". Never both.
//   2. rows      - every row carries id, event, script, timeout and host; the event is one Claude
//                  Code fires; each host word is any, pc or cloud; the script exists under the kit
//                  root; no two rows share an id. A row that fails is refused by its id.
//   3. host      - -Host pc keeps the rows whose host names pc or any, -Host cloud likewise, no
//                  -Host keeps every row. Row order is render order, grouped under hooks.<event>;
//                  a row with no matcher renders an entry with no matcher key.
//   4. set       - -Set adds the permissions block of templates/root-settings.json (pc) or
//                  templates/settings.<set>.json (the cloud sets). A cloud set whose template
//                  carries an ask key is refused: an ask with no human is a hang.
//   5. merge     - when -Out names an existing JSON file, the rendered hooks object replaces its
//                  hooks key (the kit owns registrations); permissions.allow, .deny and .ask become
//                  the union of the file's rows and the set's rows, file rows first, no duplicate;
//                  every other key of the file is kept as it is. A new file is permissions, then
//                  hooks.
//   6. vendored  - a -Vendored result whose text names CLAUDE_PLUGIN_ROOT anywhere is refused: the
//                  variable is unset in a cloud container, where the command would read
//                  node "/hooks/guard.mjs" and no hook would load.
//   7. output    - 2-space JSON with a trailing LF, written to -Out or printed to stdout without
//                  it. -Check writes nothing: it compares the result with -Out's file byte for byte
//                  after CRLF->LF, prints the first differing lines, and exits 1 on a difference,
//                  2 when the target is missing.
// Exit 0 rendered or equal, 1 refused or different (a wrong registry row, an ask key in a cloud set,
// a vendored render naming CLAUDE_PLUGIN_ROOT, a target that is not JSON, a -Check difference, a
// usage fault), 2 could not look (a registry or a set template that is missing or is not JSON, a
// DF_KIT_ROOT that is not a folder, -Check whose target file is missing, an internal error). A
// refusal or a could-not-look is one line on stderr that starts with 'settings:' (an internal error
// adds its stack after 'settings: ERROR'). -BrainRoot is accepted and
// ignored: the Doctor's generated_matches runner passes it to every generator
// (tools/doctor/claims-exec.mjs), and tools/lib/args.mjs throws on an option it does not know, so
// KIT-REG-01 runs this tool as settings.mjs -Source <registry> -BrainRoot <brain> -Out <tmp> with
// no form flag.
//
// What this tool cannot see: a registration typed into a settings file it never renders (a
// user-level settings.json, a settings.local.json nobody names as -Out); whether the host that
// reads the file honours the hook; whether a script travels into .claude/kit/ (the vendor flag is
// a statement, read against tools/vendor.json in the registry case, not here).
// Test seam: DF_KIT_ROOT names another kit root (its hooks/registry.json, hooks/ and templates/).
//
// anchor: settings-registry  mode: gate  verbs: render-settings

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { parseJson } from '../hooks/lib/json.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'PreCompact'];
const HOSTS = ['any', 'pc', 'cloud'];
const MODES = ['deny', 'advise', 'gate'];
const SETS = { pc: 'root-settings.json', 'cloud-brain': 'settings.cloud-brain.json', 'cloud-writer': 'settings.cloud-writer.json', 'cloud-checker': 'settings.cloud-checker.json' };
const PREFIX = { plugin: '${CLAUDE_PLUGIN_ROOT}', vendored: '${CLAUDE_PROJECT_DIR}/.claude/kit' };
const ROW_LISTS = ['allow', 'deny', 'ask'];
const DIFF_LINES = 8;

const say = (s = '') => process.stdout.write(s + '\n');
class Refusal extends Error { constructor(msg, exit) { super(msg); this.exit = exit; } }
const refuse = (msg, exit = 1) => { throw new Refusal(msg, exit); };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isObject = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const toText = (obj) => JSON.stringify(obj, null, 2) + '\n';
const lf = (s) => String(s).replace(/\r\n/g, '\n');
const slash = (p) => String(p).replace(/\\/g, '/');

function kitRoot() {
    const seam = process.env.DF_KIT_ROOT;
    if (seam) {
        if (!isDir(seam)) refuse(`DF_KIT_ROOT is not a folder: ${seam}`, 2);   // could not look: no kit to read
        return path.resolve(seam);
    }
    return path.resolve(HERE, '..');
}

// A file the render reads. Missing, unreadable or not JSON is exit 2 by default: an input the tool could
// not look at is never a refusal of its content (review finding 11). The target passes 1: a file -Out
// names that is not JSON is refused, never merged into or overwritten.
function readJsonFile(p, what, exit = 2) {
    if (!isFile(p)) refuse(`${what} missing: ${p}`, exit);
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { refuse(`${what} could not be read: ${p} (${e.message})`, exit); }
    try { return parseJson(text); } catch (e) { refuse(`${what} could not be parsed: ${p} (${e.message})`, exit); }
    return null;
}

// ---------------------------------------------------------------- rule 2: the rows
function readRegistry(p, kit) {
    const doc = readJsonFile(p, 'registry');
    if (!isObject(doc) || !Array.isArray(doc.hooks)) refuse(`registry has no hooks array: ${p}`);
    const seen = new Set();
    return doc.hooks.map((row, i) => {
        const where = isObject(row) && typeof row.id === 'string' && row.id.trim() ? row.id : `#${i + 1}`;
        if (!isObject(row)) refuse(`row ${where} is not an object`);
        for (const k of ['id', 'event', 'script', 'timeout', 'host']) if (row[k] == null || row[k] === '') refuse(`row ${where} is missing ${k}`);
        const id = String(row.id);
        if (seen.has(id)) refuse(`duplicate row id ${id}`);
        seen.add(id);
        if (!EVENTS.includes(String(row.event))) refuse(`row ${id} has an unknown event ${row.event} (one of ${EVENTS.join(', ')})`);
        if (typeof row.timeout !== 'number' || !Number.isFinite(row.timeout) || row.timeout <= 0) refuse(`row ${id} timeout must be a number of seconds above 0`);
        if (!Array.isArray(row.host) || row.host.length === 0 || !row.host.every((h) => HOSTS.includes(h))) refuse(`row ${id} host must be an array of ${HOSTS.join(', ')}`);
        if (row.mode != null && !MODES.includes(row.mode)) refuse(`row ${id} mode must be ${MODES.join(', ')}`);
        if (row.vendor != null && typeof row.vendor !== 'boolean') refuse(`row ${id} vendor must be true or false`);
        const script = slash(row.script).replace(/^\/+/, '');
        if (/^[A-Za-z]:/.test(script) || script.split('/').includes('..')) refuse(`row ${id} script must be a path under the kit root: ${row.script}`);
        if (!isFile(path.join(kit, script))) refuse(`row ${id} script missing under ${kit}: ${script}`);
        const matcher = row.matcher == null ? '' : String(row.matcher);
        return { id, event: String(row.event), matcher, script, timeout: row.timeout, host: row.host.slice() };
    });
}

// ---------------------------------------------------------------- rules 1 and 3: the hooks object
function renderHooks(rows, form, host) {
    const prefix = PREFIX[form];
    const out = {};
    for (const row of rows) {
        if (host && !row.host.includes('any') && !row.host.includes(host)) continue;
        const entry = {};
        if (row.matcher) entry.matcher = row.matcher;
        entry.hooks = [{ type: 'command', command: `node "${prefix}/${row.script}"`, timeout: row.timeout }];
        (out[row.event] = out[row.event] || []).push(entry);
    }
    return out;
}

// ---------------------------------------------------------------- rule 4: the set
function readSet(name, kit) {
    const file = SETS[name];
    if (!file) refuse(`unknown set ${name} (one of ${Object.keys(SETS).join(', ')})`);
    const p = path.join(kit, 'templates', file);
    const doc = readJsonFile(p, 'set template');
    const perms = isObject(doc) ? doc.permissions : null;
    if (!isObject(perms)) refuse(`set template has no permissions object: ${p}`);
    if (name.startsWith('cloud-') && 'ask' in perms) refuse(`ask row in a cloud set (${name}): templates/${file} carries permissions.ask, and an ask with no human is a hang`);
    for (const k of ROW_LISTS) if (k in perms && !Array.isArray(perms[k])) refuse(`set template permissions.${k} is not an array: ${p}`);
    return perms;
}

// ---------------------------------------------------------------- rule 5: the merge
function unionRows(fileRows, setRows) {
    const out = [];
    const seen = new Set();
    for (const row of [...fileRows, ...setRows]) {
        const key = typeof row === 'string' ? row : JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function mergePermissions(filePerms, setPerms, target) {
    if (filePerms != null && !isObject(filePerms)) refuse(`target permissions is not an object: ${target}`);
    const base = filePerms || {};
    for (const k of ROW_LISTS) if (k in base && !Array.isArray(base[k])) refuse(`target permissions.${k} is not an array: ${target}`);
    if (!setPerms) return base;
    const out = {};
    for (const [k, v] of Object.entries(base)) out[k] = ROW_LISTS.includes(k) && k in setPerms ? unionRows(v, setPerms[k]) : v;
    for (const k of ROW_LISTS) if (k in setPerms && !(k in out)) out[k] = unionRows([], setPerms[k]);
    return out;
}

function mergeInto(existing, hooks, setPerms, target) {
    const base = existing || {};
    const out = {};
    let placedPerms = false;
    let placedHooks = false;
    for (const [k, v] of Object.entries(base)) {
        if (k === 'permissions') { out.permissions = mergePermissions(v, setPerms, target); placedPerms = true; }
        else if (k === 'hooks') { out.hooks = hooks; placedHooks = true; }
        else out[k] = v;
    }
    if (!placedPerms && setPerms) out.permissions = mergePermissions(null, setPerms, target);
    if (!placedHooks) out.hooks = hooks;
    return out;
}

// ---------------------------------------------------------------- rule 7: -Check
function printDiff(onDisk, text, out, source, form) {
    const a = onDisk.split('\n');
    const b = text.split('\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    say(`--- ${out} (on disk)`);
    say(`+++ render of ${source} (${form} form)`);
    say(`@@ line ${i + 1} @@`);
    for (const l of a.slice(i, i + DIFF_LINES)) say(`- ${l}`);
    for (const l of b.slice(i, i + DIFF_LINES)) say(`+ ${l}`);
    return i + 1;
}

function main() {
    let opts;
    try { opts = parseArgs(process.argv.slice(2), { switches: ['Plugin', 'Vendored', 'Check'], values: ['Host', 'Set', 'Source', 'Out', 'BrainRoot'] }); }
    catch (e) { refuse(e.message); }
    if (opts._.length) refuse(`unexpected argument ${opts._[0]}`);
    if (opts.Plugin && opts.Vendored) refuse('-Plugin and -Vendored exclude each other');
    const form = opts.Vendored ? 'vendored' : 'plugin';
    const host = opts.Host == null ? '' : String(opts.Host).toLowerCase();
    if (host && host !== 'pc' && host !== 'cloud') refuse(`-Host must be pc or cloud (got ${opts.Host})`);
    if (opts.Check && !opts.Out) refuse('-Check needs -Out <path>');
    const kit = kitRoot();
    const source = opts.Source ? path.resolve(opts.Source) : path.join(kit, 'hooks', 'registry.json');
    const rows = readRegistry(source, kit);
    const hooks = renderHooks(rows, form, host);
    const setName = opts.Set == null ? '' : String(opts.Set).toLowerCase();
    const setPerms = setName ? readSet(setName, kit) : null;
    const out = opts.Out ? path.resolve(opts.Out) : '';
    let existing = null;
    if (out && isFile(out)) {
        existing = readJsonFile(out, 'target', 1);
        if (!isObject(existing)) refuse(`target is not a JSON object: ${out}`);
    }
    const text = toText(mergeInto(existing, hooks, setPerms, out));
    if (form === 'vendored' && text.includes('CLAUDE_PLUGIN_ROOT')) {
        const line = text.split('\n').find((l) => l.includes('CLAUDE_PLUGIN_ROOT')).trim();
        refuse(`a vendored render must not name CLAUDE_PLUGIN_ROOT (unset in a cloud container): ${line}`);
    }
    const count = Object.values(hooks).reduce((n, list) => n + list.length, 0);
    const what = `${count} registrations, ${form} form${host ? `, host ${host}` : ''}${setName ? `, set ${setName}` : ''}`;
    if (opts.Check) {
        if (!isFile(out)) refuse(`target missing: ${out}`, 2);
        const onDisk = lf(fs.readFileSync(out, 'utf8'));
        if (onDisk === text) { say(`settings: ok ${out} (${Buffer.byteLength(text, 'utf8')} bytes, ${what})`); return; }
        const line = printDiff(onDisk, text, out, source, form);
        refuse(`${out} differs from the registry render at line ${line}; regenerate it, never hand-edit`);
    }
    if (!out) { process.stdout.write(text); return; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text, 'utf8');
    say(`settings: wrote ${out} (${what})`);
}

try {
    main();
    process.exitCode = 0;
} catch (e) {
    if (e instanceof Refusal) {
        process.stderr.write(`settings: ${e.message.replace(/\s*[\r\n]+\s*/g, ' ')}\n`);   // one line: a JSON error quotes text with its newline
        process.exitCode = e.exit;
    } else {
        process.stderr.write(`settings: ERROR ${e && e.stack ? e.stack : e}\n`);
        process.exitCode = 2;
    }
}
