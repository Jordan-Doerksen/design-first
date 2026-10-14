# cases-state-card.ps1 - hook self-test cases for the state card (GAME-13). Dot-sourced by run.ps1,
# which owns the fixtures and helpers used here ($brain, $root, $kit, NewRepo, Put, RunGit, Record,
# Entry, $repoClean). Never run directly. Split out of run.ps1 by domain when that file passed the split line.

# ------------------------------------------------------------------ 7. the state card (GAME-13): entry.ps1 + lib/state-card.ps1
# A brain route policy that maps the folder `games` to the GAME group, and three things under it:
# a repository with a manifest and a hand-off, a repository with neither, a folder that is no repository.
Write-Host '-- entry.ps1: the state card (GAME-13)'
$policyPath = Join-Path $brain 'route-policy.json'
function WriteCardPolicy($stateCard) {
    $p = Get-Content -LiteralPath (Join-Path $kit 'templates\route-policy.json') -Raw | ConvertFrom-Json
    $p.folders = [pscustomobject]@{ games = @('GAME') }
    $p | Add-Member -NotePropertyName stateCard -NotePropertyValue $stateCard -Force
    Put $policyPath ($p | ConvertTo-Json -Depth 6)
}
WriteCardPolicy ([pscustomobject]@{ staleCommits = 2 })
$game = NewRepo 'games\repo-game'
Put (Join-Path $game 'docs\DECISIONS.md') (@(
    '# Decisions', '', '## Core Goal', 'A small arcade game about **bats**.', '',
    '## Build Timeline', '', '| Chunk | Content | Status |', '|---|---|---|', '| 1 | Core loop | Done |', '| 2 | Sound toggles | Built |', '| 3 | Attract screen | Pending |', '',
    '## Open Questions', '', '| Question | Status |', '|---|---|', '| Touch input? | Open |', '| The name? | Resolved |', '',
    '## Change Log', '', '| Date | Change | Reason |', '|---|---|---|', '| 2026-01-01 | Manifest created | kick-off |', '| 2026-02-02 | Sound toggles added | chunk 2 |', '') -join "`n")
Put (Join-Path $game 'docs\HANDOFF.md') "# Hand-off`n`n## Current state`nChunk 2 is built.`n`n## Next`nBuild the attract screen.`n"
Put (Join-Path $game 'src\main.js') 'let a = 1;'
RunGit $game @('add', '-A'); RunGit $game @('commit', '-q', '-m', 'docs and a start')
foreach ($i in 2..4) { Put (Join-Path $game 'src\main.js') "let a = $i;"; RunGit $game @('add', '-A'); RunGit $game @('commit', '-q', '-m', "work $i") }
Put (Join-Path $game 'scratch.txt') 'not committed'
$bare = NewRepo 'games\repo-bare'
Put (Join-Path $bare 'main.js') 'let b = 1;'; RunGit $bare @('add', '-A'); RunGit $bare @('commit', '-q', '-m', 'init')
New-Item -ItemType Directory -Force -Path (Join-Path $root 'games\loose') | Out-Null

$e = Entry $game 'card1' 'startup'
Record 'card: a session that starts in a game repository gets the card' 'card' $(if ($e.code -eq 0 -and $e.out -like '*state card for games\repo-game (GAME-13)*') { 'card' } else { 'none' }) $e.out
Record 'card: the entry path is still printed, before the card' 'both' $(if ($e.out -match '(?s)entry path.*state card for') { 'both' } else { 'wrong' }) $e.out
Record 'card: the goal is read from the manifest, emphasis stripped' 'goal' $(if ($e.out -like '*goal         A small arcade game about bats.*') { 'goal' } else { 'missing' }) $e.out
Record 'card: the timeline counts closed rows and names the next open one' 'timeline' $(if ($e.out -like '*timeline     2 of 3 row(s) closed; next open row: 3 - Attract screen `[Pending`]*') { 'timeline' } else { 'wrong' }) $e.out
Record 'card: the last Change Log row is shown' 'change' $(if ($e.out -like '*last change  2026-02-02: Sound toggles added*') { 'change' } else { 'wrong' }) $e.out
Record 'card: open questions are counted' 'questions' $(if ($e.out -like '*questions    1 open of 2 row(s)*') { 'questions' } else { 'wrong' }) $e.out
Record 'card: the hand-off state and next are read from their headings' 'handoff' $(if ($e.out -like '*state        Chunk 2 is built.*' -and $e.out -like '*next         Build the attract screen.*') { 'handoff' } else { 'wrong' }) $e.out
Record 'card: a hand-off more than staleCommits behind HEAD is flagged' 'stale' $(if ($e.out -clike '*docs\HANDOFF.md; last changed *3 commit(s) behind HEAD  << STALE*') { 'stale' } else { 'quiet' }) $e.out
Record 'card: git says what is uncommitted' 'dirty' $(if ($e.out -like '*; 1 uncommitted; *') { 'dirty' } else { 'wrong' }) $e.out
Record 'card: the card stays under its size cap' 'small' $(if (($e.out -split 'design-first: state card')[-1].Length -le 2400) { 'small' } else { 'big' }) ''
$e = Entry (Join-Path $game 'src') 'card2' 'resume'
Record 'card: a subfolder of the repository gets the same card' 'card' $(if ($e.out -like '*state card for games\repo-game*') { 'card' } else { 'none' }) $e.out
$e = Entry $bare 'card3' 'startup'
Record 'card: no manifest and no hand-off are named as missing, not guessed' 'missing' $(if ($e.out -like '*manifest     none found*' -and $e.out -like '*hand-off     none found*') { 'missing' } else { 'wrong' }) $e.out
$e = Entry $root 'card4' 'startup'
Record 'card: a session at the root gets no card' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
$e = Entry $repoClean 'card5' 'startup'
Record 'card: a repository in a folder mapped to no card group gets none' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
$e = Entry (Join-Path $root 'games\loose') 'card6' 'startup'
Record 'card: a folder under games that is no repository gets none, and no error' 'none' $(if ($e.code -eq 0 -and $e.out -notlike '*state card*' -and $e.out -like '*entry path*') { 'none' } else { 'wrong' }) $e.out
WriteCardPolicy ([pscustomobject]@{ groups = @() })
$e = Entry $game 'card7' 'startup'
Record 'card: stateCard.groups empty switches the card off' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
# ------------------------------------------------------------------ DES-14 (CR-2026-10-14-REVIEW): any repository with a hand-off, and the next prompt
# The folder `tools` is mapped to no group. Three repositories under it: one with a hand-off whose
# `## Next session` holds a fenced prompt, one with a hand-off and no such section, one with none.
$ho = NewRepo 'tools\repo-ho'
Put (Join-Path $ho 'docs\HANDOFF.md') "# Hand-off`n`n## Current state`nThe parser is built.`n`n## Next`nWire the parser to the page.`n`n## Next session`n`nOpen with:`n`n```````n Wire the parser to the page. Start from docs\HANDOFF.md, chunk 3.`n```````n"
Put (Join-Path $ho 'a.js') 'let c = 1;'; RunGit $ho @('add', '-A'); RunGit $ho @('commit', '-q', '-m', 'init')
$hoLong = NewRepo 'tools\repo-ho-long'
Put (Join-Path $hoLong 'HANDOFF.md') ("# Hand-off`n`n## Next session`n`n" + ('word ' * 200) + "`n")
Put (Join-Path $hoLong 'a.js') 'let d = 1;'; RunGit $hoLong @('add', '-A'); RunGit $hoLong @('commit', '-q', '-m', 'init')
$noHo = NewRepo 'tools\repo-noho'
Put (Join-Path $noHo 'a.js') 'let e = 1;'; RunGit $noHo @('add', '-A'); RunGit $noHo @('commit', '-q', '-m', 'init')

WriteCardPolicy ([pscustomobject]@{ staleCommits = 2 })
$e = Entry $ho 'card8' 'startup'
Record 'card: switch absent -> a hand-off repository outside a card group gets none (unchanged default)' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
WriteCardPolicy ([pscustomobject]@{ staleCommits = 2; anyRepoWithHandoff = $false })
$e = Entry $ho 'card9' 'startup'
Record 'card: switch false -> none' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
WriteCardPolicy ([pscustomobject]@{ staleCommits = 2; anyRepoWithHandoff = $true })
$e = Entry $ho 'card10' 'startup'
Record 'card: switch on -> a hand-off repository outside a card group gets the card, tagged DES-14' 'card' $(if ($e.code -eq 0 -and $e.out -like '*state card for tools\repo-ho (DES-14)*') { 'card' } else { 'none' }) $e.out
Record 'card: the next prompt is read from the fenced block under Next session' 'prompt' $(if ($e.out -like '*next prompt  Wire the parser to the page. Start from docs\HANDOFF.md, chunk 3.*') { 'prompt' } else { 'wrong' }) $e.out
Record 'card: the Next heading still reads next, not the Next session section' 'next' $(if ($e.out -like '*next         Wire the parser to the page.*' -and $e.out -notlike '*next         Open with*') { 'next' } else { 'wrong' }) $e.out
$e = Entry $noHo 'card11' 'startup'
Record 'card: switch on, no hand-off -> none' 'none' $(if ($e.out -notlike '*state card*') { 'none' } else { 'card' }) $e.out
$e = Entry $game 'card12' 'startup'
Record 'card: a game repository keeps its GAME-13 tag with the switch on' 'card' $(if ($e.out -like '*state card for games\repo-game (GAME-13)*') { 'card' } else { 'none' }) $e.out
Record 'card: a hand-off without Next session says so, never invents a prompt' 'none-line' $(if ($e.out -like '*next prompt  none; the agent writes its own*') { 'none-line' } else { 'wrong' }) $e.out
$e = Entry $hoLong 'card13' 'startup'
$npLine = @($e.out -split "`n" | Where-Object { $_ -like '*next prompt  *' })
Record 'card: an over-long next prompt is cut to lineChars' 'cut' $(if ($npLine.Count -eq 1 -and $npLine[0].Trim().EndsWith('...') -and $npLine[0].Length -le 240) { 'cut' } else { 'wrong' }) $e.out
Remove-Item -LiteralPath $policyPath -Force
