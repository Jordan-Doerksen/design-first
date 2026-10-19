// cases-kitroot.mjs - hook self-test case 50 of CR-2026-10-16-ONEWRITER (chunk 0, ported to the
// Node hooks in 0.2.3): the kit root the hooks resolve. Imported by run.mjs, which owns the
// fixtures and helpers used here. Never run directly.
//
// kitRoot (lib/law-rows.mjs: route.mjs, subagent.mjs and the state card) and the kit root of
// entry.mjs's "kit:" entries take the copy that is running first, and the pointer's pluginRoot only
// when that copy has no law.json. Workaround (CR-2026-10-19-REVIEW F2): the pointer came first, so
// after a plugin update the law rows and the entry path named another version than the hook code.
// The 'another version' cases fail if that order is reverted. The 'copy with no law.json' cases
// hold the other side: hooks that run from a folder that is not a kit still find the kit through
// the pointer.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default function kitRootCases(t) {
    const { T, kit, root, record, section, like, rxEscape, jp, writePointer, invokeHook, hookJson, parseOut, fullTextFiles, route, sub, entry } = t;

    section('-- case 50: the running kit root (CR-2026-10-16-ONEWRITER chunk 0)');
    const krSavedRoot = process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    // Another version of the kit, as a plugin update leaves the pointer naming one. It has its own
    // law.json, LAW.md, route policy and entry hook, so a root resolved there prints its own paths.
    const krOther = jp(T, 'plugins', 'cache', 'design-first', 'design-first', '0.0.1');
    for (const f of ['law.json', 'LAW.md', jp('templates', 'route-policy.json'), jp('hooks', 'entry.mjs')]) {
        const dst = path.join(krOther, f);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(kit, f), dst);
    }
    const krKitHook = rxEscape(path.join(kit, 'hooks', 'entry.mjs'));
    // The kit folder an injection names once at its top (lib/law-rows.mjs, lawFoldersLine), read the
    // way an agent reads it; the subagent's text arrives inside a JSON reply, so it is parsed first.
    const kitFolderOf = (text) => fullTextFiles(text).kit;
    const subText = (r) => { const j = parseOut(r.out); return j && j.hookSpecificOutput ? String(j.hookSpecificOutput.additionalContext || '') : ''; };
    const krVerdict = (text, atKit, elsewhere, name) => {
        if (atKit && !like(text, `*${elsewhere}*`)) return name;
        if (like(text, `*${elsewhere}*`)) return 'elsewhere';
        return 'wrong';
    };

    writePointer(krOther, 'cache');
    const krLib = path.join(kit, 'hooks', 'lib');
    const krCode = `import { readPointer } from ${JSON.stringify(pathToFileURL(path.join(krLib, 'common.mjs')).href)};\n` +
        `import { kitRoot } from ${JSON.stringify(pathToFileURL(path.join(krLib, 'law-rows.mjs')).href)};\n` +
        'process.stdout.write(String(kitRoot(readPointer())));';
    const krRun = spawnSync(process.execPath, ['--input-type=module', '-e', krCode], { encoding: 'utf8', windowsHide: true });
    const krGot = ((krRun.stdout || '') + (krRun.stderr || '')).trim();
    record('case 50: kitRoot returns the running copy when the pointer names another version', 'running', krGot === kit ? 'running' : krGot === krOther ? 'pointer' : 'wrong', krGot);
    let r = route('please build the new feature and commit it', 'kr1', root);
    record('case 50: route.mjs names the owning files under the running copy', 'running', krVerdict(r.out, r.code === 0 && kitFolderOf(r.out) === kit, krOther, 'running'), r.out);
    r = sub('kr1', 'general-purpose');
    const krCtx = subText(r);
    record('case 50: subagent.mjs names the owning files under the running copy', 'running', krVerdict(krCtx, r.code === 0 && kitFolderOf(krCtx) === kit, krOther, 'running'), r.out);
    let e = entry(root, 'kr2', 'startup');
    record('case 50: entry.mjs resolves a kit: entry under the running copy', 'running', krVerdict(e.out, e.code === 0 && new RegExp(`^ 4\\. ${krKitHook}$`, 'mi').test(e.out), krOther, 'running'), e.out);

    // The hooks copied to a folder with no law.json: the pointer names the kit.
    const krBare = path.join(T, 'bare-copy');
    fs.cpSync(path.join(kit, 'hooks'), path.join(krBare, 'hooks'), { recursive: true });
    writePointer(kit, 'checkout');
    const krBareHook = (script, payload) => invokeHook(script, hookJson(payload), path.join(krBare, 'hooks'));
    r = krBareHook('route.mjs', { session_id: 'kr3', cwd: root, hook_event_name: 'UserPromptSubmit', prompt_id: 'p', prompt: 'please build the new feature and commit it' });
    record('case 50: route.mjs run from a copy with no law.json reads the kit the pointer names', 'pointer', krVerdict(r.out, r.code === 0 && kitFolderOf(r.out) === kit, krBare, 'pointer'), r.out);
    e = krBareHook('entry.mjs', { session_id: 'kr4', cwd: root, hook_event_name: 'SessionStart', source: 'startup' });
    record('case 50: entry.mjs run from a copy with no law.json resolves kit: under the pointer', 'pointer', krVerdict(e.out, e.code === 0 && new RegExp(`^ 4\\. ${krKitHook}$`, 'mi').test(e.out), krBare, 'pointer'), e.out);
    if (krSavedRoot !== undefined) process.env.CLAUDE_PLUGIN_ROOT = krSavedRoot;
}
