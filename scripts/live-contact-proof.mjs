/**
 * Live contact-layer proof: real ATS boards + real SMTP verification.
 */
import { detectAtsBoard } from '../src/ats.js';
import { createContactVerifier, skippedContact } from '../src/contact.js';
import { summarizeRoles } from '../src/functions.js';
import { computeSignal, diffMatchedRoles } from '../src/state.js';

const tracked = ['sales', 'engineering', 'marketing'];
const threshold = 2;
const companies = [
    { name: 'Stripe', domain: 'stripe.com' },
    { name: 'Palantir', domain: 'palantir.com' },
    { name: 'OpenAI', domain: 'openai.com' },
    { name: 'Acme Widget Labs', domain: 'acme-widget-labs.com' },
    // Same domain twice — concurrency edge case for the shared gate.
    { name: 'Stripe Duplicate', domain: 'stripe.com' },
];

const contacts = createContactVerifier({
    maxConcurrentPerDomain: 2,
    smtpTimeoutMs: 12_000,
    checkCatchAll: true,
    checkRoleAccounts: true,
});

const rows = [];
for (const company of companies) {
    const started = Date.now();
    const board = await detectAtsBoard(company);
    const summary = summarizeRoles(board.roles, tracked);
    const diff = diffMatchedRoles(summary.matchedTitles, null, tracked);
    const signal = computeSignal({
        matchedRoles: summary.matchedRoles,
        newRoleCount: diff.newRoleIds.length,
        isBaseline: diff.isBaseline,
        signalThreshold: threshold,
    });

    let contact = skippedContact();
    let contactStarted = null;
    if (board.source && signal.meetsThreshold) {
        contactStarted = Date.now();
        contact = await contacts.findContact(company.domain);
    }

    rows.push({
        name: company.name,
        domain: company.domain,
        source: board.source,
        matchedRoles: summary.matchedRoles,
        signalScore: signal.signalScore,
        meetsThreshold: signal.meetsThreshold,
        verifiedContact: contact.verifiedContact,
        contactStatus: contact.contactStatus,
        contactSource: contact.contactSource || null,
        contactChecks: contact.contactChecks,
        contactReason: contact.contactReason,
        contactMs: contactStarted == null ? 0 : Date.now() - contactStarted,
        totalMs: Date.now() - started,
    });
    console.log(JSON.stringify(rows[rows.length - 1]));
}

console.log(JSON.stringify({ summary: rows }, null, 2));
