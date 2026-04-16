export interface ReconcileAccountCandidate {
  id: string;
  name: string;
}

export interface RankedAccountCandidate extends ReconcileAccountCandidate {
  score: number;
}

const TOKEN_SCORE_WEIGHT = 0.85;
const BIGRAM_SCORE_WEIGHT = 0.95;

export function normalizeReconciliationString(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeReconciliationString(value).split(' ').filter(Boolean));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / (a.size + b.size - overlap);
}

function diceBigramsScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const aBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    aBigrams.set(gram, (aBigrams.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const count = aBigrams.get(gram) ?? 0;
    if (count > 0) {
      overlap++;
      aBigrams.set(gram, count - 1);
    }
  }

  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
}

export function scoreReconciledAccountName(source: string, target: string): number {
  const normalizedSource = normalizeReconciliationString(source);
  const normalizedTarget = normalizeReconciliationString(target);

  if (!normalizedSource || !normalizedTarget) return 0;
  if (normalizedSource === normalizedTarget) return 1;

  let score = 0;

  if (
    normalizedSource.startsWith(normalizedTarget)
    || normalizedTarget.startsWith(normalizedSource)
  ) {
    score = Math.max(score, 0.9);
  }

  if (
    normalizedSource.includes(normalizedTarget)
    || normalizedTarget.includes(normalizedSource)
  ) {
    score = Math.max(score, 0.8);
  }

  const tokenScore = jaccardScore(tokenSet(source), tokenSet(target));
  const bigramScore = diceBigramsScore(normalizedSource, normalizedTarget);
  score = Math.max(score, tokenScore * TOKEN_SCORE_WEIGHT, bigramScore * BIGRAM_SCORE_WEIGHT);

  return Math.round(Math.min(1, score) * 10000) / 10000;
}

export function rankReconciledAccountCandidates(
  source: string,
  candidates: ReconcileAccountCandidate[],
  limit = 5,
): RankedAccountCandidate[] {
  return candidates
    .map(candidate => ({
      ...candidate,
      score: scoreReconciledAccountName(source, candidate.name),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.abs(a.name.length - source.length) - Math.abs(b.name.length - source.length);
    })
    .slice(0, Math.max(0, limit));
}
