// selftest-config.mjs - the config contract cases of the Doctor self-test (SPEC 5.3).
// Imported by selftest.mjs and run after run A, with its helpers and run A's result. It is its own
// file because selftest.mjs is at the split line.
//
// Two tables in context.mjs must agree: CONFIG_READERS (the keys that are live) and defaultConfig()
// (the object a config file is read onto). 0.1.17 added two keys to the first and not to the second.
// Every brain that set one crashed in config load with exit 1, which reads as RED when the truth is
// could-not-look. The fixture carried both keys, so run A did fail; these cases name the cause in one
// line, and catch a key the fixture does not carry.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function configCases(t, a) {
    const { T, root, brain, kit, here, kitRoot, ok, bad, has, hasNot, WJ, newDir } = t;

    // ---- run A: what the report prints for dead and live keys
    hasNot('A: config load did not crash on a key the fixture sets', a.out, 'Cannot read properties');
    has('A: dead config key reported', a.out, 'dead config key: gitTimeoutSeconds');
    has('A: the retired splitLines key is reported, not read (CR-2026-10-15-SPLIT)', a.out, 'dead config key: splitLines');
    has('A: the splitLines finding names its successor', a.out, 'the read check is readCeilingBytes');
    for (const live of ['readCeilingBytes', 'readCeilingExempt', 'sourceExtensions', 'stopDocs', 'stopFromGit', 'forbidScheduling', 'contentRules', 'lawClaim', 'categories']) {
        hasNot(`A: ${live} has a reader outside the Doctor, not a dead key`, a.out, `dead config key: ${live}`);
    }

    // ---- the two tables, read in this process
    const X = await import(pathToFileURL(path.join(here, 'context.mjs')).href);
    const readers = X.CONFIG_READERS;
    const def = X.defaultConfig();
    const defaultKeys = Object.keys(def);
    const noDefault = Object.keys(readers).filter((k) => !defaultKeys.includes(k));
    const noReader = defaultKeys.filter((k) => !(k in readers));
    if (noDefault.length === 0) ok(`config: every reader key has a default (${Object.keys(readers).length} keys)`); else bad('config: every reader key has a default', `in CONFIG_READERS, not in defaultConfig: ${noDefault.join(', ')}`);
    if (noReader.length === 0) ok('config: every default key has a reader'); else bad('config: every default key has a reader', `in defaultConfig, not in CONFIG_READERS: ${noReader.join(', ')}`);

    const dir = newDir(path.join(T, 'config-cases'));
    const ctxT = { root, brain, kit, base: brain };

    // A config that sets every live key, the two hook switches turned on as an adopter would.
    const all = {};
    for (const k of Object.keys(readers)) all[k] = def[k];
    all.forbidScheduling = true;
    all.contentRules = [{ id: 'T-RULE', under: ['${ROOT}/scan'], pattern: 'planted_call\\(' }];
    const allPath = path.join(dir, 'all-keys.json'); WJ(allPath, all);
    let r = null; let threw = '';
    try { r = X.readDoctorConfig(allPath, ctxT); } catch (e) { threw = e.message; }
    if (!threw && r.ok) ok('config: a file that sets every live key loads'); else bad('config: a file that sets every live key loads', `threw: '${threw}' error: '${r && r.error}'`);
    if (r && r.deadKeys.length === 0) ok('config: no live key is reported dead'); else bad('config: no live key is reported dead', r ? r.deadKeys.join(', ') : '');
    if (r && r.cfg.forbidScheduling === true) ok('config: forbidScheduling true is read as set'); else bad('config: forbidScheduling', String(r && r.cfg.forbidScheduling));
    if (r && [].concat(r.cfg.contentRules).length === 1 && r.cfg.contentRules[0].id === 'T-RULE') ok('config: contentRules is read as set'); else bad('config: contentRules', `${r ? [].concat(r.cfg.contentRules).length : 0} rule(s)`);

    // A file that sets neither switch reads them as off, never as missing.
    const barePath = path.join(dir, 'bare.json'); WJ(barePath, { schema: 1 });
    const b0 = X.readDoctorConfig(barePath, ctxT);
    if (b0.ok && b0.cfg.forbidScheduling === false && [].concat(b0.cfg.contentRules).length === 0) ok('config: both switches default to off'); else bad('config: switch defaults', `forbidScheduling=${b0.cfg.forbidScheduling} contentRules=${[].concat(b0.cfg.contentRules).length}`);

    // The kit's own template sets only live keys, each with its _readers entry: adopt copies it into
    // every new brain, so a key the hooks read and this Doctor does not know is reported dead there
    // (CR-2026-10-15-GAPS D5 added stopBudgetSeconds to the template, both tables and _readers).
    const tpl = X.readDoctorConfig(path.join(kitRoot, 'templates', 'doctor.config.json'), ctxT);   // the real kit's template; kit is the fixture kit
    if (tpl.ok && tpl.deadKeys.length === 0) ok('config: the kit template sets no dead key'); else bad('config: the kit template sets no dead key', `ok=${tpl.ok} error='${tpl.error}' dead: ${tpl.deadKeys.join(', ')}`);

    // Planted: a live key with no default. The read must not throw (the comment on readDoctorConfig says so).
    readers.plantedNoDefault = 'selftest-config.mjs (planted: a reader key with no default)';
    try {
        const plantPath = path.join(dir, 'planted.json'); WJ(plantPath, { schema: 1, plantedNoDefault: ['x', 'y'] });
        let p = null; threw = '';
        try { p = X.readDoctorConfig(plantPath, ctxT); } catch (e) { threw = e.message; }
        if (!threw && p.ok && [].concat(p.cfg.plantedNoDefault).length === 2) ok('config: a live key with no default loads, it does not throw'); else bad('config: a live key with no default loads', `threw: '${threw}'`);
    } finally { delete readers.plantedNoDefault; }
}
