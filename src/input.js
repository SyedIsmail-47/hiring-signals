import { normalizeDomain } from './domain.js';
import { DEFAULT_TRACKED_FUNCTIONS, SUPPORTED_FUNCTIONS } from './functions.js';

/**
 * Apply the same defaults as `.actor/input_schema.json`.
 * @param {Record<string, unknown> | null | undefined} raw
 */
export function normalizeInput(raw = {}) {
    const input = raw ?? {};
    if (!Array.isArray(input.companies) || input.companies.length === 0) {
        throw new Error('Input companies must contain at least one company name and domain.');
    }

    return {
        companies: input.companies.map((item, index) => normalizeCompany(item, index)),
        trackedFunctions: normalizeTrackedFunctions(input.trackedFunctions),
        signalThreshold: requireInteger(input.signalThreshold, 2, 1, 100, 'signalThreshold'),
    };
}

/**
 * @param {unknown} item
 * @param {number} index
 */
function normalizeCompany(item, index) {
    const row = index + 1;
    if (!item || typeof item !== 'object') {
        throw new Error(`Company ${row} must be an object with name and domain.`);
    }
    const record = /** @type {Record<string, unknown>} */ (item);
    const name = String(record.name ?? '').trim();
    if (!name) throw new Error(`Company ${row} is missing a name.`);
    return {
        name,
        domain: normalizeDomain(record.domain),
    };
}

/**
 * @param {unknown} value
 */
function normalizeTrackedFunctions(value) {
    if (value === undefined || value === null) return [...DEFAULT_TRACKED_FUNCTIONS];
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('trackedFunctions must be a non-empty list of function names.');
    }
    const allowed = new Set(SUPPORTED_FUNCTIONS);
    const seen = new Set();
    /** @type {import('./functions.js').TrackedFunction[]} */
    const functions = [];
    for (const item of value) {
        const fn = String(item ?? '').trim().toLowerCase();
        if (!allowed.has(/** @type {import('./functions.js').TrackedFunction} */ (fn))) {
            throw new Error(`trackedFunctions contains unsupported function "${item}".`);
        }
        if (seen.has(fn)) continue;
        seen.add(fn);
        functions.push(/** @type {import('./functions.js').TrackedFunction} */ (fn));
    }
    if (!functions.length) {
        throw new Error('trackedFunctions must contain at least one function.');
    }
    return functions;
}

function requireInteger(value, fallback, min, max, label) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    }
    return value;
}
