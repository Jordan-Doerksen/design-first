// args.mjs - command-line options for the kit's tools, in the form the manuals and commands use:
// '-Name value', '--name value' or '--name=value', matched without case; a switch takes no value.
//   parseArgs(argv, { values: ['Source', 'Out'], switches: ['DryRun'], lists: ['GitHubOwners'] })
// returns { Source, Out, DryRun, GitHubOwners, _: [positionals] }. A list option takes the words after
// it up to the next option, and splits each on commas. An unknown option throws.

export function parseArgs(argv, spec) {
    const values = spec.values || [];
    const switches = spec.switches || [];
    const lists = spec.lists || [];
    const find = (name, names) => names.find((n) => n.toLowerCase() === name.toLowerCase());
    const out = { _: [] };
    for (const s of switches) out[s] = false;
    for (const l of lists) out[l] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const m = /^--?([A-Za-z][\w-]*)(?:=(.*))?$/.exec(a);
        if (!m) { out._.push(a); continue; }
        const name = m[1].replace(/-/g, '');
        let key;
        if ((key = find(name, switches))) { out[key] = m[2] == null ? true : !/^(false|0|no)$/i.test(m[2]); continue; }
        if ((key = find(name, values))) {
            if (m[2] != null) out[key] = m[2];
            else if (i + 1 < argv.length) out[key] = argv[++i];
            else throw new Error(`option ${a} needs a value`);
            continue;
        }
        if ((key = find(name, lists))) {
            const words = [];
            if (m[2] != null) words.push(m[2]);
            else while (i + 1 < argv.length && !/^--?[A-Za-z]/.test(argv[i + 1])) words.push(argv[++i]);
            for (const w of words) for (const p of w.split(',')) if (p.trim()) out[key].push(p.trim());
            continue;
        }
        throw new Error(`unknown option ${a}`);
    }
    return out;
}
