import { Actor, log } from 'apify';

import { detectAtsBoard } from './ats.js';
import { createContactVerifier, skippedContact } from './contact.js';
import { summarizeRoles } from './functions.js';
import {
    buildCompanyState,
    companyStateKey,
    computeSignal,
    diffMatchedRoles,
} from './state.js';

export const COMPANY_CHECKED_EVENT = 'company-checked';

/**
 * Detect each company's public ATS board, diff matched job IDs, and (when the
 * weighted signal clears the threshold) attach a verified department contact.
 * Contact checks reuse the bulk-email-verifier engine and share one per-domain
 * gate for the whole run. Billing stays a single company-checked event.
 * @param {ReturnType<import('./input.js').normalizeInput>} input
 */
export async function runHiringSignals(input) {
    const store = await Actor.openKeyValueStore();
    const contacts = createContactVerifier({
        maxConcurrentPerDomain: 2,
        smtpTimeoutMs: 10_000,
        checkCatchAll: true,
        checkRoleAccounts: true,
    });

    for (const company of input.companies) {
        log.info(`Checking ${company.name} (${company.domain})`);
        const board = await detectAtsBoard(company);
        const summary = summarizeRoles(board.roles, input.trackedFunctions);

        const stateKey = companyStateKey(company.domain);
        const previous = await store.getValue(stateKey);
        const diff = diffMatchedRoles(
            summary.matchedTitles,
            previous && typeof previous === 'object' ? previous : null,
            input.trackedFunctions,
        );
        const signal = computeSignal({
            matchedRoles: summary.matchedRoles,
            newRoleCount: diff.newRoleIds.length,
            isBaseline: diff.isBaseline,
            signalThreshold: input.signalThreshold,
        });

        const nextState = buildCompanyState({
            domain: company.domain,
            source: board.source,
            boardToken: board.boardToken,
            matchedTitles: summary.matchedTitles,
            trackedFunctions: input.trackedFunctions,
        });
        await store.setValue(stateKey, nextState);

        // No ATS board → nothing to verify. Below threshold → signal only, free skip.
        let contact = skippedContact();
        if (board.source && signal.meetsThreshold) {
            contact = await contacts.findContact(company.domain, { log });
            log.info(
                `${company.name}: contact ${contact.contactStatus}`
                + (contact.verifiedContact ? ` (${contact.verifiedContact})` : '')
                + ` after ${contact.contactChecks} check${contact.contactChecks === 1 ? '' : 's'}`,
            );
        } else if (!board.source) {
            log.info(`${company.name}: contact skipped (no ATS board)`);
        } else {
            log.info(`${company.name}: contact skipped (below threshold)`);
        }

        const record = {
            name: company.name,
            domain: company.domain,
            // Dataset schema marks these as strings; empty means no board matched.
            source: board.source ?? '',
            boardToken: board.boardToken ?? '',
            totalRoles: board.roles.length,
            matchedRoles: summary.matchedRoles,
            functionBreakdown: summary.functionBreakdown,
            isBaseline: diff.isBaseline,
            newRoleIds: diff.newRoleIds,
            removedRoleIds: diff.removedRoleIds,
            newRolesCount: diff.newRoleIds.length,
            removedRolesCount: diff.removedRoleIds.length,
            newRolesByFunction: diff.newRolesByFunction,
            signalScore: signal.signalScore,
            meetsThreshold: signal.meetsThreshold,
            signalThreshold: input.signalThreshold,
            verifiedContact: contact.verifiedContact ?? '',
            contactStatus: contact.contactStatus,
            contactSource: contact.contactSource ?? '',
            matchedTitles: summary.matchedTitles,
        };

        if (board.source) {
            const delta = diff.isBaseline
                ? 'baseline'
                : `+${record.newRolesCount}/-${record.removedRolesCount} ids`;
            log.info(
                `${company.name}: ${board.source}/${board.boardToken} — `
                + `${record.totalRoles} open, ${record.matchedRoles} matched, `
                + `score ${record.signalScore} (${delta})`
                + (record.meetsThreshold ? ' (signal)' : ''),
            );
        } else {
            log.info(`${company.name}: no public Greenhouse, Lever, or Ashby board found`);
        }

        // Charge only when there is a board and the weighted signal clears the
        // threshold. No-board / below-threshold rows are still saved, free.
        const charge = Boolean(board.source && signal.meetsThreshold);
        const chargeResult = await pushCompanyRecord(record, { charge });
        if (chargeResult?.eventChargeLimitReached) {
            log.warning('Spending limit reached. Stopping before more companies are checked.');
            await Actor.exit('Spending limit reached');
        }
    }
}

/**
 * One company-checked event covers the hiring signal and any verified contact.
 * Below-threshold and no-board companies are stored without that event.
 * @param {Record<string, unknown>} record
 * @param {{ charge: boolean }} options
 */
async function pushCompanyRecord(record, options) {
    if (options.charge) {
        try {
            const pricing = Actor.getChargingManager()?.getPricingInfo?.();
            if (pricing?.isPayPerEvent) {
                return await Actor.pushData(record, COMPANY_CHECKED_EVENT);
            }
        } catch (error) {
            log.warning(`Pricing check failed (${error.message}). Saving this company without a charge event.`);
        }
    }
    await Actor.pushData(record);
    return { eventChargeLimitReached: false };
}
