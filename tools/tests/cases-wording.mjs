// cases-wording.mjs - hook self-test cases for the Stop card's own words (CR-2026-10-15-GAPS W, rows
// W49 and W50). Imported by run.mjs after cases-grades.mjs. Never run directly.
//
// The card is the agent's only account of what checks its answer. Up to 0.1.38 its last line said
// "it is checked by the Doctor and the repository's gate", and no Doctor claim reads the answer: the
// one claim on this hook (KIT-SMOKE-07) proves only that it starts. And a card counted from the Edit
// and Write calls alone named one blind spot (a file a command changed) but not the other: an edit
// the fence or the owner refused after the guard recorded it is still in that count.
// Run on a scratch copy of the kit with the two old card lines put back (2026-10-15), both cases fail.

export default function wordingCases(t) {
    const { repoClean, record, section, like, jp, put, parseOut, stop, ledger } = t;

    section('-- wording: the Stop card says what checks it and what its count holds');
    // No turn marker for this session, so the card counts the Edit and Write calls (the fallback).
    put(ledger('w-card'), jp(repoClean, 'src', 'main.py') + '\t\n');
    const card = stop('w-card', false);
    const j = parseOut(card.out);
    const text = j && j.reason ? String(j.reason) : '';
    record('wording: the card says no machine checks its answer', 'honest', !text ? 'no-card' : like(text, '*Nothing on this card is checked by a machine*') && !like(text, '*checked by the Doctor*') ? 'honest' : 'claims-a-checker', card.out);
    record('wording: a card counted from the calls says a refused edit can be in its count', 'said', !text ? 'no-card' : like(text, '*Counted from Edit and Write calls only*refused after the guard allowed it can still be in the count*') ? 'said' : 'unsaid', card.out);
}
