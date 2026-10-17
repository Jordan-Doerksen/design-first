// json.mjs - JSON as the kit's files are written by hand. Imported by the hooks and the tools.
//
// parseJson reads strict JSON first. When that fails it reads the file again the way the
// PowerShell kit's reader did, since configs and claims written for that kit are still valid to
// their owners: a raw line break or tab inside a string, a // or /* */ comment, and a comma before
// a closing bracket are accepted. Anything else still fails, with the strict parser's message.

export function parseJson(text) {
    let t = String(text);
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    try { return JSON.parse(t); } catch (strict) {
        try { return JSON.parse(loosen(t)); } catch { throw strict; }
    }
}

function loosen(t) {
    let out = '';
    let inStr = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (inStr) {
            if (c === '\\') { out += c + (t[i + 1] ?? ''); i++; continue; }
            if (c === '"') { inStr = false; out += c; continue; }
            if (c === '\n') { out += '\\n'; continue; }
            if (c === '\r') { out += '\\r'; continue; }
            if (c === '\t') { out += '\\t'; continue; }
            out += c;
            continue;
        }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && t[i + 1] === '*') { const j = t.indexOf('*/', i + 2); i = j < 0 ? t.length : j + 1; continue; }
        out += c;
    }
    return out.replace(/,(\s*[}\]])/g, '$1');
}
