import { formatSimSummary, runSimBatch } from './sim.ts';

function parsePositiveInt(raw: string | undefined, flag: string, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid ${flag}="${raw}", using default ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function parseNonNegInt(raw: string | undefined, flag: string, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`Invalid ${flag}="${raw}", using default ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function parseArgs(argv: string[]): { runs: number; seed: number } {
  let runs = 200;
  let seed = 1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs' && i + 1 < argv.length) {
      runs = parsePositiveInt(argv[i + 1], '--runs', runs);
      i += 1;
    } else if (arg.startsWith('--runs=')) {
      runs = parsePositiveInt(arg.slice('--runs='.length), '--runs', runs);
    } else if (arg === '--seed' && i + 1 < argv.length) {
      seed = parseNonNegInt(argv[i + 1], '--seed', seed);
      i += 1;
    } else if (arg.startsWith('--seed=')) {
      seed = parseNonNegInt(arg.slice('--seed='.length), '--seed', seed);
    }
  }

  return { runs, seed };
}

const config = parseArgs(process.argv.slice(2));
const summary = runSimBatch(config);
console.log(formatSimSummary(summary));
process.exit(0);
