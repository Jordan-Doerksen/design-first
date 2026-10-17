// stdin.mjs - the hook payload, read with nothing else loaded, so a hook can read it before a
// library that might fail and still answer for the right session. Imported by every hook.

import fs from 'node:fs';

// All of standard input, as text. Read in a loop because a host may hand over a non-blocking pipe,
// where one read can answer EAGAIN before the payload has arrived.
export function readStdin() {
    const chunks = [];
    const buf = Buffer.alloc(1 << 16);
    const nap = new Int32Array(new SharedArrayBuffer(4));
    for (let tries = 0; tries < 20000;) {
        let n;
        try { n = fs.readSync(0, buf, 0, buf.length, null); }
        catch (e) {
            if (e.code === 'EAGAIN') { tries++; Atomics.wait(nap, 0, 0, 2); continue; }
            if (e.code === 'EOF') break;
            if (chunks.length === 0) return '';
            break;
        }
        if (n === 0) break;
        chunks.push(Buffer.from(buf.subarray(0, n)));
    }
    const t = Buffer.concat(chunks).toString('utf8');
    return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

// Local time with its offset, to the millisecond: 2026-10-17T09:30:00.123+02:00.
export function isoNow(d = new Date()) {
    const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
