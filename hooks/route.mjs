// route.mjs - injects the law groups the prompt's words and the working folder name, once per session, plus the groups every session gets (DES-13).
//
// Instead of demanding the whole rule set at session start, each prompt is matched against the
// brain's route policy (keywords per law group, plus the working folder). A group that becomes
// active is injected ONCE per session as its rows from the generated LAW.md, with the owning files
// named for the full text; later prompts in the same session add only groups not yet active.
// Routes stick: a session about a game stays a game session when the next prompt is "yes please".
// entry.mjs clears the session's route file on a compaction or a clear, so the next prompt re-injects.
//
// Output is plain stdout (the host adds it as context), capped under the host's 10,000-character
// limit by the policy's maxChars. A group that does not fit is not recorded. When another group
// printed, the printed line names it and says to mention the topic again; when no group fits, no
// group is named. Nothing stores it: an always or folder group comes again on the next prompt, a
// word group only when a later prompt holds its words. Measured on the first
// instance before this hook existed: the eight-file entry path was ~35k tokens if read; a group's
// rows are 150-900 tokens; routes that stick covered 91% of 1,985 prompts.
//
// Failure policy: an internal error prints nothing law-shaped, logs an ERROR line and says so. The
// turn reset runs before the libraries load, so a failure after it cannot leave the last turn's
// record and time for the Stop card.
//
// anchor: route-law  mode: advise  verbs: route-law
//
// always-route (OWN-10, CR-2026-10-14-OPTIONS): the groups the policy lists in alwaysForSessions
// join the matches of every prompt, whatever its words and folder. They go first, so the size cap
// defers a topic group before one of them (a policy that lists several large always groups can still
// defer the later ones); the route file keeps them to once per session, and a compaction or a clear
// clears it, so they arrive again after one. A rule about how every decision is asked and researched has no
// topic word to route on: before this key, no OWN row reached any session by route.
//
// anchor: always-route  mode: advise  verbs: rank
//
// skills (DES-12, CR-2026-10-13-HONOUR): the same prompt is matched against the installed skills,
// read from the skills directories themselves (root/.claude/skills and the profile's), never from
// a list in a law file. A skill whose name or description shares a whole word with the typed text
// is named once per session, with its path, so the task meets the skill before a build from nothing.
// It counts as named only when its line printed: a block that does not fit under the cap is named
// by a later prompt that matches it, and when no new group prints, the skills print alone.
//
// anchor: skills  mode: advise  verbs: match-skill
//
// writer-skip (owner ruling 29, 2026-10-20; kit-next batch entry 1): a work session answers its master
// tersely, so the law that is about talking to the owner must not reach it. The session's FIRST prompt
// decides: "Reports to:" at the start of a line (a brief) marks the session a writer in <session>.role;
// any other first prompt marks it an owner session, and a later "Reports to:" changes nothing. For a
// writer, the policy's writerSkip { groups, clauses } is dropped: a group whole, a clause as one row
// of its group (the rest of the group still prints). entry.mjs deletes the mark on a clear (a new
// conversation) and keeps it through a compaction. No key, or an empty one: nothing is dropped.
//
// anchor: writer-skip  mode: advise  verbs: route-law

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStdin, isoNow } from './lib/stdin.mjs';

const STOP_WORDS = ['about', 'after', 'again', 'build', 'change', 'check', 'could', 'every', 'first', 'their', 'there', 'these', 'thing', 'think', 'those', 'under', 'where', 'which', 'while', 'would', 'should', 'please', 'start', 'write', 'update', 'maybe', 'really', 'right', 'something'];
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function skillMatches(C, prompt, root, sessionId) {
    const words = [...new Set([...prompt.toLowerCase().matchAll(/[a-z][a-z-]{4,}/g)].map((m) => m[0]).filter((w) => !STOP_WORDS.includes(w)))];
    if (words.length === 0) return [];
    const dirs = [];
    if (root) dirs.push(path.join(root, '.claude', 'skills'));
    dirs.push(path.join(C.homeDir(), '.claude', 'skills'));
    const seenFile = C.sessionFile(sessionId, '.skills');
    const seen = C.isFile(seenFile) ? C.readText(seenFile).split(/\r?\n/) : [];
    const hits = [];
    for (const d of dirs) {
        if (!C.isDir(d)) continue;
        let entries = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() || (e.isSymbolicLink() && C.isDir(path.join(d, e.name)))); } catch { entries = []; }
        entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'accent' }));
        for (const skill of entries) {
            const md = path.join(d, skill.name, 'SKILL.md');
            if (!C.isFile(md)) continue;
            if (seen.includes(skill.name)) continue;
            const head = C.readText(md).split(/\r?\n/).slice(0, 40);
            let name = skill.name; let desc = '';
            for (const l of head) {
                let m;
                if ((m = /^name:\s*(.+)$/i.exec(l))) name = m[1].trim();
                else if ((m = /^description:\s*(.+)$/i.exec(l))) desc = m[1].trim();
            }
            const hay = (name.replace(/[-_]/g, ' ') + ' ' + desc).toLowerCase();
            const matched = words.filter((w) => new RegExp('(?<![a-z])' + escRx(w) + '(?![a-z])', 'i').test(hay));
            if (matched.length === 0) continue;
            const short = desc.length > 140 ? desc.slice(0, 140).trimEnd() + '...' : desc;
            hits.push({ name: skill.name, desc: short, path: md, words: matched });
            if (hits.length >= 5) break;
        }
        if (hits.length >= 5) break;
    }
    return hits;
}

try {
    const raw = readStdin();
    let j = null;
    if (raw.trim()) { try { j = JSON.parse(raw); } catch { j = null; } }
    let prompt = j && typeof j.prompt === 'string' ? j.prompt : j && j.prompt != null ? String(j.prompt) : '';
    const sessionId = j && j.session_id ? String(j.session_id) : 'unknown';

    // A prompt from the owner is a turn boundary: the guard's edit ledger, its list of nominated
    // repositories and its failure count start over, and the time is written down, so stop.mjs can ask
    // git what changed since (lib/turn-changes.mjs). A background-task notice is NOT a boundary. The
    // host hands it to this hook as a prompt in the middle of a turn; taking it for one made the card
    // forget every edit before it. Seen 2026-10-08: two notices in one turn, each one routed as if typed.
    // Workaround (CR-2026-10-15-GAPS D5): the reset ran after the libraries loaded, so a library that
    // failed to load left the last turn's record and time in place, and the card judged this turn by
    // them. It runs first now, on inline paths with the names sessionFile gives.
    const isNotice = /<task-notification>[\s\S]*?<\/task-notification>/i.test(prompt);
    if (!isNotice) {
        const markerDir = process.env.DF_MARKER_DIR || path.join(os.tmpdir(), 'design-first');
        const safeId = sessionId.replace(/[^A-Za-z0-9_.-]/g, '_');
        for (const ext of ['.edits', '.repos', '.guard-error']) {
            try { fs.rmSync(path.join(markerDir, safeId + ext), { force: true }); } catch { /* gone already */ }
        }
        fs.mkdirSync(markerDir, { recursive: true });
        fs.writeFileSync(path.join(markerDir, safeId + '.turn'), isoNow() + '\n', 'utf8');
    }

    const C = await import('./lib/common.mjs');
    const L = await import('./lib/law-rows.mjs');
    const cwd = j && j.cwd ? C.toFullPath(String(j.cwd)) : process.cwd();

    if (!C.isBlank(prompt)) {
        // The host can attach reminder blocks (skills lists, instructions) to the prompt it hands over.
        // Those carry words like page, review, log and gate that are not the owner's; match the typed
        // text only. Seen 2026-10-08: the first prompt after a restart routed four groups it never named.
        // A task notice carries the words of a command description; they are not the owner's either.
        prompt = prompt.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ');
        prompt = prompt.replace(/<task-notification>[\s\S]*?<\/task-notification>/gi, ' ');

        // The role is decided once, on the session's first prompt, before any group is chosen.
        const roleFile = L.roleFile(sessionId);
        if (!C.isFile(roleFile)) C.addTextLine(roleFile, /^Reports to:/m.test(prompt) ? 'writer' : 'owner');
        const writer = L.isWriterSession(sessionId);

        const ptr = C.readPointer();
        if (ptr.pointer != null) {           // no brain: the entry hook already said so
            const kit = L.kitRoot(ptr);
            const pol = L.readRoutePolicy(ptr, kit);
            const policy = pol.policy;
            const maxChars = L.policyMaxChars(policy);

            let matched = L.matchedGroups(policy, prompt, cwd, ptr.root);
            const alwaysRaw = L.prop(policy, 'alwaysForSessions');
            const always = (Array.isArray(alwaysRaw) ? alwaysRaw : alwaysRaw == null ? [] : [alwaysRaw]).filter((g) => !C.isBlank(g)).map(String);
            matched = [...always, ...matched.filter((g) => !always.includes(g))];
            const active = L.readActiveRoutes(sessionId);
            const skip = writer ? L.writerSkip(policy) : L.writerSkip(null);
            const fresh = matched.filter((g) => !active.includes(g) && !L.skipsGroup(skip, g));

            // skills (DES-12): named once per session each, after the law rows when there are any. A skill is
            // marked as named (<session>.skills) only after its line printed. Workaround (CR-2026-10-15-GAPS
            // D5): the match marked every hit before anything printed, so a skill block that did not fit
            // under the cap, or a prompt whose new groups all failed to print, lost the skill for the session.
            const skillHits = skillMatches(C, prompt, ptr.root, sessionId);
            let skillText = '';
            if (skillHits.length > 0) {
                skillText = 'design-first skills (DES-12): the task may match an installed skill; read it before building from nothing.\n' +
                    skillHits.map((h) => `  - ${h.name}: ${h.desc}  (${h.path})`).join('\n');
            }
            const skillFile = C.sessionFile(sessionId, '.skills');
            const markSkills = () => { for (const h of skillHits) C.addTextLine(skillFile, h.name); };
            if (fresh.length === 0) {
                if (skillText) { process.stdout.write(skillText + '\n'); markSkills(); }
            } else {
                const law = L.lawPath(ptr, kit);
                const groups = L.readLawGroups(law);
                // The folders the full-text paths are relative to, once; it counts against the cap.
                let out = L.lawFoldersLine(ptr, kit) + '\n\n';
                const injected = []; const deferred = [];
                for (const g of fresh) {
                    const grp = L.findGroup(groups, g);
                    if (!grp) { C.writeLog('WARN', 'route', `policy names group '${g}' which ${law} does not have`); continue; }
                    const shown = L.withoutClauses(grp, skip);
                    if (shown.rows.length === 0) continue;       // every row skipped: nothing to print, nothing recorded
                    const text = L.formatLawGroup(g, shown, ptr, kit);
                    if (out.length + text.length + 2 > maxChars) { deferred.push(g); continue; }
                    out += text + '\n\n';
                    injected.push(g);
                }
                if (injected.length > 0) {
                    C.addTextLine(L.routeFile(sessionId), injected.join('\n'));
                    const src = pol.fromBrain ? pol.source : `${pol.source} (kit template; no brain route-policy.json)`;
                    out += `design-first route: ${injected.join(', ')} now active this session (policy ${src}); index ${law}.\n`;
                    if (deferred.length > 0) out += `Not injected yet, over the size cap: ${deferred.join(', ')}. Mention the topic again, or open the index.\n`;
                    const skillsFit = skillText && out.length + skillText.length + 2 <= maxChars;
                    if (skillsFit) out += '\n' + skillText + '\n';
                    process.stdout.write(out.trimEnd() + '\n');
                    // A skill block that did not fit is not marked, so a later prompt that matches it names it.
                    if (skillsFit) markSkills();
                } else if (skillText) {
                    // No new group printed (each was over the cap or missing from LAW.md): the skills print alone.
                    process.stdout.write(skillText + '\n');
                    markSkills();
                }
            }
        }
    }
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR route ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(`design-first route hook hit an internal error and injected no law this prompt: ${msg}. Logged to the design-first hooks log.\n`);
}
process.exitCode = 0;
