// enforcement.mjs - re-derive what is ACTUALLY wired, from the machine (SURVEY band). READ-ONLY.
// Reads the kit's hooks/hooks.json (where the hooks are registered), the root settings files
// (where the deny/ask rules live) and the fence log. It overrides whatever any document claims.
//
// Config read here: enforcement.fenceLogStaleDays (SPEC 5.3). Everything else is derived.

import fs from 'node:fs';
import { getLeaf, readText, parseJson, parseIso } from '../../hooks/lib/common.mjs';
import { roundEven, DAY, splitCommandLine, SCRIPT_EXT_RX } from './util.mjs';

function readJsonFile(p) {
    try { return { doc: parseJson(readText(p)), problem: '' }; } catch (e) { return { doc: null, problem: e.message }; }
}

export function enforcementFacts(cfg, derived, ctx) {
    const result = {
        hooksJsonPath: derived.hooksJsonPath,
        hooksJsonExists: fs.existsSync(derived.hooksJsonPath),
        hooks: [],
        settingsPaths: derived.settingsPaths,
        settingsFound: [],
        denyRules: 0, askRules: 0, softDenyTotal: 0, softDenyFrozen: 0,
        fenceLogPath: derived.fenceLogPath, fenceLogExists: false, fenceTrips: 0, fenceLastTrip: '', fenceStaleDays: null,
        couldNotLook: [], findings: [],
    };

    // --- hooks, as registered by the plugin
    if (result.hooksJsonExists) {
        const { doc, problem } = readJsonFile(derived.hooksJsonPath);
        if (doc == null) result.couldNotLook.push(`hooks.json could not be parsed: ${problem}`);
        else if (doc.hooks) {
            for (const [event, entries] of Object.entries(doc.hooks)) {
                for (const entry of Array.isArray(entries) ? entries : [entries]) {
                    for (const h of Array.isArray(entry && entry.hooks) ? entry.hooks : []) {
                        // The script a registered command runs: the first word that ends in a script extension.
                        const words = Array.isArray(h.args) && h.args.length ? h.args.map(String) : splitCommandLine(String(h.command ?? ''));
                        const word = words.map((w) => w.split('${CLAUDE_PLUGIN_ROOT}').join(ctx.pluginRoot)).find((w) => SCRIPT_EXT_RX.test(w));
                        const script = word || '';
                        const exists = script !== '' && fs.existsSync(script) && fs.statSync(script).isFile();
                        result.hooks.push({ event, matcher: String(entry.matcher ?? ''), script, exists, form: Array.isArray(h.args) && h.args.length ? 'args' : 'command' });
                        if (script !== '' && !exists) {
                            result.findings.push({ severity: 'fail', kind: 'hookMissing', path: script, message: `hook REGISTERED BUT MISSING: ${script} (${event}) - hooks.json calls a file that is not there` });
                        }
                    }
                }
            }
        }
    } else {
        result.findings.push({ severity: 'fail', kind: 'hooksJsonMissing', path: derived.hooksJsonPath, message: `no hooks.json at ${derived.hooksJsonPath} - no hook is registered; the plugin root in the pointer may be wrong` });
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
