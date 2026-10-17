// adopt-plan.mjs - turns templates + the adopter's answers into the list of files adopt.mjs writes.
// Imported by tools/adopt.mjs; never run directly. Pure: nothing here touches the disk except to
// READ templates, law.json and hooks/hooks.json.
//
// A planned item is { path, bytes, generated, note }. adopt.mjs decides, per item, whether the path
// is missing (write it) or present (print a diff, leave it).

import fs from 'node:fs';
import path from 'node:path';
import { readText, readJson, textBytes } from './df-files.mjs';
import { isUnder, relUnder } from '../../hooks/lib/common.mjs';

export function expandTemplate(text, tokens) {
    let t = text;
    for (const [k, v] of Object.entries(tokens)) t = t.split(`{{${k}}}`).join(String(v));
    const left = [...new Set([...t.matchAll(/\{\{[A-Z_]+\}\}/g)].map((m) => m[0]))];
    if (left.length) throw new Error(`template token(s) not filled: ${left.join(', ')}`);
    return t;
}

// The prohibitions block for the root CLAUDE.md: every SAFE clause in the kit's law.json, in full,
// in id order. Pulled from the source of truth so the entry file cannot drift from the law.
export function prohibitionsBlock(lawPath) {
    const law = readJson(lawPath);
    const safe = (law.clauses || []).filter((c) => String(c.group) === 'SAFE').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (safe.length === 0) throw new Error(`law.json has no SAFE clauses: ${lawPath}`);
    return safe.map((c) => `- **${c.id}** ${c.rule} *(grade ${c.grade})*`).join('\n');
}

// "<owner>/<name>" for the `claude plugin marketplace add` line, read from the kit's own marketplace
// manifest. Falls back to the first GitHub owner the adopter typed, then the owner name.
export function marketplaceSource(pluginRoot, gitHubOwners, ownerName) {
    const mp = path.join(pluginRoot, '.claude-plugin', 'marketplace.json');
    if (fs.existsSync(mp)) {
        try {
            const m = readJson(mp);
            const o = String(m.owner && m.owner.name ? m.owner.name : ''); const n = String(m.name ?? '');
            if (o && n) return `${o}/${n}`;
        } catch { /* fall back */ }
    }
    const fallback = gitHubOwners.length > 0 ? gitHubOwners[0] : ownerName.replace(/\s+/g, '-');
    return `${fallback}/design-first`;
}

// Frozen paths are stored absolute or ${ROOT}-relative (SPEC 5.3). A typed path under root becomes
// ${ROOT}-relative, with forward slashes, so the config survives a root move and reads the same on
// every system; anything else is kept as typed.
export function toConfigPath(p, root) {
    const s = String(p).trim();
    if (!s) return null;
    if (s.startsWith('${ROOT}')) return s;
    let full;
    try { full = path.resolve(root, s); } catch { return s; }
    if (isUnder(full, root) && relUnder(full, root) !== '') return '${ROOT}/' + relUnder(full, root).replace(/\\/g, '/');
    return full;
}

// Every hook script the kit's hooks.json registers, read from that file and never typed (VCS-15):
// name -> the script exists under hooks/. adopt.mjs records it in state/law-installed.json, and the
// law build grades each clause that rests on a hook from it (tools/law/render.mjs).
export function registeredHooks(kit) {
    const text = readText(path.join(kit, 'hooks', 'hooks.json'));
    const names = [...new Set([...text.matchAll(/hooks[\\/]+([A-Za-z0-9_-]+)\.mjs/g)].map((m) => m[1]))].sort();
    return Object.fromEntries(names.map((n) => [n, fs.existsSync(path.join(kit, 'hooks', `${n}.mjs`))]));
}

function doctorConfig(templatePath, gitHubOwners, frozenPaths, snapshotPairs) {
    const cfg = readJson(templatePath);
    cfg.ownerRemotePatterns = gitHubOwners.map((o) => `github.com/${o}/`);
    cfg.frozenPaths = frozenPaths;
    cfg.entryPointSnapshots = snapshotPairs;
    return JSON.stringify(cfg, null, 2) + '\n';
}

// Every file adopt writes except LAW.md (generated afterwards), the snapshots (byte copies of live
// files, taken after the writes) and the pointer (outside root and brain).
export function newPlan({ kit, root, brain, ownerName, gitHubOwners, frozenPaths, settingsTarget, snapshotPairs, brainIsRepo, today }) {
    const tpl = path.join(kit, 'templates');
    const tokens = {
        OWNER_NAME: ownerName, ROOT: root, BRAIN: brain,
        PROHIBITIONS: prohibitionsBlock(path.join(kit, 'law.json')),
        MARKETPLACE_SOURCE: marketplaceSource(kit, gitHubOwners, ownerName),
        DATE: today,
    };
    const plan = [];
    const add = (target, text, note) => plan.push({ path: target, bytes: textBytes(text, target), generated: false, note });
    const fill = (name) => expandTemplate(readText(path.join(tpl, name)), tokens);
    const copy = (name) => readText(path.join(tpl, name));

    // root
    add(path.join(root, 'CLAUDE.md'), fill('root-CLAUDE.md'), 'entry point; prohibitions in full');
    add(settingsTarget, copy('root-settings.json'), 'kit deny/ask rules (SPEC 5.8)');

    // brain, personal layer
    add(path.join(brain, 'me.md'), fill('me.md'), 'who the owner is; owner.name feeds the guard');
    add(path.join(brain, 'voice.md'), fill('voice.md'), "how the owner's copy reads");
    add(path.join(brain, 'prohibitions.md'), fill('prohibitions.md'), "the owner's own hard rules (overlay owning file)");
    add(path.join(brain, 'law.overlay.json'), copy('law.overlay.json'), 'overlay: empty clauses, empty overrides');
    add(path.join(brain, 'lessons.md'), fill('lessons.md'), 'lessons -> clauses');
    add(path.join(brain, 'canonical.md'), fill('canonical.md'), 'one subject, one file');
    // The brain is a project, and DES-01 applies to it: it carries its own manifest and map, so the
    // Doctor's manifest scan is not RED on the adopter's first run (fix list, chunk 10, row 1).
    add(path.join(brain, 'DECISIONS.md'), fill('brain-DECISIONS.md'), "the brain's own manifest (DES-01)");
    add(path.join(brain, 'ARCHITECTURE.md'), fill('brain-ARCHITECTURE.md'), "the brain's own map (DES-01)");

    // brain, Doctor contract
    add(path.join(brain, 'claims.json'), copy('claims.json'), 'claims; BRAIN-POINTER-01');
    add(path.join(brain, 'doctor.config.json'), doctorConfig(path.join(tpl, 'doctor.config.json'), gitHubOwners, frozenPaths, snapshotPairs), 'Doctor config; owners, frozen paths, snapshot pairs filled');
    add(path.join(brain, 'entry.json'), copy('entry.json'), 'the entry path');
    add(path.join(brain, 'agent-policy.json'), copy('agent-policy.json'), 'subagent brief contract, model routes, spawn cap (DES-11)');
    add(path.join(brain, 'route-policy.json'), copy('route-policy.json'), 'law routed per prompt: words per group, folders, subagent defaults (DES-13)');
    add(path.join(brain, 'Doctor.bat'), copy('Doctor.bat'), 'Windows shim; resolves the kit through the pointer');
    add(path.join(brain, 'doctor.sh'), copy('doctor.sh'), 'Linux and macOS shim; resolves the kit through the pointer');
    add(path.join(brain, 'instructions', 'README.md'), '# instructions\n\nOwning files for overlay clauses (`brain:instructions/<file>.md`) live here. A kit file that moved into the brain leaves a one-line forwarding stub here, never a deletion, while anything still reads the old path.\n', 'owning files for overlay clauses');

    if (brainIsRepo) {
        add(path.join(brain, '.gitattributes'), copy('gitattributes'), 'the repo decides its bytes, not core.autocrlf');
        add(path.join(brain, '.gitignore'), 'state/\n', 'state/ is generated (installed.json, heartbeat, Doctor output)');
    }
    return plan;
}
