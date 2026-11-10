// cases-registry.mjs - the registry and renderer cases of 0.3.0 rows 1 to 5 (KIT-03): hooks/registry.json
// rendered by tools/settings.mjs into hooks/hooks.json (-Plugin) and into a repository's
// .claude/settings.json (-Vendored), the -Host filter, the four permission sets, the deep merge and
// -Check. Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.
//
// Every planted fault lives in a temp copy under T: a registry with the guard row removed or a
// pc-only row added, a target that still names CLAUDE_PLUGIN_ROOT, a hand-edited registration, a
// scratch kit whose cloud set carries an ask key (reached through the DF_KIT_ROOT seam). The kit's
// own files are only read; -Check never writes, so it may run against the committed hooks.json.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { manifestFiles, readManifest } from '../../hooks/lib/kit-version.mjs';

export default function registryCases(t) {
    const { T, kit, brain, record, section, like, jp, put, readText, exists, toJson } = t;

    section('-- registry: hooks/registry.json rendered by tools/settings.mjs (0.3.0 rows 1 to 5)');
    const settings = path.join(kit, 'tools', 'settings.mjs');
    const registry = path.join(kit, 'hooks', 'registry.json');
    const hooksJson = path.join(kit, 'hooks', 'hooks.json');
    const templates = path.join(kit, 'templates');
    const R = jp(T, 'registry');
    fs.mkdirSync(R, { recursive: true });

    // The renderer as a child process, from the kit root as the Doctor runs a generator. DF_KIT_ROOT
    // reaches the child only when a case passes it: the seam of an earlier case never leaks in.
    const run = (args, extraEnv = {}) => {
        const env = { ...process.env, NO_COLOR: '1' };
        delete env.DF_KIT_ROOT;
        Object.assign(env, extraEnv);
        const r = spawnSync(process.execPath, [settings, ...args], { encoding: 'utf8', windowsHide: true, cwd: kit, env, maxBuffer: 16 * 1024 * 1024 });
        return { code: r.status == null ? -1 : r.status, out: (r.stdout || '').replace(/\r\n/g, '\n'), err: (r.stderr || '').replace(/\r\n/g, '\n') };
    };
    const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
    const sameBytes = (a, b) => exists(a) && exists(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
    const entries = (doc) => Object.values((doc && doc.hooks) || {}).flatMap((list) => list);
    const commands = (doc) => entries(doc).flatMap((e) => (e.hooks || []).map((h) => String(h.command)));
    const matchers = (doc) => entries(doc).map((e) => String(e.matcher || ''));
    const refusal = (r) => r.err.split('\n').find((l) => l.startsWith('settings:')) || '';
    const why = (r) => `exit ${r.code}: ${refusal(r) || (r.err + r.out).trim().slice(0, 200)}`;

    // ---------------------------------------------------------------- row 1: the registry and its render
    const reg = readJson(registry) || { hooks: [] };
    if (!Array.isArray(reg.hooks)) reg.hooks = [];
    // Seeded from hooks.json: the same scripts, one row per registration. Read as sets, so a row added
    // to both files (the card hook, a grown matcher) moves nothing here; the byte identity below is
    // what holds the two files together.
    const hooksDoc = readJson(hooksJson);
    const regScripts = [...new Set(reg.hooks.map((h) => String(h.script)))].sort();
    const jsonScripts = [...new Set(commands(hooksDoc).map((c) => (/hooks\/[a-z-]+\.mjs/.exec(c) || [''])[0]))].sort();
    record('registry: hooks/registry.json names exactly the scripts hooks/hooks.json registers', 'same', exists(registry) && reg.hooks.length > 0 && regScripts.join(',') === jsonScripts.join(',') ? 'same' : `registry: ${regScripts.join(',') || 'none'}; hooks.json: ${jsonScripts.join(',')}`, exists(registry) ? '' : `${registry} is missing`);
    record('registry: one registry row per hooks.json registration', commands(hooksDoc).length, reg.hooks.length);
    const required = ['id', 'event', 'script', 'timeout', 'host', 'mode', 'vendor'];
    record('registry: every row carries id, event, script, timeout, host, mode and vendor', 'all', reg.hooks.length && reg.hooks.every((h) => required.every((k) => k in h)) ? 'all' : 'short');
    // manifestFiles throws on an include entry that is missing from the kit: that is this case's red,
    // not a crash that would skip every case after it.
    let travel = new Set();
    let manifestErr = '';
    try { const manifest = readManifest(kit); travel = new Set(manifest ? manifestFiles(kit, manifest) : []); } catch (e) { manifestErr = e && e.message ? e.message : String(e); }
    const stays = reg.hooks.filter((h) => h.vendor === true && !travel.has(String(h.script))).map((h) => h.id);
    record('registry: every vendor:true row names a script tools/vendor.json carries', 'all', manifestErr ? `manifest: ${manifestErr}` : reg.hooks.length && stays.length === 0 ? 'all' : stays.join(', ') || 'no rows');

    const outPlugin = path.join(R, 'plugin.json');
    let r = run(['-Plugin', '-Out', outPlugin]);
    record('registry: -Plugin renders the seeded registry (exit 0)', 0, r.code, r.err + r.out);
    record('registry: the -Plugin render is byte-identical to the committed hooks/hooks.json', 'identical', sameBytes(outPlugin, hooksJson) ? 'identical' : 'differs', readText(outPlugin).slice(0, 300));
    const outDefault = path.join(R, 'default.json');
    r = run(['-Out', outDefault]);
    record('registry: -Plugin is the default form when neither -Plugin nor -Vendored is given', 'identical', r.code === 0 && sameBytes(outDefault, hooksJson) ? 'identical' : why(r), r.err);
    // The exact call the Doctor's generated_matches runner makes (tools/doctor/claims-exec.mjs):
    // -Source <source> -BrainRoot <brain> -Out <tmp>, from the kit root, no form flag.
    const outDoctor = path.join(R, 'doctor-gen.json');
    r = run(['-Source', registry, '-BrainRoot', brain, '-Out', outDoctor]);
    record('registry: the generator call the Doctor makes (-Source -BrainRoot -Out) renders hooks.json', 'identical', r.code === 0 && sameBytes(outDoctor, hooksJson) ? 'identical' : why(r), r.err);
    r = run(['-Plugin', '-Out', hooksJson, '-Check']);
    record('registry: -Check against the committed hooks/hooks.json exits 0', 0, r.code, r.err + r.out);
    record('registry: -Check prints its ok line with the settings: prefix', 'ok', like(r.out, 'settings: ok *') ? 'ok' : 'silent', r.out);

    // Red of row 1: the guard row removed from a temp copy of the registry.
    const regNoGuard = path.join(R, 'registry-no-guard.json');
    put(regNoGuard, toJson({ ...reg, hooks: reg.hooks.filter((h) => h.id !== 'guard') }) + '\n');
    r = run(['-Plugin', '-Source', regNoGuard, '-Out', hooksJson, '-Check']);
    record('registry: -Check with the guard row removed from a copy exits 1', 1, r.code, r.err + r.out);
    record('registry: the -Check diff names the registration that went missing (guard.mjs)', 'named', like(r.out, '*guard.mjs*') ? 'named' : 'unnamed', r.out + r.err);
    record('registry: the -Check refusal is one settings: line on stderr', 'one', r.err.split('\n').filter((l) => l.startsWith('settings:')).length === 1 ? 'one' : r.err.trim() || 'none', r.err);
    record('registry: -Check wrote nothing (hooks.json still equals the clean render)', 'untouched', sameBytes(outPlugin, hooksJson) ? 'untouched' : 'written');
    // A hand-edited registration is RED (KIT-03): one timeout changed in a copy of hooks.json.
    const edited = path.join(R, 'hooks-edited.json');
    put(edited, readText(hooksJson).replace('"timeout": 10', '"timeout": 11'));
    r = run(['-Plugin', '-Out', edited, '-Check']);
    record('registry: -Check against a hand-edited registration exits 1', 1, r.code, r.out + r.err);
    r = run(['-Plugin', '-Out', path.join(R, 'absent.json'), '-Check']);
    record('registry: -Check with a missing target exits 2, never 0', 2, r.code, r.out + r.err);

    // ---------------------------------------------------------------- row 2: the vendored form
    const outVend = path.join(R, 'vendored.json');
    r = run(['-Vendored', '-Out', outVend]);
    const vend = readJson(outVend);
    const vcmds = commands(vend);
    record('registry: -Vendored renders (exit 0)', 0, r.code, r.err);
    record('registry: the vendored render has as many registrations as the plugin render', commands(readJson(hooksJson)).length, vcmds.length);
    record('registry: every vendored command runs its script under ${CLAUDE_PROJECT_DIR}/.claude/kit/hooks/', 'all', vcmds.length && vcmds.every((c) => /^node "\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/kit\/hooks\/[a-z-]+\.mjs"$/.test(c)) ? 'all' : vcmds.join(' | ') || 'none');
    record('registry: the vendored render never names CLAUDE_PLUGIN_ROOT', 'clean', exists(outVend) && !readText(outVend).includes('CLAUDE_PLUGIN_ROOT') ? 'clean' : 'named');
    r = run(['-Vendored', '-Host', 'cloud']);
    let parsed = null; try { parsed = JSON.parse(r.out); } catch { parsed = null; }
    record('registry: without -Out the render goes to stdout as JSON with a trailing LF', 'json', r.code === 0 && parsed && parsed.hooks && r.out.endsWith('}\n') ? 'json' : why(r), r.out.slice(0, 200));
    const outDeep = jp(R, 'deep', 'repo', '.claude', 'settings.json');
    r = run(['-Vendored', '-Host', 'cloud', '-Out', outDeep]);
    record('registry: -Out creates the folders of a new settings file', 'written', r.code === 0 && exists(outDeep) ? 'written' : why(r));

    // The -Host filter: a planted host ["pc"] row and a planted host ["cloud"] row beside the seeded ones.
    const pcRow = { id: 'pc-only-probe', event: 'PreToolUse', matcher: 'NotebookEdit', script: 'hooks/guard.mjs', timeout: 10, host: ['pc'], mode: 'deny', vendor: true };
    const cloudRow = { ...pcRow, id: 'cloud-only-probe', matcher: 'WebFetch', host: ['cloud'] };
    const regHosts = path.join(R, 'registry-hosts.json');
    put(regHosts, toJson({ ...reg, hooks: [...reg.hooks, pcRow, cloudRow] }) + '\n');
    const outCloud = path.join(R, 'host-cloud.json');
    r = run(['-Vendored', '-Host', 'cloud', '-Source', regHosts, '-Out', outCloud]);
    let ms = matchers(readJson(outCloud));
    record('registry: -Host cloud drops a host ["pc"] row', 'absent', r.code === 0 && !ms.includes('NotebookEdit') ? 'absent' : r.code === 0 ? 'present' : why(r), ms.join(', '));
    record('registry: -Host cloud keeps the host ["cloud"] row and the host ["any"] rows', 'kept', ms.includes('WebFetch') && ms.includes('AskUserQuestion') && ms.includes('startup') ? 'kept' : 'dropped', ms.join(', '));
    const outPc = path.join(R, 'host-pc.json');
    r = run(['-Vendored', '-Host', 'pc', '-Source', regHosts, '-Out', outPc]);
    ms = matchers(readJson(outPc));
    record('registry: -Host pc keeps the host ["pc"] row and drops the host ["cloud"] row', 'pc-only', r.code === 0 && ms.includes('NotebookEdit') && !ms.includes('WebFetch') ? 'pc-only' : r.code === 0 ? 'wrong' : why(r), ms.join(', '));
    const outAll = path.join(R, 'host-all.json');
    r = run(['-Vendored', '-Source', regHosts, '-Out', outAll]);
    ms = matchers(readJson(outAll));
    record('registry: no -Host keeps every row', 'all', r.code === 0 && ms.includes('NotebookEdit') && ms.includes('WebFetch') ? 'all' : r.code === 0 ? 'filtered' : why(r), ms.join(', '));
    r = run(['-Vendored', '-Host', 'mars', '-Source', regHosts, '-Out', path.join(R, 'host-bad.json')]);
    record('registry: -Host with a word that is not pc or cloud is refused', 1, r.code, r.err);

    // The vendored refusal: a repository settings file that still names CLAUDE_PLUGIN_ROOT in a row
    // the merge keeps (a leftover from the plugin era). The variable is unset in a cloud container.
    const target = path.join(R, 'repo-settings-plugin-root.json');
    put(target, toJson({ permissions: { allow: ['Bash(node "${CLAUDE_PLUGIN_ROOT}/tools/doctor/doctor.mjs" *)'] } }) + '\n');
    const before = readText(target);
    r = run(['-Vendored', '-Set', 'cloud-writer', '-Out', target]);
    record('registry: a vendored render that would still name CLAUDE_PLUGIN_ROOT exits 1', 1, r.code, r.err + r.out);
    record('registry: that refusal is one settings: line naming CLAUDE_PLUGIN_ROOT', 'named', like(refusal(r), 'settings:*CLAUDE_PLUGIN_ROOT*') ? 'named' : refusal(r) || 'silent', r.err);
    record('registry: the refused target is left as it was', 'untouched', readText(target) === before ? 'untouched' : 'written');
    r = run(['-Plugin', '-Out', target]);
    record('registry: the same target renders in the plugin form (the refusal is the vendored form only)', 0, r.code, r.err);

    // ---------------------------------------------------------------- row 2: the deep merge
    const repoSettings = path.join(R, 'repo-settings.json');
    put(repoSettings, toJson({
        env: { DF_PROBE: '1' },
        permissions: { allow: ['Bash(ls *)', 'Bash(git fetch *)'], deny: ['Read(**/.env)', 'Read(**/secret.txt)'], defaultMode: 'acceptEdits' },
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node old-hook.mjs', timeout: 5 }] }] },
    }) + '\n');
    r = run(['-Vendored', '-Host', 'cloud', '-Set', 'cloud-writer', '-Out', repoSettings]);
    const merged = readJson(repoSettings) || {};
    const mPerms = merged.permissions || {};
    const mAllow = Array.isArray(mPerms.allow) ? mPerms.allow : [];
    const mDeny = Array.isArray(mPerms.deny) ? mPerms.deny : [];
    record('registry: the merge renders into an existing settings file (exit 0)', 0, r.code, r.err);
    record("registry: the merge keeps the repository's own permissions.allow row, first", 'Bash(ls *)', mAllow[0], mAllow.join(', '));
    record("registry: the merge adds the set's allow rows after the file's", 'added', mAllow.indexOf('Bash(gh pr create *)') > 1 ? 'added' : 'missing', mAllow.join(', '));
    record('registry: the merge writes no duplicate allow row (git fetch is in both)', 1, mAllow.filter((x) => x === 'Bash(git fetch *)').length, mAllow.join(', '));
    record('registry: the merge writes no duplicate deny row (Read(**/.env) is in both)', 1, mDeny.filter((x) => x === 'Read(**/.env)').length, mDeny.join(', '));
    record("registry: the merge keeps the repository's own deny row", 'kept', mDeny.includes('Read(**/secret.txt)') ? 'kept' : 'lost', mDeny.join(', '));
    record('registry: the merge keeps every other top-level key (env)', '1', merged.env ? String(merged.env.DF_PROBE) : 'lost', toJson(merged).slice(0, 300));
    record('registry: the merge keeps a permissions key it does not own (defaultMode)', 'acceptEdits', String(mPerms.defaultMode), toJson(mPerms).slice(0, 300));
    record('registry: the merge keeps the file\'s key order (env, permissions, hooks)', 'env,permissions,hooks', Object.keys(merged).join(','));
    const outCloudSeed = path.join(R, 'cloud-seed.json');
    run(['-Vendored', '-Host', 'cloud', '-Out', outCloudSeed]);
    record("registry: the merge replaces the file's hooks block with the render (the old hook is gone)", 'replaced', merged.hooks && toJson(merged.hooks) === toJson((readJson(outCloudSeed) || {}).hooks) && !toJson(merged.hooks).includes('old-hook.mjs') ? 'replaced' : 'kept', toJson(merged.hooks || {}).slice(0, 300));
    r = run(['-Vendored', '-Host', 'cloud', '-Set', 'cloud-writer', '-Out', repoSettings, '-Check']);
    record('registry: -Check on the merged file compares the merged result (exit 0)', 0, r.code, r.out + r.err);
    const m2 = readJson(repoSettings);
    if (m2 && m2.hooks && Array.isArray(m2.hooks.PreToolUse)) {
        m2.hooks.PreToolUse = m2.hooks.PreToolUse.filter((e) => !String(e.hooks[0].command).includes('fence.mjs'));
        put(repoSettings, toJson(m2) + '\n');
    }
    r = run(['-Vendored', '-Host', 'cloud', '-Set', 'cloud-writer', '-Out', repoSettings, '-Check']);
    record('registry: -Check on a merged file whose fence registration was hand-removed exits 1', 1, r.code, r.out + r.err);

    // ---------------------------------------------------------------- rows 3 to 5: the permission sets
    const pcSet = (readJson(path.join(templates, 'root-settings.json')) || {}).permissions || { deny: [], ask: [] };
    const pcAsDeny = [...(pcSet.deny || []), ...(pcSet.ask || [])];
    const sets = {};
    for (const name of ['cloud-brain', 'cloud-writer', 'cloud-checker']) {
        const o = path.join(R, `set-${name}.json`);
        const rr = run(['-Vendored', '-Host', 'cloud', '-Set', name, '-Out', o]);
        const p = (readJson(o) || {}).permissions || null;
        sets[name] = p || { allow: [], deny: [] };
        record(`registry: the ${name} set renders (exit 0)`, 0, rr.code, rr.err);
        record(`registry: the ${name} set has no ask key`, 'none', p && !('ask' in p) ? 'none' : p ? 'ask present' : 'no render');
        record(`registry: the ${name} set carries the pc deny rows, then every pc ask row as deny, same order`, 'same', p && toJson(p.deny) === toJson(pcAsDeny) ? 'same' : 'differs', p ? toJson(p.deny) : '');
        record(`registry: the ${name} set allows no install verb the pc set asks about`, 'none', p && Array.isArray(p.allow) && !p.allow.some((x) => (pcSet.ask || []).includes(x)) ? 'none' : 'allowed', p ? toJson(p.allow) : '');
        const tpl = readJson(path.join(templates, `settings.${name}.json`)) || {};
        record(`registry: templates/settings.${name}.json says in a _comment why the install verbs are denied`, 'said', like(tpl._comment, '*hang*') ? 'said' : 'silent', String(tpl._comment || '').slice(0, 200));
    }
    const brainAllow = sets['cloud-brain'].allow || [];
    const writerAllow = sets['cloud-writer'].allow || [];
    const checkerAllow = sets['cloud-checker'].allow || [];
    record('registry: cloud-brain allows the claude/* push, gh pr merge --auto and git rebase origin/main', 'allowed', ['Bash(git push origin claude/*)', 'Bash(gh pr merge --auto *)', 'Bash(git rebase origin/main)', 'Bash(node scripts/*)'].every((x) => brainAllow.includes(x)) ? 'allowed' : 'short', brainAllow.join(', '));
    record('registry: cloud-writer allows the claude/* push and gh pr create, no rebase and no brain script', 'writer', ['Bash(git push origin claude/*)', 'Bash(gh pr create *)', 'Bash(node .claude/kit/*)'].every((x) => writerAllow.includes(x)) && !writerAllow.some((x) => like(x, '*rebase*') || like(x, '*scripts/*')) ? 'writer' : 'wrong', writerAllow.join(', '));
    record('registry: cloud-checker allows no merge verb and no push verb', 'none', checkerAllow.length && !checkerAllow.some((x) => like(x, '*gh pr merge*') || like(x, '*git push*') || like(x, '*git commit*')) ? 'none' : 'allowed', checkerAllow.join(', '));
    record('registry: cloud-checker allows gh api, git fetch and the vendored kit tools', 'allowed', ['Bash(gh api *)', 'Bash(git fetch *)', 'Bash(node .claude/kit/*)'].every((x) => checkerAllow.includes(x)) ? 'allowed' : 'short', checkerAllow.join(', '));
    const pcTemplateText = readText(path.join(templates, 'root-settings.json'));
    record('registry: templates/root-settings.json keeps its ask key (the pc host has a human)', 'ask', Array.isArray(pcSet.ask) && pcSet.ask.length > 0 && !pcTemplateText.includes('"allow"') ? 'ask' : 'changed');

    // Row 5: the pc set is templates/root-settings.json as it is.
    const outPcSet = path.join(R, 'set-pc.json');
    r = run(['-Vendored', '-Host', 'pc', '-Set', 'pc', '-Out', outPcSet]);
    const pcRendered = (readJson(outPcSet) || {}).permissions || null;
    record('registry: the pc set equals templates/root-settings.json (deny and ask, unchanged)', 'equal', r.code === 0 && pcRendered && toJson(pcRendered) === toJson(pcSet) ? 'equal' : r.code === 0 ? 'differs' : why(r), pcRendered ? toJson(pcRendered).slice(0, 300) : '');
    record('registry: a new settings file is permissions, then hooks', 'permissions,hooks', Object.keys(readJson(outPcSet) || {}).join(','));

    // Row 3 red: an ask key planted in a cloud set, in a scratch kit reached through DF_KIT_ROOT.
    const skit = jp(T, 'registry-kit');
    fs.cpSync(path.join(kit, 'hooks'), path.join(skit, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(skit, 'templates'), { recursive: true });
    for (const f of ['root-settings.json', 'settings.cloud-brain.json', 'settings.cloud-writer.json', 'settings.cloud-checker.json']) {
        if (exists(path.join(templates, f))) fs.copyFileSync(path.join(templates, f), path.join(skit, 'templates', f));
    }
    const plantedSet = readJson(path.join(templates, 'settings.cloud-brain.json')) || { permissions: { allow: [], deny: [] } };
    plantedSet.permissions.ask = ['Bash(npm install *)'];
    put(path.join(skit, 'templates', 'settings.cloud-brain.json'), toJson(plantedSet) + '\n');
    const outAsk = path.join(R, 'set-ask.json');
    r = run(['-Vendored', '-Set', 'cloud-brain', '-Out', outAsk], { DF_KIT_ROOT: skit });
    record('registry: a cloud set whose template carries an ask key is refused (exit 1)', 1, r.code, r.err + r.out);
    record('registry: that refusal says ask row in a cloud set', 'said', like(refusal(r), 'settings:*ask row in a cloud set*') ? 'said' : refusal(r) || 'silent', r.err);
    record('registry: the refused set wrote nothing', 'nothing', exists(outAsk) ? 'written' : 'nothing');
    r = run(['-Vendored', '-Set', 'cloud-brain', '-Out', outAsk]);
    r = run(['-Vendored', '-Set', 'cloud-brain', '-Out', outAsk, '-Check'], { DF_KIT_ROOT: skit });
    record('registry: -Check under the planted ask key exits 1 with the same refusal', 'refused', r.code === 1 && like(refusal(r), '*ask row in a cloud set*') ? 'refused' : why(r), r.err);
    r = run(['-Vendored', '-Host', 'cloud', '-Set', 'cloud-writer', '-Out', path.join(R, 'set-writer-skit.json')], { DF_KIT_ROOT: skit });
    record('registry: the scratch kit renders an unplanted set as the kit does (the seam is honest)', 'identical', r.code === 0 && sameBytes(path.join(R, 'set-writer-skit.json'), path.join(R, 'set-cloud-writer.json')) ? 'identical' : why(r), r.err);
    // An input the render needs that is missing or is not JSON is could-not-look (exit 2), never the
    // refusal a wrong row or a planted ask key earns (exit 1): the tool did not look (review finding 11).
    // Red first: each exited 1.
    r = run(['-Vendored', '-Out', path.join(R, 'seam-bad.json')], { DF_KIT_ROOT: path.join(T, 'no-such-kit') });
    record('registry: a DF_KIT_ROOT that is not a folder is could-not-look (exit 2), never read around', 2, r.code, r.err);
    const bkit = jp(T, 'registry-kit-broken');
    fs.cpSync(skit, bkit, { recursive: true });
    put(path.join(bkit, 'templates', 'settings.cloud-writer.json'), 'not json\n');
    fs.rmSync(path.join(bkit, 'templates', 'settings.cloud-checker.json'), { force: true });
    const outBroken = path.join(R, 'set-broken.json');
    r = run(['-Vendored', '-Set', 'cloud-writer', '-Out', outBroken], { DF_KIT_ROOT: bkit });
    record('registry: a set template that is not JSON is could-not-look (exit 2), never refused', 2, r.code, r.err);
    record('registry: that line names the template and nothing is written', 'nothing', like(refusal(r), 'settings: set template could not be parsed*settings.cloud-writer.json*') && !exists(outBroken) ? 'nothing' : exists(outBroken) ? 'written' : refusal(r) || 'silent', r.err);
    r = run(['-Vendored', '-Set', 'cloud-checker', '-Out', outBroken], { DF_KIT_ROOT: bkit });
    record('registry: a set template that is missing is could-not-look (exit 2)', 2, r.code, r.err);

    // ---------------------------------------------------------------- the refusals a registry row earns
    const refuse = (name, rows) => {
        const p = path.join(R, `registry-${name}.json`);
        put(p, toJson({ ...reg, hooks: rows }) + '\n');
        const rr = run(['-Plugin', '-Source', p, '-Out', path.join(R, `out-${name}.json`)]);
        return { code: rr.code, line: refusal(rr), r: rr };
    };
    // The refusal cases name the row by its id, so the fallback keeps the id the patterns look for.
    const guardRow = reg.hooks.find((h) => h.id === 'guard') || { ...pcRow, id: 'guard' };
    let x = refuse('no-host', [{ ...guardRow, host: undefined }]);
    record('registry: a row missing host is refused and named', 'refused', x.code === 1 && like(x.line, 'settings:*guard*host*') ? 'refused' : why(x.r));
    x = refuse('no-timeout', [{ ...guardRow, timeout: undefined }]);
    record('registry: a row missing timeout is refused and named', 'refused', x.code === 1 && like(x.line, 'settings:*guard*timeout*') ? 'refused' : why(x.r));
    x = refuse('bad-event', [{ ...guardRow, event: 'PreToolUsage' }]);
    record('registry: a row with an unknown event is refused', 'refused', x.code === 1 && like(x.line, 'settings:*PreToolUsage*') ? 'refused' : why(x.r));
    x = refuse('no-script', [{ ...guardRow, script: 'hooks/nowhere.mjs' }]);
    record('registry: a row whose script does not exist under the kit root is refused', 'refused', x.code === 1 && like(x.line, 'settings:*nowhere.mjs*') ? 'refused' : why(x.r));
    x = refuse('bad-host', [{ ...guardRow, host: ['pc', 'moon'] }]);
    record('registry: a row with a host word that is not any, pc or cloud is refused', 'refused', x.code === 1 && like(x.line, 'settings:*guard*host*') ? 'refused' : why(x.r));
    x = refuse('dup-id', [guardRow, guardRow]);
    record('registry: two rows with one id are refused', 'refused', x.code === 1 && like(x.line, 'settings:*guard*') ? 'refused' : why(x.r));
    r = run(['-Plugin', '-Set', 'cloud-other', '-Out', path.join(R, 'set-unknown.json')]);
    record('registry: an unknown set is refused', 1, r.code, r.err);
    r = run(['-Plugin', '-Vendored', '-Out', path.join(R, 'both.json')]);
    record('registry: -Plugin and -Vendored together are refused', 1, r.code, r.err);
    r = run(['-Plugin', '-Check']);
    record('registry: -Check without -Out is refused', 1, r.code, r.err);
    r = run(['-Plugin', '-Nope', '1']);
    record('registry: an unknown option is refused with a settings: line (args.mjs throws)', 'refused', r.code === 1 && like(refusal(r), 'settings:*Nope*') ? 'refused' : why(r), r.err);
    r = run(['-Plugin', '-Source', path.join(R, 'no-such-registry.json'), '-Out', path.join(R, 'out-missing-source.json')]);
    record('registry: a missing -Source is could-not-look (exit 2), never rendered empty', 2, r.code, r.err);
    const notJsonRegistry = path.join(R, 'registry-not-json.json');
    put(notJsonRegistry, 'not json\n');
    r = run(['-Plugin', '-Source', notJsonRegistry, '-Out', path.join(R, 'out-not-json-source.json')]);
    record('registry: a -Source that is not JSON is could-not-look (exit 2)', 2, r.code, r.err);
    // The target stays a refusal: a file -Out names that is not JSON is never merged into or overwritten,
    // and to -Check it is not the render (exit 1, the file left as it was).
    const notJsonTarget = path.join(R, 'target-not-json.json');
    put(notJsonTarget, 'not json\n');
    r = run(['-Vendored', '-Out', notJsonTarget]);
    record('registry: a target that is not JSON is refused (exit 1) and left as it was', 'refused, untouched', `${r.code === 1 ? 'refused' : `exit ${r.code}`}, ${readText(notJsonTarget) === 'not json\n' ? 'untouched' : 'written'}`, r.err);
}
