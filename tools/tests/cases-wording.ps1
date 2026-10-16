# cases-wording.ps1 - hook self-test cases for the Stop card's own words (CR-2026-10-15-GAPS W, rows
# W49 and W50). Dot-sourced by run.ps1 after cases-grades.ps1. It reads these names from run.ps1's
# scope: $repoClean, Put, Record, Stop and Ledger. Never run directly.
#
# The card is the agent's only account of what checks its answer. Up to 0.1.38 its last line said
# "it is checked by the Doctor and the repository's gate", and no Doctor claim reads the answer: the
# one claim on this hook (KIT-SMOKE-07) proves only that it starts. And a card counted from the Edit
# and Write calls alone named one blind spot (a file a command changed) but not the other: an edit
# the fence or the owner refused after the guard recorded it is still in that count.
# Run on a scratch copy of the kit with the two old card lines put back (2026-10-15), both cases fail.

Write-Host '-- wording: the Stop card says what checks it and what its count holds'
# No turn marker for this session, so the card counts the Edit and Write calls (the fallback).
Put (Ledger 'w-card') ((Join-Path $repoClean 'src\main.py') + "`t`n")
$wCard = Stop 'w-card' $false
$wText = try { [string](($wCard.out | ConvertFrom-Json).reason) } catch { '' }
Record 'wording: the card says no machine checks its answer' 'honest' $(if (-not $wText) { 'no-card' } elseif ($wText -like '*Nothing on this card is checked by a machine*' -and $wText -notlike '*checked by the Doctor*') { 'honest' } else { 'claims-a-checker' }) $wCard.out
Record 'wording: a card counted from the calls says a refused edit can be in its count' 'said' $(if (-not $wText) { 'no-card' } elseif ($wText -like '*Counted from Edit and Write calls only*refused after the guard allowed it can still be in the count*') { 'said' } else { 'unsaid' }) $wCard.out
