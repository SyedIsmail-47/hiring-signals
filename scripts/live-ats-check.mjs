import { detectAtsBoard } from '../src/ats.js';
import { summarizeRoles } from '../src/functions.js';
import { normalizeInput } from '../src/input.js';

const input = normalizeInput({
    companies: [
        { name: 'Stripe', domain: 'stripe.com' },
        { name: 'Palantir', domain: 'palantir.com' },
        { name: 'OpenAI', domain: 'openai.com' },
        { name: 'No Board Co', domain: 'example.com' },
    ],
    trackedFunctions: ['sales', 'engineering', 'marketing'],
    signalThreshold: 2,
});

const started = Date.now();
const rows = [];

for (const company of input.companies) {
    const companyStarted = Date.now();
    const board = await detectAtsBoard(company);
    const summary = summarizeRoles(board.roles, input.trackedFunctions);
    const row = {
        name: company.name,
        domain: company.domain,
        source: board.source,
        boardToken: board.boardToken,
        totalRoles: board.roles.length,
        matchedRoles: summary.matchedRoles,
        functionBreakdown: summary.functionBreakdown,
        meetsThreshold: summary.matchedRoles >= input.signalThreshold,
        durationMs: Date.now() - companyStarted,
        sampleMatched: summary.matchedTitles.slice(0, 5).map((item) => `${item.function}: ${item.title}`),
        attempts: board.attempts.map((item) => `${item.source}/${item.boardToken}:${item.status}`),
    };
    rows.push(row);
    console.log(JSON.stringify(row, null, 2));
}

console.log(JSON.stringify({
    totalMs: Date.now() - started,
    companies: rows.map((row) => ({
        name: row.name,
        source: row.source,
        boardToken: row.boardToken,
        totalRoles: row.totalRoles,
        matchedRoles: row.matchedRoles,
        functionBreakdown: row.functionBreakdown,
        meetsThreshold: row.meetsThreshold,
        durationMs: row.durationMs,
    })),
}, null, 2));
