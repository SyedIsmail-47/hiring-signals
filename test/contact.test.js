import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONTACT_STATUS,
    contactCandidates,
    createContactVerifier,
    findVerifiedContact,
    skippedContact,
} from '../src/contact.js';
import { createDomainGate } from '../vendor/email-verify/domainGate.js';

test('contact candidates are careers, jobs, recruiting, hr on the domain', () => {
    assert.deepEqual(contactCandidates('Stripe.COM'), [
        { email: 'careers@stripe.com', source: 'careers' },
        { email: 'jobs@stripe.com', source: 'jobs' },
        { email: 'recruiting@stripe.com', source: 'recruiting' },
        { email: 'hr@stripe.com', source: 'hr' },
    ]);
});

test('stops at the first valid candidate and does not check the rest', async () => {
    const calls = [];
    const gate = createDomainGate(2);
    const result = await findVerifiedContact('example.com', {
        gate,
        async verifyEmail(email) {
            calls.push(email);
            if (email.startsWith('jobs@')) {
                return { email, status: 'valid', reason: 'Mailbox accepted' };
            }
            return { email, status: 'invalid', reason: 'Mailbox rejected by the mail server' };
        },
        async lookupMx() { return { found: true, hosts: ['mx.example.com'], nullMx: false, unreachable: false, timedOut: false }; },
        disposableDomains: new Set(),
    });

    assert.deepEqual(calls, ['careers@example.com', 'jobs@example.com']);
    assert.equal(result.contactStatus, CONTACT_STATUS.valid);
    assert.equal(result.verifiedContact, 'jobs@example.com');
    assert.equal(result.contactSource, 'jobs');
    assert.equal(result.contactChecks, 2);
});

test('falls back to the first risky when nothing is valid', async () => {
    const result = await findVerifiedContact('example.com', {
        gate: createDomainGate(2),
        async verifyEmail(email) {
            if (email.startsWith('recruiting@')) {
                return { email, status: 'risky', reason: 'catch-all domain' };
            }
            if (email.startsWith('hr@')) {
                return { email, status: 'risky', reason: 'catch-all domain' };
            }
            return { email, status: 'invalid', reason: 'Mailbox rejected by the mail server' };
        },
        async lookupMx() { return { found: true, hosts: ['mx.example.com'], nullMx: false, unreachable: false, timedOut: false }; },
        disposableDomains: new Set(),
    });

    assert.equal(result.contactStatus, CONTACT_STATUS.risky);
    assert.equal(result.verifiedContact, 'recruiting@example.com');
    assert.equal(result.contactSource, 'recruiting');
    assert.equal(result.contactChecks, 4);
});

test('returns not_found or unknown when nothing is valid or risky', async () => {
    const notFound = await findVerifiedContact('example.com', {
        gate: createDomainGate(2),
        async verifyEmail(email) {
            return { email, status: 'invalid', reason: 'Mailbox rejected by the mail server' };
        },
        async lookupMx() { return { found: true, hosts: ['mx.example.com'], nullMx: false, unreachable: false, timedOut: false }; },
        disposableDomains: new Set(),
    });
    assert.equal(notFound.contactStatus, CONTACT_STATUS.not_found);
    assert.equal(notFound.verifiedContact, null);

    const unknown = await findVerifiedContact('example.com', {
        gate: createDomainGate(2),
        async verifyEmail(email) {
            return { email, status: 'unknown', reason: 'SMTP connection timed out' };
        },
        async lookupMx() { return { found: true, hosts: ['mx.example.com'], nullMx: false, unreachable: false, timedOut: false }; },
        disposableDomains: new Set(),
    });
    assert.equal(unknown.contactStatus, CONTACT_STATUS.unknown);
    assert.equal(unknown.verifiedContact, null);
});

test('shared domain gate keeps per-domain concurrency when two companies share a domain', async () => {
    let active = 0;
    let peak = 0;
    const verifier = createContactVerifier({
        maxConcurrentPerDomain: 2,
        async verifyEmail(email) {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 40));
            active -= 1;
            return { email, status: 'invalid', reason: 'Mailbox rejected by the mail server' };
        },
        async lookupMx() {
            return { found: true, hosts: ['mx.shared.test'], nullMx: false, unreachable: false, timedOut: false };
        },
        disposableDomains: new Set(),
    });

    await Promise.all([
        verifier.findContact('shared.test'),
        verifier.findContact('shared.test'),
    ]);

    assert.ok(peak <= 2, `peak concurrency was ${peak}`);
    assert.equal(skippedContact().contactStatus, CONTACT_STATUS.skipped);
});
