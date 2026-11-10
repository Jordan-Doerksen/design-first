// cases-extract.mjs - self-test cases for tools/extract.mjs and hooks/lib/secrets.mjs (0.3.0 chunk 1,
// rows 30 and 31): the extract a vendored hook reads where no brain is. Imported by run.mjs, which owns
// the fixtures and helpers used here; runs before cases-kitroot.mjs. Never run directly.
//
// A temp brain is built from the kit's templates with planted rows: two ${ROOT} rows that must become
// { repo, path }, a ${BRAIN} row, two host paths that must leave a non-full extract, an overlay clause
// whose text may reach private and full only, why, note and underscore keys, a token-shaped value, a
// leak word, and a profile/ and a memory/ file whose sentences must never appear in any output. Every
// run of the tool is a child process with its own -Brain; nothing here reads the real pointer. The
// planted token and key shapes are built at run time by repetition, so no file of the kit carries one.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default async function extractCases(t) {
    const { T, kit, record, section, like, clike, jp, put, readText, exists, toJson, runGit, gitOut } = t;

    section('-- extract: hooks/lib/secrets.mjs, the nine relay patterns (row 31)');
    let S = null;
    try { S = await import(pathToFileURL(path.join(kit, 'hooks', 'lib', 'secrets.mjs')).href); } catch { S = null; }
    record('extract: secrets.mjs exports nine named patterns', 9, S && Array.isArray(S.SECRET_PATTERNS) ? S.SECRET_PATTERNS.length : 'missing');
    const samples = [
        ['discord-webhook', 'https://discord.com/api/webhooks/' + '1'.repeat(18) + '/' + 'a'.repeat(68)],
        ['github-token', 'ghp_' + 'a'.repeat(36)],
        ['github-pat', 'github_pat_' + 'A'.repeat(60)],
        ['anthropic-key', 'sk-ant-' + 'a'.repeat(40)],
        ['openai-key', 'sk-' + 'a'.repeat(48)],
        ['aws-key', 'AKIA' + 'A'.repeat(16)],
        ['private-key', '-----BEGIN ' + 'RSA PRIVATE KEY-----'],
        ['slack-token', 'xoxb-' + '1'.repeat(12)],
        ['discord-bot-token', 'M' + 'a'.repeat(24) + '.' + 'b'.repeat(6) + '.' + 'c'.repeat(27)],
    ];
    const find = (text) => { try { return S ? S.findSecrets(text) : null; } catch { return null; } };
    for (const [name, sample] of samples) {
        const hits = find('value: ' + sample + ' end');
        record(`extract: findSecrets names ${name}`, name, hits == null ? 'missing' : hits.some((h) => h.name === name) ? name : (hits.map((h) => h.name).join(',') || 'none'));
    }
    const one = find('a ' + samples[2][1] + ' b');
    record('extract: a hit carries the pattern name and the index, never the match', 'index,name', one && one.length ? Object.keys(one[0]).sort().join(',') : 'none');
    record('extract: findSecrets on clean text finds nothing', 0, (find('a plain sentence with no token in it') || ['missing']).length);

    section('-- extract: tools/extract.mjs on a temp brain built from the templates (row 30)');
    const X = jp(T, 'extract');
    fs.mkdirSync(path.join(X, 'out'), { recursive: true });
    const tool = path.join(kit, 'tools', 'extract.mjs');
    const tpl = (f) => JSON.parse(readText(path.join(kit, 'templates', f)));
    const brainName = 'xbrain';
    const xb = path.join(X, brainName);
    const cfg = tpl('doctor.config.json');
    cfg.frozenPaths = ['${ROOT}/trading/beacon', '${ROOT}/tools/bench-lab/src', '%USERPROFILE%/Desktop/frozen-thing', 'C:\\Users\\someone\\frozen-too'];
    cfg.tombstonedPaths = ['${BRAIN}/old-notes', '${ROOT}/games/retired-game'];
    cfg.secretExceptions = ['web/site/.env.example'];
    cfg.categories = { folders: ['trading', 'tools', 'web', 'games'], since: '' };
    cfg.why = 'PLANTED-WHY-TOP';
    cfg.ask = { maxQuestions: 2, why: 'PLANTED-WHY-ASK', _planted: 'PLANTED-UNDERSCORE-ASK' };
    cfg.boundedFiles = [{ glob: '${ROOT}/trading/beacon/control/*.md', maxBytes: 30000, headLines: 15, note: 'PLANTED-NOTE-BOUNDED' }];
    cfg.contentRules = [{ id: 'SAFE-02', under: ['${ROOT}/trading'], except: ['${ROOT}/trading/beacon/action'], exceptParts: ['tests'], extensions: ['.py'], pattern: '(?i)place_?orders?\\s*\\(', shell: true, why: 'PLANTED-WHY-RULE' }];
    cfg.leakWords = ['pelican-ledger'];
    put(path.join(xb, 'doctor.config.json'), toJson(cfg));
    const ov = tpl('law.overlay.json');
    ov.clauses = [{ id: 'PRIV-01', group: 'PRIV', verb: 'keep', rule: 'PLANTED-OVERLAY-SENTENCE about the owner.', owner: 'brain:instructions/private.md', grade: 'OWNER' }];
    ov.overrides = { 'OWN-06': { grade: 'HONOUR' } };
    put(path.join(xb, 'law.overlay.json'), toJson(ov));
    for (const f of ['agent-policy.json', 'route-policy.json', 'claims.json']) fs.copyFileSync(path.join(kit, 'templates', f), path.join(xb, f));
    put(path.join(xb, 'LAW.md'), readText(path.join(kit, 'LAW.md')) + '\n## PRIV - Private rules\n\n| id | grade | rule | owner |\n|---|---|---|---|\n| PRIV-01 | OWNER | PLANTED-OVERLAY-SENTENCE about the owner. | `brain:instructions/private.md` |\n');
    put(path.join(xb, 'profile', 'me.md'), '# me\nPLANTED-PROFILE-SENTENCE\n');
    put(path.join(xb, 'memory', 'secret-note.md'), '---\ndomain: x\n---\nPLANTED-MEMORY-SENTENCE\n');
    const kitVersion = String(JSON.parse(readText(path.join(kit, '.claude-plugin', 'plugin.json'))).version || '');

    const run = (args) => {
        const r = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NO_COLOR: '1', DF_POINTER_PATH: path.join(X, 'no-pointer.json') } });
        return { code: r.status == null ? -1 : r.status, out: r.stdout || '', err: r.stderr || '' };
    };
    const extract = (brain, cls, name, extra = []) => {
        const outPath = path.join(X, 'out', `${name}.json`);
        try { fs.rmSync(outPath, { force: true }); } catch { /* absent */ }
        const r = run(['-Brain', brain, '-Class', cls, '-Out', outPath, ...extra]);
        const text = readText(outPath);
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        return { ...r, outPath, text, json, all: r.out + r.err };
    };
    const cloneBrain = (name, edit) => { const b = path.join(X, name); fs.cpSync(xb, b, { recursive: true }); edit(b); return b; };
    const cfgOf = (b) => JSON.parse(readText(path.join(b, 'doctor.config.json')));
    const putCfg = (b, c) => put(path.join(b, 'doctor.config.json'), toJson(c));
    const rows = (r, key) => (r.json && r.json.values && Array.isArray(r.json.values[key]) ? r.json.values[key] : []);
    const hasRow = (list, repo, p) => list.some((x) => x && typeof x === 'object' && x.repo === repo && x.path === p);
    const keysDeep = (v, acc = new Set()) => { if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.add(k); keysDeep(x, acc); } return acc; };
    const lawIds = (r) => rows(r, 'lawIds');
    const written = (r) => (r.code === 0 && r.json ? 'written' : `exit ${r.code}, ${r.json ? 'file' : 'no file'}`);

    const pub = extract(xb, 'public', 'public');
    const shared = extract(xb, 'shared', 'shared');
    const priv = extract(xb, 'private', 'private');
    const full = extract(xb, 'full', 'full');
    record('extract: a public run exits 0 and writes the file', 'written', written(pub), pub.all);
    record('extract: the four classes all write', 'written x4', [shared, priv, full].every((r) => r.code === 0 && r.json) && pub.code === 0 && pub.json ? 'written x4' : [pub, shared, priv, full].map(written).join('; '), shared.all + priv.all + full.all);
    // header
    const h = pub.json || {};
    record('extract: header generated_by names the tool', 'tools/extract.mjs', h.generated_by == null ? 'missing' : h.generated_by);
    record("extract: header kit_version equals the running kit's", kitVersion, h.kit_version == null ? 'missing' : h.kit_version);
    record('extract: header class equals the flag', 'public', h.class == null ? 'missing' : h.class);
    record('extract: header class equals the flag (private)', 'private', priv.json && priv.json.class != null ? priv.json.class : 'missing');
    record('extract: header at is an ISO timestamp', 'iso', typeof h.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(h.at) && !Number.isNaN(Date.parse(h.at)) ? 'iso' : String(h.at));
    record('extract: header order is generated_by, kit_version, brain_commit, class, at, values', 'in-order', Object.keys(h).join(',') === 'generated_by,kit_version,brain_commit,class,at,values' ? 'in-order' : Object.keys(h).join(','));
    record('extract: brain_commit is empty for a brain that is no repository', '', h.brain_commit == null ? 'missing' : h.brain_commit);
    record('extract: the output is 2-space JSON with a trailing LF', 'shaped', pub.text && pub.text === JSON.stringify(pub.json, null, 2) + '\n' ? 'shaped' : 'other');
    // path rows (categories rule: the brain's doctor.config.json lists trading, tools, web, games as category folders)
    const frozen = rows(pub, 'frozenPaths');
    record('extract: ${ROOT}/trading/beacon -> { repo: beacon, path: . }', 'row', hasRow(frozen, 'beacon', '.') ? 'row' : 'missing', JSON.stringify(frozen));
    record('extract: ${ROOT}/tools/bench-lab/src -> { repo: bench-lab, path: src }', 'row', hasRow(frozen, 'bench-lab', 'src') ? 'row' : 'missing', JSON.stringify(frozen));
    record('extract: the ${ROOT} row does not survive verbatim', 'absent', frozen.some((x) => typeof x === 'string' && x.includes('${ROOT}')) ? 'verbatim' : 'absent', JSON.stringify(frozen));
    const tomb = rows(pub, 'tombstonedPaths');
    record('extract: ${BRAIN}/old-notes -> { repo: <brain folder>, path: old-notes }', 'row', hasRow(tomb, brainName, 'old-notes') ? 'row' : 'missing', JSON.stringify(tomb));
    record('extract: ${ROOT}/games/retired-game -> { repo: retired-game, path: . }', 'row', hasRow(tomb, 'retired-game', '.') ? 'row' : 'missing', JSON.stringify(tomb));
    record('extract: a bare relative row is root-relative (web/site/.env.example)', 'row', hasRow(rows(pub, 'secretExceptions'), 'site', '.env.example') ? 'row' : 'missing', JSON.stringify(rows(pub, 'secretExceptions')));
    record('extract: a %USERPROFILE% row is dropped from public', 'dropped', frozen.some((x) => String(typeof x === 'string' ? x : JSON.stringify(x)).includes('USERPROFILE')) ? 'kept' : 'dropped', JSON.stringify(frozen));
    record('extract: the drop prints the stderr line', 'line', like(pub.err, '*dropped (host path): %USERPROFILE%/Desktop/frozen-thing*') ? 'line' : 'silent', pub.err);
    record('extract: a drive-letter row is dropped from public', 'dropped', frozen.some((x) => /^[A-Za-z]:/.test(String(x))) ? 'kept' : 'dropped', JSON.stringify(frozen));
    record('extract: public holds no ${ROOT}, ${BRAIN} or %USERPROFILE% anywhere', 'none', pub.text && !/\$\{ROOT\}|\$\{BRAIN\}|%USERPROFILE%/.test(pub.text) ? 'none' : 'found');
    const fullFrozen = rows(full, 'frozenPaths');
    record('extract: full keeps the %USERPROFILE% row verbatim', 'kept', fullFrozen.includes('%USERPROFILE%/Desktop/frozen-thing') ? 'kept' : 'dropped', JSON.stringify(fullFrozen));
    record('extract: full keeps the drive-letter row verbatim', 'kept', fullFrozen.includes('C:\\Users\\someone\\frozen-too') ? 'kept' : 'dropped', JSON.stringify(fullFrozen));
    record('extract: full prints no dropped line for a host path', 'quiet', like(full.err, '*dropped (host path)*') ? 'line' : 'quiet', full.err);
    record('extract: full still writes ${ROOT} rows as { repo, path }', 'row', hasRow(fullFrozen, 'beacon', '.') ? 'row' : 'missing', JSON.stringify(fullFrozen));
    const bounded = rows(pub, 'boundedFiles');
    record('extract: a boundedFiles glob under ${ROOT} becomes a { repo, path } row', 'row', bounded.length === 1 && bounded[0] && bounded[0].glob && bounded[0].glob.repo === 'beacon' && bounded[0].glob.path === 'control/*.md' ? 'row' : 'other', JSON.stringify(bounded));
    // the overlay by class
    const planted = 'PLANTED-OVERLAY-SENTENCE';
    record('extract: public carries no overlay rule text', 'absent', pub.text.includes(planted) ? 'survives' : 'absent');
    record('extract: public carries no overlay clause id', 'absent', pub.text.includes('PRIV-01') ? 'survives' : 'absent');
    record('extract: shared carries no overlay text or id', 'absent', shared.text.includes(planted) || shared.text.includes('PRIV-01') ? 'survives' : 'absent');
    const privOv = priv.json && priv.json.values ? priv.json.values.overlay : null;
    record('extract: private carries the overlay ids, grades and rule text', 'carried', privOv && Array.isArray(privOv.clauses) && privOv.clauses.some((c) => c.id === 'PRIV-01' && c.grade === 'OWNER' && String(c.rule).includes(planted)) ? 'carried' : 'missing', JSON.stringify(privOv));
    record('extract: private lawIds includes the overlay clause id', 'included', lawIds(priv).some((r) => r.id === 'PRIV-01') ? 'included' : 'missing');
    record('extract: full carries the overlay whole', 'whole', full.json && full.json.values && full.json.values.overlay && full.json.values.overlay.schema === 1 && Array.isArray(full.json.values.overlay.clauses) && full.json.values.overlay.overrides && full.json.values.overlay.overrides['OWN-06'] ? 'whole' : 'partial', JSON.stringify(full.json && full.json.values ? full.json.values.overlay : null));
    // lawIds
    const ids = lawIds(pub);
    record('extract: public lawIds carries every kit row as { id, grade }', 'rows', ids.length > 10 && ids.every((r) => r && typeof r.id === 'string' && typeof r.grade === 'string' && Object.keys(r).length === 2) && ids.some((r) => r.id === 'SAFE-01' && r.grade === 'HOOK') ? 'rows' : 'other', JSON.stringify(ids.slice(0, 3)));
    record('extract: public lawIds carries no rule text', 'none', pub.text.includes('Secrets live in an ignored secrets file') ? 'text' : 'none');
    // why, note, comments
    const pubKeys = keysDeep(pub.json);
    record('extract: a planted why key is dropped from public (top level and nested)', 'dropped', pubKeys.has('why') || pub.text.includes('PLANTED-WHY') ? 'survives' : 'dropped');
    record('extract: a planted note key is dropped from public', 'dropped', pubKeys.has('note') || pub.text.includes('PLANTED-NOTE') ? 'survives' : 'dropped');
    record('extract: no key starting with _ reaches public', 'none', [...pubKeys].some((k) => k.startsWith('_')) || pub.text.includes('PLANTED-UNDERSCORE') ? [...pubKeys].filter((k) => k.startsWith('_')).join(',') || 'text' : 'none');
    record('extract: full keeps the why keys', 'kept', full.text.includes('PLANTED-WHY-TOP') && full.text.includes('PLANTED-WHY-ASK') ? 'kept' : 'dropped');
    record('extract: full drops _readers and _comment of doctor.config.json', 'dropped', full.json && full.json.values && !('_readers' in full.json.values) && !('_comment' in full.json.values) ? 'dropped' : 'kept');
    // the class allowlist
    const pv = pub.json && pub.json.values ? pub.json.values : {};
    const prv = priv.json && priv.json.values ? priv.json.values : {};
    record('extract: public has no contentRules and no routePolicy', 'absent', 'contentRules' in pv || 'routePolicy' in pv ? 'present' : 'absent', Object.keys(pv).join(','));
    record('extract: private has contentRules and routePolicy', 'present', Array.isArray(prv.contentRules) && prv.contentRules.length === 1 && prv.routePolicy && prv.routePolicy.groups ? 'present' : 'absent', Object.keys(prv).join(','));
    record('extract: private contentRules under/except are { repo, path } rows', 'rows', Array.isArray(prv.contentRules) && prv.contentRules[0] && hasRow(prv.contentRules[0].except || [], 'beacon', 'action') ? 'rows' : 'other', JSON.stringify(prv.contentRules));
    record('extract: public agentPolicy is brief and cap, no routes', 'brief,cap', pv.agentPolicy ? Object.keys(pv.agentPolicy).sort().join(',') : 'missing');
    record('extract: private agentPolicy carries routes', 'routes', prv.agentPolicy && prv.agentPolicy.routes && prv.agentPolicy.routes.default ? 'routes' : 'missing');
    record('extract: public values hold only allowlisted keys', 'allowlisted', Object.keys(pv).every((k) => ['frozenPaths', 'tombstonedPaths', 'secretExceptions', 'readCeilingBytes', 'readCeilingExempt', 'sourceExtensions', 'stopDocs', 'stopFromGit', 'stopBudgetSeconds', 'stopCard', 'forbidScheduling', 'blanketKill', 'loopBranchPrefix', 'loopLedgerGlobs', 'ask', 'boundedFiles', 'agentPolicy', 'lawIds'].includes(k)) ? 'allowlisted' : Object.keys(pv).join(','));
    record('extract: public carries the ask value and not its why', 'value', pv.ask && pv.ask.maxQuestions === 2 && !('why' in pv.ask) ? 'value' : JSON.stringify(pv.ask));
    record('extract: public carries no leakWords key', 'absent', 'leakWords' in pv ? 'present' : 'absent');
    // profile/ and memory/ never enter any output
    const sentences = ['PLANTED-PROFILE-SENTENCE', 'PLANTED-MEMORY-SENTENCE'];
    record('extract: no class carries a profile/ or memory/ sentence', 'none', [pub, shared, priv, full].some((r) => sentences.some((s) => r.text.includes(s))) ? 'leaked' : 'none');
    // brain_commit from git
    runGit(xb, ['init', '-q', '-b', 'main']);
    runGit(xb, ['add', '-A']);
    runGit(xb, ['commit', '-q', '-m', 'brain']);
    const head = gitOut(xb, ['rev-parse', 'HEAD']);
    const pubGit = extract(xb, 'public', 'public-git');
    record('extract: brain_commit is the brain HEAD when the brain is a repository', 'head', head && pubGit.json && pubGit.json.brain_commit === head ? 'head' : String(pubGit.json && pubGit.json.brain_commit), head);

    section('-- extract: refusals write nothing (rows 30, 31)');
    const token = 'github_pat_' + 'A'.repeat(60);
    const xbToken = cloneBrain('brain-token', (b) => { const c = cfgOf(b); c.stopDocs = [...c.stopDocs, token + '.md']; putCfg(b, c); });
    for (const cls of ['public', 'shared', 'private', 'full']) {
        const r = extract(xbToken, cls, `token-${cls}`);
        record(`extract: a planted github_pat_ value makes ${cls} exit 1 and write no file`, 'exit 1, no file', `exit ${r.code}, ${exists(r.outPath) ? 'file' : 'no file'}`, r.all);
        if (cls === 'public') {
            record('extract: the refusal names the pattern (github-pat)', 'named', like(r.err, '*github-pat*') ? 'named' : 'unnamed', r.err);
            record('extract: the refusal never prints the match', 'hidden', r.all.includes(token) ? 'printed' : 'hidden');
        }
    }
    const xbLeak = cloneBrain('brain-leak', (b) => { const c = cfgOf(b); c.stopDocs = [...c.stopDocs, 'NOTES-pelican-ledger.md']; putCfg(b, c); });
    for (const cls of ['public', 'shared', 'private']) {
        const r = extract(xbLeak, cls, `leak-${cls}`);
        record(`extract: a leak word from leakWords makes ${cls} exit 1 and write no file`, 'exit 1, no file', `exit ${r.code}, ${exists(r.outPath) ? 'file' : 'no file'}`, r.all);
    }
    const leakFull = extract(xbLeak, 'full', 'leak-full');
    record('extract: full is not scanned for leak words', 'written', written(leakFull), leakFull.all);
    // The overlay-id refusal (review finding 23): an overlay clause id typed inside a value that survives
    // into public and shared (here a stopDocs entry) refuses those two classes and writes no file; private
    // may carry the id. Red first in a scratch copy of the tool with the refusal disabled: public and
    // shared wrote the file and exited 0.
    const xbOvId = cloneBrain('brain-overlay-id', (b) => { const c = cfgOf(b); c.stopDocs = [...c.stopDocs, 'PRIV-01-notes.md']; putCfg(b, c); });
    for (const cls of ['public', 'shared']) {
        const r = extract(xbOvId, cls, `overlay-id-${cls}`);
        record(`extract: an overlay clause id in a stopDocs value makes ${cls} exit 1, no file`, 'exit 1, no file', `exit ${r.code}, ${exists(r.outPath) ? 'file' : 'no file'}`, r.all);
        record(`extract: the ${cls} refusal line says overlay clause id PRIV-01`, 'said', like(r.err, `*extract: refused: overlay clause id PRIV-01 found in the ${cls} output; nothing written*`) ? 'said' : 'silent', r.err);
    }
    const ovIdPriv = extract(xbOvId, 'private', 'overlay-id-private');
    record('extract: private may carry the overlay clause id in a stopDocs value (written)', 'written', written(ovIdPriv), ovIdPriv.all);
    // the gate on profile/ and memory/, through the config path that names the overlay (claims.json)
    const pointOverlay = (b, target) => {
        const claims = JSON.parse(readText(path.join(b, 'claims.json')));
        for (const c of claims.claims) if (c && typeof c.overlay === 'string') c.overlay = target;
        put(path.join(b, 'claims.json'), toJson(claims));
    };
    const xbProfile = cloneBrain('brain-gate-profile', (b) => pointOverlay(b, '${BRAIN}/profile/me.md'));
    const gp = extract(xbProfile, 'full', 'gate-profile');
    record('extract: a config path into profile/ is refused (exit 1, no file)', 'exit 1, no file', `exit ${gp.code}, ${exists(gp.outPath) ? 'file' : 'no file'}`, gp.all);
    record('extract: the profile/ refusal says so and prints no sentence', 'said', like(gp.err, '*refused*profile*') && !gp.all.includes('PLANTED-PROFILE-SENTENCE') ? 'said' : 'other', gp.err);
    const xbMemory = cloneBrain('brain-gate-memory', (b) => pointOverlay(b, '${BRAIN}/memory/secret-note.md'));
    const gm = extract(xbMemory, 'private', 'gate-memory');
    record('extract: a config path into memory/ is refused (exit 1, no file)', 'exit 1, no file', `exit ${gm.code}, ${exists(gm.outPath) ? 'file' : 'no file'}`, gm.all);
    record('extract: the memory/ refusal prints no sentence', 'hidden', gm.all.includes('PLANTED-MEMORY-SENTENCE') ? 'printed' : 'hidden');
    const gv = extract(xb, 'full', 'gate-voice', ['-Overlay', path.join(xb, 'instructions', 'voice.md')]);
    record('extract: -Overlay naming voice.md anywhere is refused', 'exit 1, no file', `exit ${gv.code}, ${exists(gv.outPath) ? 'file' : 'no file'}`, gv.all);
    put(path.join(xb, 'instructions', 'notes.md'), '# Notes heading\nPLANTED-NOTES-SENTENCE\n');
    const gn = extract(xb, 'full', 'gate-notes', ['-Overlay', path.join(xb, 'instructions', 'notes.md')]);
    record('extract: -Overlay naming a non-JSON file is could-not-look and prints none of its text', 'exit 2, no text', `exit ${gn.code}, ${gn.all.includes('# Notes he') || gn.all.includes('PLANTED-NOTES') ? 'text' : 'no text'}`, gn.all);
    const outInMemory = path.join(xb, 'memory', 'extract.json');
    const go = run(['-Brain', xb, '-Class', 'full', '-Out', outInMemory]);
    record('extract: -Out under memory/ is refused and nothing is written there', 'exit 1, no file', `exit ${go.code}, ${exists(outInMemory) ? 'file' : 'no file'}`, go.out + go.err);
    // could-not-look
    const empty = path.join(X, 'brain-empty');
    fs.mkdirSync(empty, { recursive: true });
    const ce = extract(empty, 'public', 'empty');
    record('extract: a brain with no doctor.config.json exits 2 and writes no file', 'exit 2, no file', `exit ${ce.code}, ${exists(ce.outPath) ? 'file' : 'no file'}`, ce.all);
    const cc = extract(xb, 'secret', 'bad-class');
    record('extract: an unknown class exits 2 and writes no file', 'exit 2, no file', `exit ${cc.code}, ${exists(cc.outPath) ? 'file' : 'no file'}`, cc.all);
    const nb = run(['-Class', 'public', '-Out', path.join(X, 'out', 'no-brain.json')]);
    record('extract: no -Brain exits 2', 2, nb.code, nb.out + nb.err);
    // A kit version that cannot be read is could-not-look (review finding 13): the header's kit_version is
    // what a later freshness check reads, so no extract carries an empty version as a fact. Planted: a kit
    // whose tools/vendor.json is not JSON (the version module throws), a folder with no VERSION and no
    // plugin.json, and a plugin.json that names no version. Red first: 'kit version unknown: ...', the
    // file written with kit_version "", exit 0.
    const kitNotJson = path.join(X, 'kit-not-json');
    put(path.join(kitNotJson, '.claude-plugin', 'plugin.json'), '{ "name": "planted", "version": "9.9.9" }\n');
    put(path.join(kitNotJson, 'tools', 'vendor.json'), 'not json\n');
    const kj = extract(xb, 'public', 'kit-not-json', ['-Kit', kitNotJson]);
    record('extract: a kit whose version cannot be read is could-not-look (exit 2), no file', 'exit 2, no file', `exit ${kj.code}, ${exists(kj.outPath) ? 'file' : 'no file'}`, kj.all);
    const kjLines = kj.err.split('\n').filter((l) => l.startsWith('extract: could not look: kit version unreadable: '));
    record('extract: it says so in one line: could not look: kit version unreadable: <why>', 'one line', kjLines.length === 1 ? 'one line' : `${kjLines.length} lines`, kj.err);
    const kitNone = path.join(X, 'kit-none');
    fs.mkdirSync(kitNone, { recursive: true });
    const kn = extract(xb, 'public', 'kit-none', ['-Kit', kitNone]);
    record('extract: a -Kit with no VERSION and no plugin.json is could-not-look (exit 2), no file', 'exit 2, no file', `exit ${kn.code}, ${exists(kn.outPath) ? 'file' : 'no file'}`, kn.all);
    const kitNoVersion = path.join(X, 'kit-no-version');
    put(path.join(kitNoVersion, '.claude-plugin', 'plugin.json'), '{ "name": "planted" }\n');
    put(path.join(kitNoVersion, 'tools', 'vendor.json'), toJson({ schema: 1, include: ['law.json'] }) + '\n');
    put(path.join(kitNoVersion, 'law.json'), '{ "clauses": [] }\n');
    const kv = extract(xb, 'public', 'kit-no-version', ['-Kit', kitNoVersion]);
    record('extract: a plugin.json that names no version is could-not-look (exit 2), no file', 'exit 2, no file', `exit ${kv.code}, ${exists(kv.outPath) ? 'file' : 'no file'}`, kv.all);
    // The line names the input as it is, never a wrong reason: a plugin.json that is not JSON is not one
    // that "has none", and a VERSION that is there but unreadable is not "no VERSION" (the version module
    // reads both as no version). Red first: '(.claude-plugin/plugin.json has none)' and 'has no VERSION'.
    const kitBadPlugin = path.join(X, 'kit-bad-plugin');
    put(path.join(kitBadPlugin, '.claude-plugin', 'plugin.json'), 'not json\n');
    put(path.join(kitBadPlugin, 'tools', 'vendor.json'), toJson({ schema: 1, include: ['law.json'] }) + '\n');
    put(path.join(kitBadPlugin, 'law.json'), '{ "clauses": [] }\n');
    const kbp = extract(xb, 'public', 'kit-bad-plugin', ['-Kit', kitBadPlugin]);
    // The checks read the reason, not one wording of it: a version module that throws on these inputs
    // names them its own way and still passes; a line that says "has none" or "has no VERSION" does not.
    record('extract: a plugin.json that is not JSON is could-not-look and the line says so, no file', 'said, no file', `${like(kbp.err, '*kit version unreadable:*plugin.json*') && !like(kbp.err, '*plugin.json has none)*') ? 'said' : 'unsaid'}, ${exists(kbp.outPath) ? 'file' : 'no file'}`, kbp.all);
    const kitBadVersion = path.join(X, 'kit-bad-version');
    put(path.join(kitBadVersion, 'VERSION'), '{ not json\n');
    const kbv = extract(xb, 'public', 'kit-bad-version', ['-Kit', kitBadVersion]);
    record('extract: a VERSION that is not readable is could-not-look and the line names VERSION, no file', 'said, no file', `${clike(kbv.err, '*kit version unreadable:*VERSION*') && !clike(kbv.err, '*has no VERSION and*') ? 'said' : 'unsaid'}, ${exists(kbv.outPath) ? 'file' : 'no file'}`, kbv.all);

    section('-- extract: the repository of a row (row 30)');
    const rp = extract(xb, 'public', 'repo-beacon', ['-Repo', 'beacon']);
    const rpFrozen = rows(rp, 'frozenPaths');
    record('extract: -Repo beacon keeps the beacon rows and drops the others', 'beacon-only', rp.code === 0 && hasRow(rpFrozen, 'beacon', '.') && !hasRow(rpFrozen, 'bench-lab', 'src') ? 'beacon-only' : 'other', JSON.stringify(rpFrozen) + rp.err);
    const xbDom = cloneBrain('brain-domains', (b) => {
        const c = cfgOf(b); c.categories = { folders: [], since: '' }; putCfg(b, c);
        put(path.join(b, 'control', 'domains.json'), toJson({ schema: 1, domains: [{ name: 'Alpha', folders: [], paths: ['trading/beacon'] }], repos: { 'tools/bench-lab': { what: 'a planted repository' } } }));
    });
    const dm = extract(xbDom, 'public', 'domains');
    const dmFrozen = rows(dm, 'frozenPaths');
    record('extract: a domains.json repository path names the repo (trading/beacon)', 'row', hasRow(dmFrozen, 'beacon', '.') ? 'row' : 'missing', JSON.stringify(dmFrozen) + dm.err);
    record('extract: a domains.json repos key names the repo (tools/bench-lab)', 'row', hasRow(dmFrozen, 'bench-lab', 'src') ? 'row' : 'missing', JSON.stringify(dmFrozen));
    const xbBare = cloneBrain('brain-bare', (b) => { const c = cfgOf(b); c.categories = { folders: [], since: '' }; putCfg(b, c); });
    const bare = extract(xbBare, 'public', 'bare');
    record('extract: with no domain map and no category folders the first segment is the repo', 'row', hasRow(rows(bare, 'frozenPaths'), 'trading', 'beacon') ? 'row' : 'missing', JSON.stringify(rows(bare, 'frozenPaths')));

    // A row naming the whole root (${ROOT} alone, or ${ROOT}/) is every repository's row (lead decision M25,
    // 2026-11-10): written as { repo: "*", path: "." } in every class, kept under -Repo, and a content rule
    // whose only under row is the root keeps it. The reader (hooks/lib/common.mjs) resolves "*" to the clone
    // it runs in. Red before: 'dropped (names the root)' for the row, 'dropped (no under row left)' for the rule.
    section("-- extract: a whole-root row is every repository's row (M25)");
    const xbRoot = cloneBrain('brain-root', (b) => { const c = cfgOf(b); c.frozenPaths = [...c.frozenPaths, '${ROOT}']; c.contentRules = [...c.contentRules, { id: 'ROOT-01', under: ['${ROOT}/'], pattern: 'planted_root_call\\(' }]; putCfg(b, c); });
    const rootPub = extract(xbRoot, 'public', 'root-public');
    const rootPriv = extract(xbRoot, 'private', 'root-private');
    const rootFull = extract(xbRoot, 'full', 'root-full');
    const rootRule = (r) => rows(r, 'contentRules').find((x) => x && x.id === 'ROOT-01');
    record('extract: a ${ROOT} row in frozenPaths is written as { repo: "*", path: "." } in public', 'row', hasRow(rows(rootPub, 'frozenPaths'), '*', '.') ? 'row' : 'missing', JSON.stringify(rows(rootPub, 'frozenPaths')) + rootPub.err);
    record('extract: the same ${ROOT} row is written as { repo: "*", path: "." } in full', 'row', hasRow(rows(rootFull, 'frozenPaths'), '*', '.') ? 'row' : 'missing', JSON.stringify(rows(rootFull, 'frozenPaths')) + rootFull.err);
    record('extract: a content rule under ${ROOT}/ keeps its under row as { repo: "*", path: "." } in private', 'row', rootRule(rootPriv) ? (hasRow(rootRule(rootPriv).under || [], '*', '.') ? 'row' : 'other') : 'rule dropped', JSON.stringify(rows(rootPriv, 'contentRules')) + rootPriv.err);
    record('extract: the same content rule keeps its under row as { repo: "*", path: "." } in full', 'row', rootRule(rootFull) ? (hasRow(rootRule(rootFull).under || [], '*', '.') ? 'row' : 'other') : 'rule dropped', JSON.stringify(rows(rootFull, 'contentRules')) + rootFull.err);
    record('extract: the stderr line says the root row is kept for every repository, and nothing is dropped as the root', 'kept', rootPriv.err.includes('extract: kept (every repository): ${ROOT}') && !rootPriv.err.includes('names the root') && !rootPriv.err.includes('no under row left') ? 'kept' : 'other', rootPriv.err);
    const rootRepo = extract(xbRoot, 'public', 'root-repo', ['-Repo', 'beacon']);
    record("extract: -Repo keeps the every-repository row beside that repository's rows", 'kept', hasRow(rows(rootRepo, 'frozenPaths'), '*', '.') && hasRow(rows(rootRepo, 'frozenPaths'), 'beacon', '.') ? 'kept' : 'dropped', JSON.stringify(rows(rootRepo, 'frozenPaths')) + rootRepo.err);
}
