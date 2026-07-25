import { describe, expect, it } from "vitest";

import { formGroups, shuffle } from "@/lib/pairing";

describe("formGroups", () => {
  it("returns nothing for n=0 (§4 small-n: nothing to reveal)", () => {
    expect(formGroups([])).toEqual([]);
  });

  it("returns nothing for n=1 so the lone person is never self-matched", () => {
    // A group needs two distinct people; n=1 shows the gentle "not enough
    // people" message from the absence of a group, not a singleton (§4).
    expect(formGroups(["a"])).toEqual([]);
  });

  it("pairs n=2 into one pair", () => {
    expect(formGroups(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("groups n=3 into exactly one trio", () => {
    expect(formGroups(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("splits an even count into pairs of two", () => {
    expect(formGroups(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("folds the odd leftover into the last pair, making one trio", () => {
    expect(formGroups(["a", "b", "c", "d", "e"])).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    const copy = [...input];
    formGroups(input);
    expect(input).toEqual(copy);
  });

  describe("§4 invariants hold for every count up to 9", () => {
    for (let n = 0; n <= 9; n += 1) {
      it(`n=${n}: everyone in exactly one group, ≥2 per group, ≤1 trio`, () => {
        const members = Array.from({ length: n }, (_, i) => `s${i}`);
        const groups = formGroups(members);
        const flattened = groups.flat();

        // Every submission is in exactly one group — no one left out, no
        // duplicates (for n ≥ 2; n < 2 yields no groups).
        if (n >= 2) {
          expect([...flattened].sort()).toEqual([...members].sort());
        } else {
          expect(groups).toEqual([]);
        }

        // No self-assignment: every group has at least two distinct members.
        for (const group of groups) {
          expect(group.length).toBeGreaterThanOrEqual(2);
          expect(new Set(group).size).toBe(group.length);
        }

        // Membership is mutual: each member belongs to exactly the group that
        // holds its partners, so being in someone's group is reciprocal (§4).
        const groupOf = new Map<string, number>();
        groups.forEach((group, groupIndex) => {
          for (const member of group) {
            groupOf.set(member, groupIndex);
          }
        });
        groups.forEach((group, groupIndex) => {
          for (const member of group) {
            for (const partner of group) {
              expect(groupOf.get(partner)).toBe(groupIndex);
            }
            expect(groupOf.get(member)).toBe(groupIndex);
          }
        });

        // At most one group larger than a pair, and it only exists when odd.
        const trios = groups.filter((group) => group.length === 3);
        expect(trios.length).toBe(n >= 3 && n % 2 === 1 ? 1 : 0);
        expect(groups.every((group) => group.length <= 3)).toBe(true);
      });
    }
  });
});

describe("shuffle", () => {
  it("returns a permutation of the input (same multiset)", () => {
    const input = ["a", "b", "c", "d", "e"];
    const result = shuffle(input, cyclingRandom([0.9, 0.1, 0.5, 0.3]));
    expect([...result].sort()).toEqual([...input].sort());
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    const copy = [...input];
    shuffle(input, cyclingRandom([0.5, 0.2]));
    expect(input).toEqual(copy);
  });

  it("permutes deterministically for a fixed random source", () => {
    // random()=0 makes Fisher–Yates pick index 0 at each swap — a fixed,
    // reproducible permutation: [a,b,c] → swap(2,0) [c,b,a] → swap(1,0) [b,c,a].
    expect(shuffle(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
  });
});

/**
 * A deterministic {@link RandomSource} cycling through preset values, so a
 * shuffle can be asserted without a real RNG.
 */
function cyclingRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}
