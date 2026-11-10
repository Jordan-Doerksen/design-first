// selfcheck.mjs - the arming probe: prints UNARMED and exits 2 when no guard refused this call (0.3.0, KIT-02).
//
//   node .claude/kit/tools/selfcheck.mjs
//
// A session's brief runs this command first. The proof is not in this file; it is in the guard:
//   1. When the kit's hooks are loaded, guard rule 15 refuses this very command before it runs, with
//      the reason 'ARMED <version> <sha>' of the running kit (hooks/guard.mjs, the anchor
//      selfcheck-armed in hooks/lib/guard-owner-rules.mjs). The refusal reaches the model; this
//      script never starts.
//   2. When no guard saw the call, this script runs, prints 'UNARMED: no guard saw this call' on
//      stdout and exits 2 (could-not-look): the hooks are not loaded, and the brief says stop.
// It imports nothing and reads nothing: a copy with a broken lib, a missing law.json or a planted
// marker file still says UNARMED. A model can touch a file; it cannot produce a hook decision.
// Exit 0 never happens here: a run that reaches the last line is the unarmed case by definition.
//
// What this tool cannot see: a call made through a nested shell (bash -c "...", pwsh -c "...",
// cmd /c "...") or from a script on disk is not read by the guard's shell rules, so this script
// runs and says UNARMED while the guard may well be loaded. That is the safe side: a stop, never a
// false go. The guard's own residual is written in hooks/guard.mjs.

// anchor: selfcheck  mode: gate  verbs: prove-armed
process.stdout.write('UNARMED: no guard saw this call\n');
process.exitCode = 2;
