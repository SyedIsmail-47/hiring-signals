import { Actor, log } from 'apify';

import { normalizeInput } from './input.js';
import { runHiringSignals } from './run.js';

await Actor.main(async () => {
    const input = normalizeInput(await Actor.getInput());
    log.info(
        `Checking ${input.companies.length} compan${input.companies.length === 1 ? 'y' : 'ies'} `
        + `(functions: ${input.trackedFunctions.join(', ')}; threshold: ${input.signalThreshold})`,
    );
    await runHiringSignals(input);
});
