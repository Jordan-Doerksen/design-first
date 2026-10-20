// cases-publish.mjs - the site's data file (0.2.7, CR-2026-10-20-SITE): runs docs/publish-selftest.mjs,
// which publishes kit.json to a throwaway site under the system temp folder and checks every key,
// the counts against law.json and that no value is empty. One record per line it checks, so a
// failure here names the check. Never touches the real site.

import path from 'node:path';
import { spawnSync } from 'node:child_process';

export default function publishCases(t) {
    const { kit, record, section } = t;
    section('publish: method/data/kit.json on a temp site');
    const r = spawnSync(process.execPath, [path.join(kit, 'docs', 'publish-selftest.mjs')], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NO_COLOR: '1' } });
    const lines = (r.stdout || '').split(/\r?\n/).filter((l) => /^\s{2}(PASS|FAIL)\s{2}/.test(l));
    for (const l of lines) {
        const m = /^\s{2}(PASS|FAIL)\s{2}(.*)$/.exec(l);
        record(`publish: ${m[2]}`, 'PASS', m[1], r.stdout);
    }
    record('publish: the self-test ran and exited 0', 0, lines.length > 0 ? r.status : `no checks ran (exit ${r.status})`, (r.stderr || '') + (r.stdout || ''));
}
