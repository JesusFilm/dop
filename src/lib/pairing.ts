/**
 * The pure core of the Pairing process (§4, #5): shuffle a session's
 * submissions and form consecutive pairs of two, folding the leftover into the
 * last pair — **exactly one Group of three** — when the count is odd.
 *
 * Kept free of database, Prisma, and Node concerns so the §4 invariants
 * unit-test on plain arrays. The transactional write-once **freeze** that
 * commits the result atomically lives in the sanctioned data layer
 * ({@link module:@/lib/repository.freezePairing}), which calls these helpers;
 * that split keeps all raw-Prisma access — and the Privacy #3 boundary — inside
 * one module.
 */

/** A source of randomness in `[0, 1)`; defaults to {@link Math.random}. */
export type RandomSource = () => number;

/**
 * Returns a new array with `items` randomly permuted (Fisher–Yates), leaving
 * the input untouched. The randomness is injected so tests drive a
 * deterministic permutation while production uses {@link Math.random}. A fair,
 * unbiased shuffle keeps the pairing itself unbiased (§4 step 2).
 */
export function shuffle<T>(
  items: readonly T[],
  random: RandomSource = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Groups already-shuffled member ids per §4 step 3: consecutive **pairs of
 * two**, and when the count is **odd** the final leftover joins the last pair,
 * yielding **exactly one Group of three**. Small-n falls out of the same rule:
 *
 * - `n = 0` → `[]` (nothing to reveal).
 * - `n = 1` → `[]` — a group needs two distinct people, so the lone person is
 *   never self-matched; the reveal surface shows the gentle "not enough people"
 *   message from the *absence* of a group (§4 small-n).
 * - `n = 2` → one pair; `n = 3` → one trio.
 *
 * Pure: the ordering is the caller's ({@link shuffle}), so the invariants —
 * every id in exactly one group, no singletons for `n ≥ 2`, at most one trio —
 * are asserted directly on the returned structure.
 */
export function formGroups<T>(shuffledMembers: readonly T[]): T[][] {
  const n = shuffledMembers.length;

  // A group requires two distinct people (§4 invariant: no self-assignment).
  // Fewer than two means nothing to pair — n=1 is handled by the reveal view,
  // not by inventing a self-matched group here.
  if (n < 2) {
    return [];
  }

  const groups: T[][] = [];
  let index = 0;
  // Consume complete pairs, stopping while at least two members remain.
  for (; index + 2 <= n; index += 2) {
    groups.push([shuffledMembers[index], shuffledMembers[index + 1]]);
  }
  // Odd count → one member is left over; fold it into the last pair so it
  // becomes the single Group of three rather than a self-matched singleton.
  if (index < n) {
    groups[groups.length - 1].push(shuffledMembers[index]);
  }
  return groups;
}
