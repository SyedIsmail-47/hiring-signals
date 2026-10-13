import { boardTokenCandidates } from './domain.js';

export const ATS_ORDER = /** @type {const} */ (['greenhouse', 'lever', 'ashby']);

const USER_AGENT = 'RodexcoHiringSignals/0.1 (+https://apify.com; public ATS board check)';
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Try Greenhouse, then Lever, then Ashby for a company board.
 * @param {{ name: string, domain: string }} company
 * @param {{ fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void> }} [options]
 */
export async function detectAtsBoard(company, options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const sleep = options.sleep ?? defaultSleep;
    const tokens = boardTokenCandidates(company);
    /** @type {{ source: string, boardToken: string, status: number }[]} */
    const attempts = [];

    for (const source of ATS_ORDER) {
        for (const token of tokens) {
            const result = await fetchBoard(source, token, fetchImpl);
            attempts.push({ source, boardToken: token, status: result.status });
            if (result.ok) {
                return {
                    source,
                    boardToken: token,
                    roles: result.roles,
                    attempts,
                };
            }
            // Brief pause between board probes so we do not hammer public APIs.
            await sleep(250);
        }
    }

    return {
        source: null,
        boardToken: null,
        roles: [],
        attempts,
    };
}

/**
 * @param {'greenhouse'|'lever'|'ashby'} source
 * @param {string} token
 * @param {typeof fetch} fetchImpl
 */
async function fetchBoard(source, token, fetchImpl) {
    const url = boardUrl(source, token);
    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                'user-agent': USER_AGENT,
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (response.status === 404) {
            return { ok: false, status: 404, roles: [] };
        }
        if (!response.ok) {
            return { ok: false, status: response.status, roles: [] };
        }
        const body = await response.json();
        const roles = parseRoles(source, body);
        // An empty published board is still a successful board match.
        return { ok: true, status: response.status, roles };
    } catch {
        return { ok: false, status: 0, roles: [] };
    }
}

/**
 * @param {'greenhouse'|'lever'|'ashby'} source
 * @param {string} token
 */
export function boardUrl(source, token) {
    const encoded = encodeURIComponent(token);
    if (source === 'greenhouse') {
        return `https://boards-api.greenhouse.io/v1/boards/${encoded}/jobs`;
    }
    if (source === 'lever') {
        return `https://api.lever.co/v0/postings/${encoded}?mode=json`;
    }
    return `https://api.ashbyhq.com/posting-api/job-board/${encoded}`;
}

/**
 * @param {'greenhouse'|'lever'|'ashby'} source
 * @param {unknown} body
 * @returns {{ title: string, id: string | null, url: string | null }[]}
 */
export function parseRoles(source, body) {
    if (source === 'greenhouse') {
        const jobs = Array.isArray(/** @type {{ jobs?: unknown }} */ (body)?.jobs)
            ? /** @type {{ jobs: Record<string, unknown>[] }} */ (body).jobs
            : [];
        return jobs
            .map((job) => ({
                title: String(job.title ?? '').trim(),
                id: job.id == null ? null : String(job.id),
                url: job.absolute_url == null ? null : String(job.absolute_url),
            }))
            .filter((role) => role.title);
    }

    if (source === 'lever') {
        const jobs = Array.isArray(body) ? body : [];
        return jobs
            .map((job) => {
                const row = /** @type {Record<string, unknown>} */ (job);
                const urls = /** @type {Record<string, unknown>} */ (row.urls ?? {});
                return {
                    title: String(row.text ?? row.title ?? '').trim(),
                    id: row.id == null ? null : String(row.id),
                    url: urls.show == null ? null : String(urls.show),
                };
            })
            .filter((role) => role.title);
    }

    const jobs = Array.isArray(/** @type {{ jobs?: unknown }} */ (body)?.jobs)
        ? /** @type {{ jobs: Record<string, unknown>[] }} */ (body).jobs
        : [];
    return jobs
        .map((job) => ({
            title: String(job.title ?? '').trim(),
            id: job.id == null ? null : String(job.id),
            url: job.jobUrl == null ? null : String(job.jobUrl),
        }))
        .filter((role) => role.title);
}

function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
