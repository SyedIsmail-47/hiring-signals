import assert from 'node:assert/strict';
import test from 'node:test';

import { boardTokenCandidates, normalizeDomain } from '../src/domain.js';
import { normalizeInput } from '../src/input.js';

test('prefill is one Greenhouse company with default functions and threshold', () => {
    const input = normalizeInput({
        companies: [{ name: 'Stripe', domain: 'stripe.com' }],
    });
    assert.deepEqual(input.companies, [{ name: 'Stripe', domain: 'stripe.com' }]);
    assert.deepEqual(input.trackedFunctions, ['sales', 'engineering', 'marketing']);
    assert.equal(input.signalThreshold, 2);
});

test('normalizeInput fills defaults and accepts extra functions', () => {
    const input = normalizeInput({
        companies: [{ name: 'OpenAI', domain: 'https://www.openai.com/careers' }],
        trackedFunctions: ['Engineering', 'product', 'engineering'],
        signalThreshold: 3,
    });
    assert.deepEqual(input.companies, [{ name: 'OpenAI', domain: 'openai.com' }]);
    assert.deepEqual(input.trackedFunctions, ['engineering', 'product']);
    assert.equal(input.signalThreshold, 3);
});

test('normalizeInput rejects empty companies and bad domains', () => {
    assert.throws(() => normalizeInput({ companies: [] }), /at least one company/);
    assert.throws(
        () => normalizeInput({ companies: [{ name: 'X', domain: 'not a domain' }] }),
        /hostname/,
    );
    assert.throws(
        () => normalizeInput({
            companies: [{ name: 'X', domain: 'x.com' }],
            trackedFunctions: ['cooking'],
        }),
        /unsupported function/,
    );
});

test('board tokens prefer the domain label then name slugs', () => {
    assert.equal(normalizeDomain('HTTPS://WWW.Stripe.COM/jobs'), 'stripe.com');
    assert.deepEqual(
        boardTokenCandidates({ name: 'Stripe', domain: 'stripe.com' }),
        ['stripe'],
    );
    assert.deepEqual(
        boardTokenCandidates({ name: 'Open AI', domain: 'openai.com' }),
        ['openai', 'open-ai'],
    );
});
