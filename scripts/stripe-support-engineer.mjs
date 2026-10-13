import { detectAtsBoard } from '../src/ats.js';
import { categorizeTitle } from '../src/functions.js';

const tracked = ['sales', 'engineering', 'marketing'];
const board = await detectAtsBoard({ name: 'Stripe', domain: 'stripe.com' });
const supportEngineer = board.roles
    .map((role) => role.title)
    .filter((title) => /\bsupport\b/i.test(title) && /\bengineer\b/i.test(title));

const rows = supportEngineer.map((title) => ({
    title,
    function: categorizeTitle(title, tracked),
    supportBeforeEngineer: /\bsupport\b(?=.*\bengineer\b)/i.test(title),
}));

console.log(JSON.stringify({
    source: board.source,
    boardToken: board.boardToken,
    totalRoles: board.roles.length,
    supportAndEngineerCount: rows.length,
    stillEngineering: rows.filter((row) => row.function === 'engineering'),
    byFunction: rows.reduce((acc, row) => {
        const key = row.function ?? 'null';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {}),
    titles: rows,
}, null, 2));
