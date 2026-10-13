import assert from 'node:assert/strict';
import test from 'node:test';

import { categorizeTitle, summarizeRoles, titleMatchesKeyword } from '../src/functions.js';

const tracked = ['sales', 'engineering', 'marketing'];
const withProduct = ['sales', 'engineering', 'marketing', 'product', 'data'];

test('titles map to the first matching tracked function', () => {
    assert.equal(categorizeTitle('Senior Software Engineer', tracked), 'engineering');
    assert.equal(categorizeTitle('Account Executive, Enterprise', tracked), 'sales');
    assert.equal(categorizeTitle('Product Marketing Manager', tracked), 'marketing');
    assert.equal(categorizeTitle('Sales Engineer', tracked), 'sales');
    assert.equal(categorizeTitle('Office Manager', tracked), null);
});

test('keyword matching is whole-word only', () => {
    assert.equal(titleMatchesKeyword('aeo analyst', 'ae'), false);
    assert.equal(titleMatchesKeyword('enterprise ae', 'ae'), true);
    assert.equal(titleMatchesKeyword('presales consultant', 'sales'), false);
    assert.equal(titleMatchesKeyword('enterprise sales lead', 'sales'), true);
    assert.equal(categorizeTitle('AEO Strategist', tracked), null);
    assert.equal(categorizeTitle('Presales Consultant', tracked), null);
});

test('generic revenue and growth words are not standalone triggers', () => {
    assert.equal(categorizeTitle('Revenue Suite Product Lead', tracked), null);
    assert.equal(categorizeTitle('Revenue Foundations', tracked), null);
    assert.equal(categorizeTitle('Growth Lead', tracked), null);
    assert.equal(categorizeTitle('Growth Marketing Lead', tracked), 'marketing');
});

test('bare developer is not an engineering trigger', () => {
    assert.equal(categorizeTitle('Product Manager - Developer Experience', withProduct), 'product');
    assert.equal(categorizeTitle('Product Analytics - Developer Experience', withProduct), 'data');
    assert.equal(categorizeTitle('Software Developer', tracked), 'engineering');
    assert.equal(categorizeTitle('Developer Experience Engineer', tracked), 'engineering');
});

test('technical account manager is sales by deliberate judgement', () => {
    assert.equal(categorizeTitle('Technical Account Manager', tracked), 'sales');
    assert.equal(categorizeTitle('Senior Technical Account Manager, Enterprise', tracked), 'sales');
});

test('support before engineer does not default into engineering', () => {
    assert.equal(categorizeTitle('Technical Support Engineer', tracked), null);
    assert.equal(categorizeTitle('Customer Support Engineer', tracked), null);
    assert.equal(categorizeTitle('Support Engineer', tracked), null);
    assert.equal(categorizeTitle('Enterprise Support Engineer', tracked), null);
    assert.equal(categorizeTitle('Software Engineer', tracked), 'engineering');
    assert.equal(categorizeTitle('Security Engineer', tracked), 'engineering');
    assert.equal(
        categorizeTitle('Technical Support Engineer', ['sales', 'engineering', 'marketing', 'support']),
        'support',
    );
});

test('pre-sales titles are excluded from sales after the word-boundary fix', () => {
    // No longer sales. Architect/Consultant stay unmatched; "... Engineer" can
    // still hit engineering via the engineer token — documented judgement call.
    assert.equal(categorizeTitle('Pre-sales Solutions Architect', tracked), null);
    assert.equal(categorizeTitle('Pre Sales Consultant', tracked), null);
    assert.equal(categorizeTitle('Presales Consultant', tracked), null);
    assert.equal(categorizeTitle('Presales Engineer', tracked), 'engineering');
});

test('summarizeRoles counts each role once and builds the breakdown', () => {
    const summary = summarizeRoles([
        { title: 'Backend Engineer' },
        { title: 'SDR' },
        { title: 'Growth Marketing Lead' },
        { title: 'Staff Software Engineer' },
        { title: 'Receptionist' },
        { title: 'AEO Analyst' },
        { title: 'Revenue Suite PM' },
    ], tracked);

    assert.equal(summary.matchedRoles, 4);
    assert.deepEqual(summary.functionBreakdown, {
        sales: 1,
        engineering: 2,
        marketing: 1,
    });
    assert.equal(summary.matchedTitles[0].function, 'engineering');
    assert.equal(summary.matchedTitles[1].function, 'sales');
});
