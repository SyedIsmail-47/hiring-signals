/** @typedef {'sales'|'engineering'|'marketing'|'product'|'design'|'data'|'finance'|'people'|'operations'|'support'|'legal'} TrackedFunction */

export const DEFAULT_TRACKED_FUNCTIONS = /** @type {TrackedFunction[]} */ ([
    'sales',
    'engineering',
    'marketing',
]);

export const SUPPORTED_FUNCTIONS = /** @type {TrackedFunction[]} */ ([
    'sales',
    'engineering',
    'marketing',
    'product',
    'design',
    'data',
    'finance',
    'people',
    'operations',
    'support',
    'legal',
]);

/**
 * Title keywords per function. Matching is whole-word only (see titleMatchesKeyword).
 * First matching tracked function wins. Longer phrases should be listed before
 * shorter ones within a function.
 *
 * Judgement calls (not bugs):
 * - "Technical Account Manager" matches sales via "account manager" / the explicit
 *   TAM phrase. Some orgs put TAM under CS/support; we treat it as sales.
 * - Bare "Presales" / "Pre-sales" is excluded from sales (see FUNCTION_NEGATIVES).
 *   Those titles often land on Solutions Architect / Consultant and stay unmatched
 *   unless another tracked keyword hits — keyword matching cannot resolve that org chart.
 *
 * Generic business words intentionally omitted as standalone triggers: "revenue",
 * "growth", and bare "developer". They collide with product names ("Revenue Suite")
 * and org labels ("Developer Experience") that are not the function itself.
 * Compound phrases like "growth marketing" and "software developer" remain.
 *
 * @type {Record<TrackedFunction, string[]>}
 */
export const FUNCTION_KEYWORDS = {
    sales: [
        'technical account manager',
        'account executive',
        'account manager',
        'business development',
        'sales development',
        'enterprise sales',
        'inside sales',
        'outside sales',
        'sales engineer',
        'sales',
        'sdr',
        'bdr',
        'ae',
        'quota',
        'closer',
    ],
    engineering: [
        'software engineer',
        'software developer',
        'site reliability',
        'full stack',
        'full-stack',
        'frontend',
        'front-end',
        'front end',
        'backend',
        'back-end',
        'back end',
        'devops',
        'infrastructure engineer',
        'platform engineer',
        'ml engineer',
        'machine learning engineer',
        'data engineer',
        'security engineer',
        'engineering',
        'engineer',
        'sre',
        'swe',
    ],
    marketing: [
        'product marketing',
        'demand generation',
        'demand gen',
        'growth marketing',
        'content marketing',
        'brand marketing',
        'digital marketing',
        'marketing',
        'seo',
        'sem',
        'communications',
        'pmm',
    ],
    product: [
        'product manager',
        'product owner',
        'product lead',
        'pm',
    ],
    design: [
        'product designer',
        'ux designer',
        'ui designer',
        'visual designer',
        'design system',
        'designer',
        'design',
    ],
    data: [
        'data scientist',
        'data analyst',
        'business intelligence',
        'data science',
        'statistician',
        'analytics',
    ],
    finance: [
        'financial',
        'finance',
        'accountant',
        'accounting',
        'controller',
        'fp&a',
        'fpa',
        'treasury',
    ],
    people: [
        'human resources',
        'people operations',
        'people ops',
        'talent acquisition',
        'recruiter',
        'recruiting',
        'people partner',
        'hr',
        'people',
    ],
    operations: [
        'business operations',
        'bizops',
        'biz ops',
        'chief of staff',
        'program manager',
        'project manager',
        'operations',
    ],
    support: [
        'customer support',
        'customer success',
        'customer service',
        'technical support',
        'support engineer',
        'help desk',
        'support',
    ],
    legal: [
        'legal counsel',
        'general counsel',
        'compliance',
        'attorney',
        'lawyer',
        'legal',
    ],
};

/**
 * If a title matches a negative for a function, that function is skipped even
 * when a keyword would otherwise hit. Used when a generic category word is
 * preceded by a qualifier that changes the meaning (e.g. Pre- before sales,
 * Support before engineer).
 * @type {Partial<Record<TrackedFunction, RegExp[]>>}
 */
export const FUNCTION_NEGATIVES = {
    // "Pre-sales" still has a whole-word "sales" after the hyphen. Exclude it.
    // One-word "Presales" is already safe under whole-word matching.
    sales: [
        /\bpre[-\s]?sales\b/i,
    ],
    // "Technical Support Engineer" / "Customer Support Engineer" must not land
    // in engineering just because "engineer" appears. Not covered by Pre- or DX.
    engineering: [
        /\bsupport\b(?=.*\bengineer\b)/i,
    ],
};

/** Eng tokens that keep a Developer Experience title in engineering. */
const ENGINEERING_TITLE_TOKENS = /\b(software\s+engineer|software\s+developer|engineer|engineering|sre|swe|devops)\b/i;

/**
 * Whole-word / whole-phrase match. "ae" must not hit "AEO"; "sales" must not
 * hit "Presales". Spaces and hyphens inside a multi-word keyword are flexible.
 * @param {string} titleLower
 * @param {string} keyword
 */
export function titleMatchesKeyword(titleLower, keyword) {
    const parts = String(keyword).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length) return false;
    const body = parts.map(escapeRegExp).join('[\\s/-]+');
    return new RegExp(`(?:^|[^a-z0-9&])${body}(?:[^a-z0-9&]|$)`, 'i').test(titleLower);
}

/**
 * @param {string} title
 * @param {TrackedFunction[]} trackedFunctions
 * @returns {TrackedFunction | null}
 */
export function categorizeTitle(title, trackedFunctions) {
    const titleLower = String(title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!titleLower) return null;

    for (const fn of trackedFunctions) {
        if (functionExcluded(titleLower, fn)) continue;
        const keywords = FUNCTION_KEYWORDS[fn];
        if (!keywords) continue;
        for (const keyword of keywords) {
            if (titleMatchesKeyword(titleLower, keyword)) return fn;
        }
    }
    return null;
}

/**
 * @param {{ title: string, id?: string | null }[]} roles
 * @param {TrackedFunction[]} trackedFunctions
 */
export function summarizeRoles(roles, trackedFunctions) {
    /** @type {Record<string, number>} */
    const functionBreakdown = Object.fromEntries(trackedFunctions.map((fn) => [fn, 0]));
    /** @type {{ title: string, function: TrackedFunction, id: string | null }[]} */
    const matchedTitles = [];

    for (const role of roles) {
        const fn = categorizeTitle(role.title, trackedFunctions);
        if (!fn) continue;
        functionBreakdown[fn] += 1;
        matchedTitles.push({
            title: role.title,
            function: fn,
            id: role.id == null || role.id === '' ? null : String(role.id),
        });
    }

    return {
        matchedRoles: matchedTitles.length,
        functionBreakdown,
        matchedTitles,
    };
}

/**
 * @param {string} titleLower
 * @param {TrackedFunction} fn
 */
function functionExcluded(titleLower, fn) {
    const patterns = FUNCTION_NEGATIVES[fn];
    if (patterns?.some((pattern) => pattern.test(titleLower))) return true;

    // "Developer Experience" without an eng title token is usually PM/analytics
    // about the DX surface — not an engineering seat.
    if (fn === 'engineering'
        && /\bdeveloper\s+experience\b/i.test(titleLower)
        && !ENGINEERING_TITLE_TOKENS.test(titleLower)) {
        return true;
    }

    return false;
}

/**
 * @param {string} value
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
