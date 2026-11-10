// enforcement.mjs - re-derive what is ACTUALLY wired, from the machine (SURVEY band). READ-ONLY.
// Reads the hook registrations (the kit's hooks/hooks.json in the plugin form; the root's
// .claude/settings.json in the vendored form, under -Scope brain or when the kit carries no
// hooks.json: context.mjs registrationSource), the root settings files (where the deny/ask rules
// live) and the fence log. It overrides whatever any document claims.
//
// Config read here: enforcement.fenceLogStaleDays (SPEC 5.3). Everything else is derived.

import fs from 'node:fs';
import { getLeaf, readText, parseJson, parseIso } from '../../hooks/lib/common.mjs';
import { registrationSource, expandHookCommand } from './context.mjs';
import { roundEven, DAY, splitCommandLine, SCRIPT_EXT_RX } from './util.mjs';

function readJsonFile(p) {
    try { return { doc: parseJson(readText(p)), problem: '' }; } catch (e) { return { doc: null, problem: e.message }; }
}

export function enforcementFacts(cfg, derived, ctx) {
    // Where the registrations are read from (0.3.0): hooks.json in the plugin form, the root's
    // .claude/settings.json in the vendored form; which one, and why neither when neither is there.
    const source = registrationSource(ctx, derived);
    const result = {
        hooksJsonPath: derived.hooksJsonPath,
        hooksJsonExists: fs.existsSync(derived.hooksJsonPath),
        registrationPath: source.path,
        registrationForm: source.form,
        hooks: [],
        settingsPaths: derived.settingsPaths,
        settingsFound: [],
        denyRules: 0, askRules: 0, softDenyTotal: 0, softDenyFrozen: 0,
        fenceLogPath: derived.fenceLogPath, fenceLogExists: false, fenceTrips: 0, fenceLastTrip: '', fenceStaleDays: null,
        couldNotLook: [], findings: [],
    };

    // --- hooks, as registered: hooks.json (the plugin form) or the root settings file (the vendored form)
    const record = source.form === 'plugin' ? 'hooks.json' : '.claude/settings.json';
    if (source.exists) {
        const { doc, problem } = readJsonFile(source.path);
        if (doc == null) result.couldNotLook.push(`${record} could not be parsed: ${problem}`);
        else {
            for (const [event, entries] of Object.entries(doc.hooks && typeof doc.hooks === 'object' ? doc.hooks : {})) {
                for (const entry of Array.isArray(entries) ? entries : [entries]) {
                    for (const h of Array.isArray(entry && entry.hooks) ? entry.hooks : []) {
                        // The script a registered command runs: the first word that ends in a script extension,
                        // its root variable expanded (${CLAUDE_PLUGIN_ROOT} as the kit, ${CLAUDE_PROJECT_DIR} as the root).
                        const words = Array.isArray(h.args) && h.args.length ? h.args.map(String) : splitCommandLine(String(h.command ?? ''));
                        const word = words.map((w) => expandHookCommand(w, ctx)).find((w) => SCRIPT_EXT_RX.test(w));
                        const script = word || '';
                        const exists = script !== '' && fs.existsSync(script) && fs.statSync(script).isFile();
                        result.hooks.push({ event, matcher: String(entry.matcher ?? ''), script, exists, form: Array.isArray(h.args) && h.args.length ? 'args' : 'command' });
                        if (script !== '' && !exists) {
                            result.findings.push({ severity: 'fail', kind: 'hookMissing', path: script, message: `hook REGISTERED BUT MISSING: ${script} (${event}) - ${record} calls a file that is not there` });
                        }
                    }
                }
            }
            // A record that parses and registers nothing is the same silence as a missing one (SAFE-04):
            // a settings file written with no hooks block (adopt -Vendor false, an attach that kept a
            // 0.2.x file, a hand-written one) is there, so nothing else would say that no hook loads.
            if (result.hooks.length === 0) {
                const render = `node <kit>/tools/settings.mjs ${source.form === 'vendored' ? '-Vendored' : '-Plugin'} -Out ${source.path}`;
                result.findings.push({ severity: 'fail', kind: 'hooksJsonMissing', path: source.path, message: `no hooks block in ${source.path} - no hook is registered; render the registrations into it (${render})` });
            }
        }
    } else {
        // Neither record is there: the message names every file that could have been it. A vendored
        // kit with no settings file never had its registrations rendered.
        const render = `the vendored kit's registrations were never rendered (node <kit>/tools/settings.mjs -Vendored -Out ${derived.settingsPath || '<root>/.claude/settings.json'})`;
        const fix = source.form === 'vendored' ? render : derived.settingsPath ? `the plugin root in the pointer may be wrong, or ${render}` : 'the plugin root in the pointer may be wrong';
        result.findings.push({ severity: 'fail', kind: 'hooksJsonMissing', path: source.path, message: `${source.why} - no hook is registered; ${fix}` });
    }

    // --- root settings: deny / ask rules (SPEC 5.8) and soft_deny vs frozenPaths
    for (const sp of result.settingsPaths) {
        if (!fs.existsSync(sp)) continue;
        const { doc: s, problem } = readJsonFile(sp);
        if (s == null) { result.couldNotLook.push(`settings could not be parsed: ${sp} (${problem})`); continue; }
        result.settingsFound.push(sp);
        const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
        if (s.permissions) {
            result.denyRules += list(s.permissions.deny).length;
            result.askRules += list(s.permissions.ask).length;
        }
        if (s.autoMode && s.autoMode.soft_deny) {
            for (const d of list(s.autoMode.soft_deny)) {
                if (typeof d !== 'string') continue;
                result.softDenyTotal++;
                // Counted against the brain's frozenPaths, never against a fixed folder name.
                for (const fp of cfg.frozenPaths) {
                    const leaf = getLeaf(fp);
                    if (leaf && d.toLowerCase().includes(leaf.toLowerCase())) { result.softDenyFrozen++; break; }
                }
            }
        }
    }
    if (result.settingsPaths.length > 0 && result.settingsFound.length === 0) {
        result.findings.push({ severity: 'fail', kind: 'rootSettingsMissing', path: result.settingsPaths[0], message: `no root settings: neither ${result.settingsPaths[0]} nor settings.local.json exists - the deny/ask rules are not installed (run /design-first:adopt)` });
    } else if (result.settingsFound.length > 0 && result.denyRules === 0) {
        result.findings.push({ severity: 'warn', kind: 'noDenyRules', path: result.settingsFound[0], message: `root settings carry 0 deny rules - the Read(**/.env) hygiene rules are absent (${result.settingsFound[0]})` });
    }

    // --- fence log: absent = "no trips yet", REPORTED, never RED (SPEC 7)
    result.fenceLogExists = fs.existsSync(result.fenceLogPath);
    if (result.fenceLogExists) {
        try {
            const lines = readText(result.fenceLogPath).split(/\r?\n/).filter((l) => /\S/.test(l));
            result.fenceTrips = lines.length;
            const stamped = lines.filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
            if (stamped.length > 0) {
                result.fenceLastTrip = stamped[stamped.length - 1].split(/\s\s/)[0].trim();
                const dt = parseIso(result.fenceLastTrip);
                if (dt != null) {
                    result.fenceStaleDays = roundEven((Date.now() - dt) / DAY);
                    if (result.fenceStaleDays > Number(cfg.enforcement.fenceLogStaleDays)) {
                        result.findings.push({ severity: 'warn', kind: 'fenceStale', path: result.fenceLogPath, message: `fence hook has not fired in ${result.fenceStaleDays} days - it may be wired but dead` });
                    }
                }
            }
        } catch { result.couldNotLook.push(`fence log could not be read: ${result.fenceLogPath}`); }
    } else {
        result.findings.push({ severity: 'info', kind: 'fenceNoTrips', path: result.fenceLogPath, message: `fence log: no trips yet (${result.fenceLogPath} does not exist)` });
    }
    return result;
}
