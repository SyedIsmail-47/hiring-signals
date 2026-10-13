/**
 * @param {unknown} value
 */
export function normalizeDomain(value) {
    let raw = String(value ?? '').trim().toLowerCase();
    if (!raw) throw new Error('Domain is required.');
    raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
    raw = raw.split('/')[0].split('?')[0].split('#')[0].replace(/\.$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) || raw.includes('..') || raw.startsWith('.') || raw.endsWith('.')) {
        throw new Error(`Domain "${value}" is not a hostname.`);
    }
    return raw;
}

/**
 * Likely public board tokens for Greenhouse / Lever / Ashby.
 * Order: domain label first (stripe.com → stripe), then name slugs.
 * @param {{ name: string, domain: string }} company
 */
export function boardTokenCandidates(company) {
    const tokens = [];
    const seen = new Set();
    const push = (value) => {
        const token = String(value ?? '').trim().toLowerCase();
        if (!token || seen.has(token)) return;
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(token)) return;
        seen.add(token);
        tokens.push(token);
    };

    const host = company.domain.toLowerCase();
    const labels = host.split('.').filter(Boolean);
    if (labels.length >= 2) {
        // stripe.com → stripe; news.ycombinator.com → ycombinator then news
        push(labels[labels.length - 2]);
        if (labels.length > 2) push(labels[0]);
    }

    const name = String(company.name ?? '').trim();
    push(name.replace(/[^a-z0-9]+/gi, ''));
    push(name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, ''));
    push(name.replace(/\s+/g, ''));

    return tokens;
}
