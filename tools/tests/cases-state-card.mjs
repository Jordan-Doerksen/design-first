// cases-state-card.mjs - hook self-test cases for the state card (GAME-13) and the hand-off card
// (DES-14). Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.

import fs from 'node:fs';
import path from 'node:path';

export default function stateCardCases(t) {
    const { kit, brain, root, repoClean, record, section, like, clike, jp, put, readText, newRepo, runGit, entry } = t;

    // ------------------------------------------------------------------ 7. the state card (GAME-13): entry.mjs + lib/state-card.mjs
    // A brain route policy that maps the folder `games` to the GAME group, and three things under it:
    // a repository with a manifest and a hand-off, a repository with neither, a folder that is no repository.
    section('-- entry.mjs: the state card (GAME-13)');
    const policyPath = path.join(brain, 'route-policy.json');
    const writeCardPolicy = (stateCard) => {
        const p = JSON.parse(readText(path.join(kit, 'templates', 'route-policy.json')));
        p.folders = { games: ['GAME'] };
        p.stateCard = stateCard;
        put(policyPath, JSON.stringify(p, null, 2));
    };
    const gameName = jp('games', 'repo-game');
    const handoffRel = jp('docs', 'HANDOFF.md');
    writeCardPolicy({ staleCommits: 2 });
    const game = newRepo(gameName);
    put(jp(game, 'docs', 'DECISIONS.md'), [
        '# Decisions', '', '## Core Goal', 'A small arcade game about **bats**.', '',
        '## Build Timeline', '', '| Chunk | Content | Status |', '|---|---|---|', '| 1 | Core loop | Done |', '| 2 | Sound toggles | Built |', '| 3 | Attract screen | Pending |', '',
        '## Open Questions', '', '| Question | Status |', '|---|---|', '| Touch input? | Open |', '| The name? | Resolved |', '',
        '## Change Log', '', '| Date | Change | Reason |', '|---|---|---|', '| 2026-01-01 | Manifest created | kick-off |', '| 2026-02-02 | Sound toggles added | chunk 2 |', ''].join('\n'));
    put(jp(game, 'docs', 'HANDOFF.md'), '# Hand-off\n\n## Current state\nChunk 2 is built.\n\n## Next\nBuild the attract screen.\n');
    put(jp(game, 'src', 'main.js'), 'let a = 1;');
    runGit(game, ['add', '-A']); runGit(game, ['commit', '-q', '-m', 'docs and a start']);
    for (let i = 2; i <= 4; i++) { put(jp(game, 'src', 'main.js'), `let a = ${i};`); runGit(game, ['add', '-A']); runGit(game, ['commit', '-q', '-m', `work ${i}`]); }
    put(path.join(game, 'scratch.txt'), 'not committed');
    const bare = newRepo(jp('games', 'repo-bare'));
    put(path.join(bare, 'main.js'), 'let b = 1;'); runGit(bare, ['add', '-A']); runGit(bare, ['commit', '-q', '-m', 'init']);
    fs.mkdirSync(jp(root, 'games', 'loose'), { recursive: true });

    let e = entry(game, 'card1', 'startup');
    record('card: a session that starts in a game repository gets the card', 'card', e.code === 0 && like(e.out, `*state card for ${gameName} (GAME-13)*`) ? 'card' : 'none', e.out);
    record('card: the entry path is still printed, before the card', 'both', /entry path[\s\S]*state card for/i.test(e.out) ? 'both' : 'wrong', e.out);
    record('card: the goal is read from the manifest, emphasis stripped', 'goal', like(e.out, '*goal         A small arcade game about bats.*') ? 'goal' : 'missing', e.out);
    record('card: the timeline counts closed rows and names the next open one', 'timeline', like(e.out, '*timeline     2 of 3 row(s) closed; next open row: 3 - Attract screen `[Pending`]*') ? 'timeline' : 'wrong', e.out);
    record('card: the last Change Log row is shown', 'change', like(e.out, '*last change  2026-02-02: Sound toggles added*') ? 'change' : 'wrong', e.out);
    record('card: open questions are counted', 'questions', like(e.out, '*questions    1 open of 2 row(s)*') ? 'questions' : 'wrong', e.out);
    record('card: the hand-off state and next are read from their headings', 'handoff', like(e.out, '*state        Chunk 2 is built.*') && like(e.out, '*next         Build the attract screen.*') ? 'handoff' : 'wrong', e.out);
    record('card: a hand-off more than staleCommits behind HEAD is flagged', 'stale', clike(e.out, `*${handoffRel}; last changed *3 commit(s) behind HEAD  << STALE*`) ? 'stale' : 'quiet', e.out);
    record('card: git says what is uncommitted', 'dirty', like(e.out, '*; 1 uncommitted; *') ? 'dirty' : 'wrong', e.out);
    record('card: the card stays under its size cap', 'small', e.out.split('design-first: state card').pop().length <= 2400 ? 'small' : 'big');
    e = entry(path.join(game, 'src'), 'card2', 'resume');
    record('card: a subfolder of the repository gets the same card', 'card', like(e.out, `*state card for ${gameName}*`) ? 'card' : 'none', e.out);
    e = entry(bare, 'card3', 'startup');
    record('card: no manifest and no hand-off are named as missing, not guessed', 'missing', like(e.out, '*manifest     none found*') && like(e.out, '*hand-off     none found*') ? 'missing' : 'wrong', e.out);
    e = entry(root, 'card4', 'startup');
    record('card: a session at the root gets no card', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);
    e = entry(repoClean, 'card5', 'startup');
    record('card: a repository in a folder mapped to no card group gets none', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);
    e = entry(jp(root, 'games', 'loose'), 'card6', 'startup');
    record('card: a folder under games that is no repository gets none, and no error', 'none', e.code === 0 && !like(e.out, '*state card*') && like(e.out, '*entry path*') ? 'none' : 'wrong', e.out);
    writeCardPolicy({ groups: [] });
    e = entry(game, 'card7', 'startup');
    record('card: stateCard.groups empty switches the card off', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);

    // ------------------------------------------------------------------ DES-14 (CR-2026-10-14-REVIEW): any repository with a hand-off, and the next prompt
    // The folder `tools` is mapped to no group. Three repositories under it: one with a hand-off whose
    // `## Next session` holds a fenced prompt, one with a hand-off and no such section, one with none.
    const hoName = jp('tools', 'repo-ho');
    const ho = newRepo(hoName);
    put(jp(ho, 'docs', 'HANDOFF.md'), '# Hand-off\n\n## Current state\nThe parser is built.\n\n## Next\nWire the parser to the page.\n\n## Next session\n\nOpen with:\n\n```\n Wire the parser to the page. Start from docs\\HANDOFF.md, chunk 3.\n```\n');
    put(path.join(ho, 'a.js'), 'let c = 1;'); runGit(ho, ['add', '-A']); runGit(ho, ['commit', '-q', '-m', 'init']);
    const hoLong = newRepo(jp('tools', 'repo-ho-long'));
    put(path.join(hoLong, 'HANDOFF.md'), '# Hand-off\n\n## Next session\n\n' + 'word '.repeat(200) + '\n');
    put(path.join(hoLong, 'a.js'), 'let d = 1;'); runGit(hoLong, ['add', '-A']); runGit(hoLong, ['commit', '-q', '-m', 'init']);
    const noHo = newRepo(jp('tools', 'repo-noho'));
    put(path.join(noHo, 'a.js'), 'let e = 1;'); runGit(noHo, ['add', '-A']); runGit(noHo, ['commit', '-q', '-m', 'init']);

    writeCardPolicy({ staleCommits: 2 });
    e = entry(ho, 'card8', 'startup');
    record('card: switch absent -> a hand-off repository outside a card group gets none (unchanged default)', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);
    writeCardPolicy({ staleCommits: 2, anyRepoWithHandoff: false });
    e = entry(ho, 'card9', 'startup');
    record('card: switch false -> none', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);
    writeCardPolicy({ staleCommits: 2, anyRepoWithHandoff: true });
    e = entry(ho, 'card10', 'startup');
    record('card: switch on -> a hand-off repository outside a card group gets the card, tagged DES-14', 'card', e.code === 0 && like(e.out, `*state card for ${hoName} (DES-14)*`) ? 'card' : 'none', e.out);
    record('card: the next prompt is read from the fenced block under Next session', 'prompt', like(e.out, '*next prompt  Wire the parser to the page. Start from docs\\HANDOFF.md, chunk 3.*') ? 'prompt' : 'wrong', e.out);
    record('card: the Next heading still reads next, not the Next session section', 'next', like(e.out, '*next         Wire the parser to the page.*') && !like(e.out, '*next         Open with*') ? 'next' : 'wrong', e.out);
    e = entry(noHo, 'card11', 'startup');
    record('card: switch on, no hand-off -> none', 'none', !like(e.out, '*state card*') ? 'none' : 'card', e.out);
    e = entry(game, 'card12', 'startup');
    record('card: a game repository keeps its GAME-13 tag with the switch on', 'card', like(e.out, `*state card for ${gameName} (GAME-13)*`) ? 'card' : 'none', e.out);
    record('card: a hand-off without Next session says so, never invents a prompt', 'none-line', like(e.out, '*next prompt  none; the agent writes its own*') ? 'none-line' : 'wrong', e.out);
    e = entry(hoLong, 'card13', 'startup');
    const npLine = e.out.split('\n').filter((l) => like(l, '*next prompt  *'));
    record('card: an over-long next prompt is cut to lineChars', 'cut', npLine.length === 1 && npLine[0].trim().endsWith('...') && npLine[0].length <= 240 ? 'cut' : 'wrong', e.out);
    fs.rmSync(policyPath, { force: true });
}
