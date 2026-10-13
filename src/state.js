/**
 * Day-over-day hiring state, keyed by company domain in the Actor Key-Value store.
 *
 * Tracking is by ATS job ID (Greenhouse / Lever / Ashby), not by title text and
 * not by a raw count delta. Losing three roles and gaining three different ones
 * must show as activity even when the totals are unchanged.
 */

/** Continuing open matched roles contribute this much each to signalScore. */
export const STABLE_ROLE_WEIGHT = 0.5;

/**
 * Brand-new matched role IDs (seen this run, absent from the prior set) contribute
 * this much each. Higher than STABLE_ROLE_WEIGHT so a burst of fresh postings
 * outranks a large but static backlog — e.g. 2 new sales seats (score 6) beat
 * 10 unchanged eng seats (score 5). Baseline still uses this same formula with
 * newRoleCount = 0 (roles score as continuing, not as a raw-count special case).
 */
export const NEW_ROLE_WEIGHT = 3;

/**
 * @param {string} domain
 */
export function companyStateKey(domain) {
    return `company:${String(domain).toLowerCase()}`;
}

/**
 * Build the matched-ID snapshot to persist after this run.
 * @param {{
 *   domain: string,
 *   source: string | null,
 *   boardToken: string | null,
 *   matchedTitles: { id: string | null, function: string }[],
 *   trackedFunctions: string[],
 *   updatedAt?: string,
 * }} input
 */
export function buildCompanyState(input) {
    /** @type {Record<string, string[]>} */
    const matchedJobIdsByFunction = Object.fromEntries(
        input.trackedFunctions.map((fn) => [fn, []]),
    );
    const matchedJobIds = [];
    const seen = new Set();

    for (const role of input.matchedTitles) {
        if (!role.id || seen.has(role.id)) continue;
        seen.add(role.id);
        matchedJobIds.push(role.id);
        if (!matchedJobIdsByFunction[role.function]) {
            matchedJobIdsByFunction[role.function] = [];
        }
        matchedJobIdsByFunction[role.function].push(role.id);
    }

    return {
        domain: input.domain,
        source: input.source,
        boardToken: input.boardToken,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
        matchedJobIds,
        matchedJobIdsByFunction,
    };
}

/**
 * Diff current matched roles against the previous KV snapshot.
 * No previous state → baseline: nothing is reported as "new".
 * @param {{ id: string | null, function: string }[]} matchedTitles
 * @param {{ matchedJobIds?: string[], matchedJobIdsByFunction?: Record<string, string[]> } | null | undefined} previous
 * @param {string[]} trackedFunctions
 */
export function diffMatchedRoles(matchedTitles, previous, trackedFunctions) {
    const currentIds = [];
    const currentById = new Map();
    for (const role of matchedTitles) {
        if (!role.id || currentById.has(role.id)) continue;
        currentById.set(role.id, role.function);
        currentIds.push(role.id);
    }

    const isBaseline = !previous || !Array.isArray(previous.matchedJobIds);
    /** @type {Record<string, string[]>} */
    const newRolesByFunction = Object.fromEntries(trackedFunctions.map((fn) => [fn, []]));

    if (isBaseline) {
        return {
            isBaseline: true,
            newRoleIds: [],
            removedRoleIds: [],
            newRolesByFunction,
            currentIds,
        };
    }

    const previousIds = previous.matchedJobIds.map(String);
    const previousSet = new Set(previousIds);
    const currentSet = new Set(currentIds);

    const newRoleIds = currentIds.filter((id) => !previousSet.has(id));
    const removedRoleIds = previousIds.filter((id) => !currentSet.has(id));

    for (const id of newRoleIds) {
        const fn = currentById.get(id);
        if (!fn) continue;
        if (!newRolesByFunction[fn]) newRolesByFunction[fn] = [];
        newRolesByFunction[fn].push(id);
    }

    return {
        isBaseline: false,
        newRoleIds,
        removedRoleIds,
        newRolesByFunction,
        currentIds,
    };
}

/**
 * Weighted hiring signal score and threshold check.
 * @param {{
 *   matchedRoles: number,
 *   newRoleCount: number,
 *   isBaseline: boolean,
 *   signalThreshold: number,
 * }} input
 */
export function computeSignal(input) {
    const { matchedRoles, newRoleCount, signalThreshold } = input;

    // Same formula on baseline and later runs. Baseline diffs report no "new"
    // IDs, so first sighting scores as an all-continuing board (matched × 0.5).
    // An unchanged re-fetch then keeps the identical score.
    const continuing = Math.max(0, matchedRoles - newRoleCount);
    let signalScore = continuing * STABLE_ROLE_WEIGHT + newRoleCount * NEW_ROLE_WEIGHT;

    // Keep one decimal for half-weights; threshold compare uses the numeric score.
    signalScore = Math.round(signalScore * 10) / 10;

    return {
        signalScore,
        meetsThreshold: signalScore >= signalThreshold,
    };
}
