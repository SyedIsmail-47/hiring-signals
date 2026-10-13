import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NEW_ROLE_WEIGHT,
    STABLE_ROLE_WEIGHT,
    buildCompanyState,
    companyStateKey,
    computeSignal,
    diffMatchedRoles,
} from '../src/state.js';

const tracked = ['sales', 'engineering', 'marketing'];

test('company state keys by domain and groups matched job IDs by function', () => {
    assert.equal(companyStateKey('Stripe.COM'), 'company:stripe.com');
    const state = buildCompanyState({
        domain: 'stripe.com',
        source: 'greenhouse',
        boardToken: 'stripe',
        trackedFunctions: tracked,
        updatedAt: '2026-10-13T00:00:00.000Z',
        matchedTitles: [
            { id: '1', function: 'engineering', title: 'Engineer' },
            { id: '2', function: 'sales', title: 'AE' },
            { id: '1', function: 'engineering', title: 'Engineer dup' },
            { id: null, function: 'marketing', title: 'No id' },
        ],
    });
    assert.deepEqual(state.matchedJobIds, ['1', '2']);
    assert.deepEqual(state.matchedJobIdsByFunction, {
        sales: ['2'],
        engineering: ['1'],
        marketing: [],
    });
});

test('first sighting is baseline and does not mark open roles as new', () => {
    const matched = [
        { id: 'a', function: 'engineering' },
        { id: 'b', function: 'sales' },
    ];
    const diff = diffMatchedRoles(matched, null, tracked);
    assert.equal(diff.isBaseline, true);
    assert.deepEqual(diff.newRoleIds, []);
    assert.deepEqual(diff.removedRoleIds, []);
    const signal = computeSignal({
        matchedRoles: 2,
        newRoleCount: 0,
        isBaseline: true,
        signalThreshold: 1,
    });
    assert.equal(signal.signalScore, 2 * STABLE_ROLE_WEIGHT);
    assert.equal(signal.meetsThreshold, true);
});

test('unchanged posture scores the same on baseline and a later run', () => {
    const baseline = computeSignal({
        matchedRoles: 348,
        newRoleCount: 0,
        isBaseline: true,
        signalThreshold: 2,
    });
    const later = computeSignal({
        matchedRoles: 348,
        newRoleCount: 0,
        isBaseline: false,
        signalThreshold: 2,
    });
    assert.equal(baseline.signalScore, later.signalScore);
    assert.equal(baseline.signalScore, 348 * STABLE_ROLE_WEIGHT);
    assert.equal(baseline.meetsThreshold, later.meetsThreshold);
    assert.equal(baseline.meetsThreshold, true);
});

test('job ID diff detects churn when totals are unchanged', () => {
    const previous = buildCompanyState({
        domain: 'stripe.com',
        source: 'greenhouse',
        boardToken: 'stripe',
        trackedFunctions: tracked,
        matchedTitles: [
            { id: '1', function: 'engineering' },
            { id: '2', function: 'engineering' },
            { id: '3', function: 'sales' },
        ],
    });
    const current = [
        { id: '2', function: 'engineering' },
        { id: '3', function: 'sales' },
        { id: '9', function: 'sales' },
        { id: '8', function: 'marketing' },
    ];
    const diff = diffMatchedRoles(current, previous, tracked);
    assert.equal(diff.isBaseline, false);
    assert.deepEqual(diff.newRoleIds, ['9', '8']);
    assert.deepEqual(diff.removedRoleIds, ['1']);
    assert.deepEqual(diff.newRolesByFunction, {
        sales: ['9'],
        engineering: [],
        marketing: ['8'],
    });
});

test('signalScore weights new roles above a static backlog', () => {
    const stable = computeSignal({
        matchedRoles: 10,
        newRoleCount: 0,
        isBaseline: false,
        signalThreshold: 6,
    });
    const burst = computeSignal({
        matchedRoles: 2,
        newRoleCount: 2,
        isBaseline: false,
        signalThreshold: 6,
    });
    assert.equal(stable.signalScore, 10 * STABLE_ROLE_WEIGHT);
    assert.equal(burst.signalScore, 2 * NEW_ROLE_WEIGHT);
    assert.equal(stable.meetsThreshold, false);
    assert.equal(burst.meetsThreshold, true);
    assert.ok(burst.signalScore > stable.signalScore);
});
