import { createDomainGate } from '../vendor/email-verify/domainGate.js';
import { loadDisposableDomains } from '../vendor/email-verify/disposable.js';
import { createMxLookup } from '../vendor/email-verify/mx.js';
import { STATUS } from '../vendor/email-verify/result.js';
import { verifyEmail } from '../vendor/email-verify/verify.js';

/** Local-parts checked in order. Stop at the first valid. */
export const CONTACT_LOCAL_PARTS = /** @type {const} */ ([
    'careers',
    'jobs',
    'recruiting',
    'hr',
]);

export const CONTACT_STATUS = Object.freeze({
    valid: 'valid',
    risky: 'risky',
    not_found: 'not_found',
    unknown: 'unknown',
    skipped: 'skipped',
});

/**
 * @param {string} domain
 * @returns {{ email: string, source: string }[]}
 */
export function contactCandidates(domain) {
    const host = String(domain).trim().toLowerCase();
    return CONTACT_LOCAL_PARTS.map((local) => ({
        email: `${local}@${host}`,
        source: local,
    }));
}

/**
 * Shared verifier deps for one Actor run (one domain gate for all companies).
 * @param {{
 *   maxConcurrentPerDomain?: number,
 *   smtpTimeoutMs?: number,
 *   checkCatchAll?: boolean,
 *   checkRoleAccounts?: boolean,
 *   verifyEmail?: typeof verifyEmail,
 *   lookupMx?: (domain: string) => Promise<import('../vendor/email-verify/mx.js').MxLookup>,
 *   disposableDomains?: Set<string>,
 *   probeMailbox?: unknown,
 * }} [options]
 */
export function createContactVerifier(options = {}) {
    const maxConcurrentPerDomain = options.maxConcurrentPerDomain ?? 2;
    const smtpTimeoutMs = options.smtpTimeoutMs ?? 10_000;
    const gate = createDomainGate(maxConcurrentPerDomain);
    const lookupMx = options.lookupMx ?? createMxLookup({ timeoutMs: smtpTimeoutMs });
    const disposableDomains = options.disposableDomains ?? loadDisposableDomains();
    const verify = options.verifyEmail ?? verifyEmail;

    return {
        gate,
        maxConcurrentPerDomain,
        /**
         * @param {string} domain
         * @param {{ log?: { info: Function, warning: Function } }} [runOptions]
         */
        async findContact(domain, runOptions = {}) {
            return findVerifiedContact(domain, {
                gate,
                verifyEmail: verify,
                lookupMx,
                disposableDomains,
                smtpTimeoutMs,
                checkCatchAll: options.checkCatchAll !== false,
                checkRoleAccounts: options.checkRoleAccounts !== false,
                probeMailbox: options.probeMailbox,
                log: runOptions.log,
            });
        },
    };
}

/**
 * Check careers@ → jobs@ → recruiting@ → hr@ and stop at the first valid.
 * If none are valid, keep the first risky. Otherwise not_found or unknown.
 * @param {string} domain
 * @param {{
 *   gate: (domain: string, fn: () => Promise<unknown>) => Promise<unknown>,
 *   verifyEmail: typeof verifyEmail,
 *   lookupMx: (domain: string) => Promise<import('../vendor/email-verify/mx.js').MxLookup>,
 *   disposableDomains: Set<string>,
 *   smtpTimeoutMs?: number,
 *   checkCatchAll?: boolean,
 *   checkRoleAccounts?: boolean,
 *   probeMailbox?: unknown,
 *   log?: { info: Function, warning: Function },
 * }} options
 */
export async function findVerifiedContact(domain, options) {
    const log = options.log;
    /** @type {{ verifiedContact: string, contactStatus: string, contactSource: string, reason: string } | null} */
    let firstRisky = null;
    let sawUnknown = false;
    let checks = 0;

    for (const candidate of contactCandidates(domain)) {
        checks += 1;
        const result = /** @type {{ email: string, status: string, reason: string }} */ (
            await options.gate(domain, () => options.verifyEmail(candidate.email, {
                lookupMx: options.lookupMx,
                disposableDomains: options.disposableDomains,
                checkRoleAccounts: options.checkRoleAccounts !== false,
                checkCatchAll: options.checkCatchAll !== false,
                smtpTimeoutMs: options.smtpTimeoutMs ?? 10_000,
                probeMailbox: options.probeMailbox,
            }))
        );

        log?.info?.(`Contact check ${candidate.email} → ${result.status} (${result.reason})`);

        if (result.status === STATUS.valid) {
            return {
                verifiedContact: result.email,
                contactStatus: CONTACT_STATUS.valid,
                contactSource: candidate.source,
                contactReason: result.reason,
                contactChecks: checks,
            };
        }

        if (result.status === STATUS.risky && !firstRisky) {
            firstRisky = {
                verifiedContact: result.email,
                contactStatus: CONTACT_STATUS.risky,
                contactSource: candidate.source,
                reason: result.reason,
            };
            // Keep checking for a valid; only fall back to risky if none.
            continue;
        }

        if (result.status === STATUS.unknown) {
            sawUnknown = true;
        }
    }

    if (firstRisky) {
        return {
            verifiedContact: firstRisky.verifiedContact,
            contactStatus: CONTACT_STATUS.risky,
            contactSource: firstRisky.contactSource,
            contactReason: firstRisky.reason,
            contactChecks: checks,
        };
    }

    return {
        verifiedContact: null,
        contactStatus: sawUnknown ? CONTACT_STATUS.unknown : CONTACT_STATUS.not_found,
        contactSource: '',
        contactReason: sawUnknown
            ? 'No candidate returned valid or risky; at least one check was unknown.'
            : 'No candidate returned valid or risky.',
        contactChecks: checks,
    };
}

/**
 * Empty contact fields when ATS is missing or the company is below threshold.
 */
export function skippedContact() {
    return {
        verifiedContact: null,
        contactStatus: CONTACT_STATUS.skipped,
        contactSource: '',
        contactReason: 'Contact lookup skipped.',
        contactChecks: 0,
    };
}
