// secrets.mjs - the secret shapes the kit refuses to let out of a private place: a token, a key or a
// webhook URL in text about to be written somewhere less private. Used by tools/extract.mjs (0.3.0
// chunk 1) and by the brain's push script (chunk 2). Imported; never run directly.
//
// Rules:
//   1. SECRET_PATTERNS is the list, in order, as [{ name, regex }]: the nine patterns the memory relay
//      used, copied verbatim so the two scans agree.
//   2. findSecrets(text) returns every hit as { name, index }: the pattern's name and where it starts,
//      never the matched text, so a caller can refuse and say which kind without printing the secret.
//   3. The regexes have no state: each call scans with a fresh global copy, so a hit in one text never
//      moves the next scan's start.
// What this cannot see: a secret in a shape none of the nine names (a bare hex API key, a password in
// a URL, a .env line with a made-up prefix), one split across two values, or one wrapped in base64.

// Source: the memory relay (tools/relay.mjs), 2026-11-10: its SECRET_PATTERNS, copied verbatim.
export const SECRET_PATTERNS = [
    { name: 'discord-webhook', regex: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/ },
    { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
    { name: 'github-pat', regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
    { name: 'anthropic-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
    { name: 'openai-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
    { name: 'aws-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
    { name: 'slack-token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
    { name: 'discord-bot-token', regex: /\b[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}\b/ },
];

export function findSecrets(text) {
    const s = text == null ? '' : String(text);
    const hits = [];
    if (!s) return hits;
    for (const { name, regex } of SECRET_PATTERNS) {
        const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
        for (const m of s.matchAll(g)) hits.push({ name, index: m.index });
    }
    return hits.sort((a, b) => a.index - b.index);
}
