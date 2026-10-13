import assert from 'node:assert/strict';
import test from 'node:test';

import { boardUrl, detectAtsBoard, parseRoles } from '../src/ats.js';

test('board URLs follow the public ATS paths', () => {
    assert.equal(
        boardUrl('greenhouse', 'stripe'),
        'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
    );
    assert.equal(
        boardUrl('lever', 'palantir'),
        'https://api.lever.co/v0/postings/palantir?mode=json',
    );
    assert.equal(
        boardUrl('ashby', 'openai'),
        'https://api.ashbyhq.com/posting-api/job-board/openai',
    );
});

test('parseRoles reads Greenhouse, Lever, and Ashby payloads', () => {
    assert.deepEqual(
        parseRoles('greenhouse', { jobs: [{ id: 1, title: ' Engineer ', absolute_url: 'https://x/1' }] }),
        [{ title: 'Engineer', id: '1', url: 'https://x/1' }],
    );
    assert.deepEqual(
        parseRoles('lever', [{ id: 'a', text: 'Designer', urls: { show: 'https://jobs.lever.co/x/a' } }]),
        [{ title: 'Designer', id: 'a', url: 'https://jobs.lever.co/x/a' }],
    );
    assert.deepEqual(
        parseRoles('ashby', { jobs: [{ id: 'b', title: 'PM', jobUrl: 'https://jobs.ashbyhq.com/x/b' }] }),
        [{ title: 'PM', id: 'b', url: 'https://jobs.ashbyhq.com/x/b' }],
    );
});

test('detectAtsBoard tries Greenhouse before Lever and Ashby', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (String(url).includes('boards-api.greenhouse.io') && String(url).includes('/stripe/')) {
            return {
                ok: true,
                status: 200,
                async json() {
                    return { jobs: [{ id: 9, title: 'Software Engineer', absolute_url: 'https://boards.greenhouse.io/stripe/jobs/9' }] };
                },
            };
        }
        return { ok: false, status: 404, async json() { return {}; } };
    };

    const result = await detectAtsBoard(
        { name: 'Stripe', domain: 'stripe.com' },
        { fetchImpl, sleep: async () => {} },
    );

    assert.equal(result.source, 'greenhouse');
    assert.equal(result.boardToken, 'stripe');
    assert.equal(result.roles.length, 1);
    assert.equal(result.roles[0].title, 'Software Engineer');
    assert.equal(calls[0], 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs');
    assert.ok(calls.every((url) => !String(url).includes('lever') && !String(url).includes('ashby')));
});

test('detectAtsBoard falls through to Lever when Greenhouse misses', async () => {
    const fetchImpl = async (url) => {
        const target = String(url);
        if (target.includes('greenhouse')) {
            return { ok: false, status: 404, async json() { return {}; } };
        }
        if (target.includes('api.lever.co') && target.includes('/palantir')) {
            return {
                ok: true,
                status: 200,
                async json() {
                    return [{ id: '1', text: 'Forward Deployed Engineer', urls: { show: 'https://jobs.lever.co/palantir/1' } }];
                },
            };
        }
        return { ok: false, status: 404, async json() { return {}; } };
    };

    const result = await detectAtsBoard(
        { name: 'Palantir', domain: 'palantir.com' },
        { fetchImpl, sleep: async () => {} },
    );

    assert.equal(result.source, 'lever');
    assert.equal(result.boardToken, 'palantir');
    assert.equal(result.roles[0].title, 'Forward Deployed Engineer');
});
