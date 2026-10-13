/**
 * Two-pass live proof of job-ID diffing against Stripe's real Greenhouse board.
 * Pass 1: baseline from live roles.
 * Pass 2: same live board, but previous KV state is surgically edited so some
 * real IDs look removed from history and some fake IDs look closed — proving
 * churn detection when totals would otherwise look flat.
 */
import { detectAtsBoard } from '../src/ats.js';
import { summarizeRoles } from '../src/functions.js';
import {
    buildCompanyState,
    computeSignal,
    diffMatchedRoles,
} from '../src/state.js';

const tracked = ['sales', 'engineering', 'marketing'];
const threshold = 2;
const company = { name: 'Stripe', domain: 'stripe.com' };

const board = await detectAtsBoard(company);
const summary = summarizeRoles(board.roles, tracked);
const withIds = summary.matchedTitles.filter((role) => role.id);
if (withIds.length < 6) {
    throw new Error(`Need at least 6 matched roles with IDs; got ${withIds.length}`);
}

// --- Pass 1: baseline ---
const baselineDiff = diffMatchedRoles(summary.matchedTitles, null, tracked);
const baselineState = buildCompanyState({
    domain: company.domain,
    source: board.source,
    boardToken: board.boardToken,
    matchedTitles: summary.matchedTitles,
    trackedFunctions: tracked,
    updatedAt: '2026-10-13T00:00:00.000Z',
});
const baselineSignal = computeSignal({
    matchedRoles: summary.matchedRoles,
    newRoleCount: baselineDiff.newRoleIds.length,
    isBaseline: baselineDiff.isBaseline,
    signalThreshold: threshold,
});

// --- Mutate stored state to simulate prior run hours earlier ---
const dropAsNew = withIds.slice(0, 3); // pretend these were absent before → new now
const keep = withIds.slice(3);
const fakeRemoved = [
    { id: 'sim-closed-1', function: 'engineering' },
    { id: 'sim-closed-2', function: 'sales' },
];
const simulatedPrevious = buildCompanyState({
    domain: company.domain,
    source: board.source,
    boardToken: board.boardToken,
    matchedTitles: [...keep, ...fakeRemoved],
    trackedFunctions: tracked,
    updatedAt: '2026-10-12T12:00:00.000Z',
});

// --- Pass 2: second live fetch against the real baseline store ---
await new Promise((resolve) => setTimeout(resolve, 1500));
const board2 = await detectAtsBoard(company);
const summary2 = summarizeRoles(board2.roles, tracked);
const immediateDiff = diffMatchedRoles(summary2.matchedTitles, baselineState, tracked);
const immediateSignal = computeSignal({
    matchedRoles: summary2.matchedRoles,
    newRoleCount: immediateDiff.newRoleIds.length,
    isBaseline: immediateDiff.isBaseline,
    signalThreshold: threshold,
});

// --- Pass 3: same second live board vs surgically edited prior state ---
const editedDiff = diffMatchedRoles(summary2.matchedTitles, simulatedPrevious, tracked);
const editedSignal = computeSignal({
    matchedRoles: summary2.matchedRoles,
    newRoleCount: editedDiff.newRoleIds.length,
    isBaseline: editedDiff.isBaseline,
    signalThreshold: threshold,
});

const countDelta = summary2.matchedRoles - simulatedPrevious.matchedJobIds.length;

console.log(JSON.stringify({
    boardPass1: {
        source: board.source,
        boardToken: board.boardToken,
        totalRoles: board.roles.length,
        matchedRoles: summary.matchedRoles,
        matchedWithIds: withIds.length,
        functionBreakdown: summary.functionBreakdown,
    },
    boardPass2: {
        source: board2.source,
        totalRoles: board2.roles.length,
        matchedRoles: summary2.matchedRoles,
        functionBreakdown: summary2.functionBreakdown,
    },
    pass1_baseline: {
        isBaseline: baselineDiff.isBaseline,
        newRolesCount: baselineDiff.newRoleIds.length,
        removedRolesCount: baselineDiff.removedRoleIds.length,
        signalScore: baselineSignal.signalScore,
        meetsThreshold: baselineSignal.meetsThreshold,
        storedIds: baselineState.matchedJobIds.length,
    },
    pass2_immediateRerun: {
        isBaseline: immediateDiff.isBaseline,
        newRolesCount: immediateDiff.newRoleIds.length,
        removedRolesCount: immediateDiff.removedRoleIds.length,
        newRoleIds: immediateDiff.newRoleIds,
        removedRoleIds: immediateDiff.removedRoleIds,
        signalScore: immediateSignal.signalScore,
        meetsThreshold: immediateSignal.meetsThreshold,
        matchedCountDelta: summary2.matchedRoles - summary.matchedRoles,
        scoreIdenticalToBaseline: immediateSignal.signalScore === baselineSignal.signalScore,
        meetsThresholdIdenticalToBaseline: immediateSignal.meetsThreshold === baselineSignal.meetsThreshold,
    },
    simulatedPrevious: {
        storedIds: simulatedPrevious.matchedJobIds.length,
        droppedFromHistory: dropAsNew.map((role) => ({ id: role.id, function: role.function, title: role.title })),
        fakeClosedIds: fakeRemoved.map((role) => role.id),
    },
    pass3_vs_editedPrevious: {
        isBaseline: editedDiff.isBaseline,
        newRolesCount: editedDiff.newRoleIds.length,
        removedRolesCount: editedDiff.removedRoleIds.length,
        newRoleIds: editedDiff.newRoleIds,
        removedRoleIds: editedDiff.removedRoleIds,
        newRolesByFunction: editedDiff.newRolesByFunction,
        signalScore: editedSignal.signalScore,
        meetsThreshold: editedSignal.meetsThreshold,
        // Raw inventory vs edited store can move a lot; ID sets are the signal.
        matchedCountDeltaVsEditedStore: countDelta,
        proof: {
            expectedNew: dropAsNew.map((role) => role.id).sort(),
            actualNew: [...editedDiff.newRoleIds].sort(),
            expectedRemoved: fakeRemoved.map((role) => role.id).sort(),
            actualRemoved: [...editedDiff.removedRoleIds].sort(),
            newMatchesExpected: sameSet(dropAsNew.map((role) => role.id), editedDiff.newRoleIds),
            removedMatchesExpected: sameSet(fakeRemoved.map((role) => role.id), editedDiff.removedRoleIds),
        },
    },
}, null, 2));

function sameSet(a, b) {
    const left = [...a].map(String).sort();
    const right = [...b].map(String).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
