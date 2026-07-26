import { describe, expect, it } from "vitest";
import {
  allocateMinistryPrayerBundles,
  createMinistryPrayerAssignments,
  createMinistryPrayerState,
  getMinistryPrayerBundleSeconds,
  parseMinistryPrayerState,
  validateMinistryPrayerConfiguration,
  type MinistryPrayerConfiguration,
} from "@/lib/journey/ministry-prayer";
import { JULY_MINISTRY_PRAYER_CONFIGURATION } from "@/lib/journey/ministry-prayer-seed";

const configuration: MinistryPrayerConfiguration = {
  bundlesPerRoom: 5,
  bundles: Array.from({ length: 25 }, (_, index) => ({
    id: `bundle-${index + 1}`,
    ministry: `Ministry ${Math.floor(index / 2) + 1}`,
    sections: [
      {
        heading: index % 2 === 0 ? "Praise" : "Prayer",
        points: [`Exact point ${index + 1}`],
      },
    ],
  })),
};

describe("ministry prayer configuration", () => {
  it("validates bounded, single-ministry bundles", () => {
    expect(validateMinistryPrayerConfiguration(configuration)).toEqual(
      configuration,
    );
    expect(
      validateMinistryPrayerConfiguration({
        ...configuration,
        bundles: [
          configuration.bundles[0],
          { ...configuration.bundles[1], id: configuration.bundles[0]?.id },
        ],
      }),
    ).toBeUndefined();
    expect(
      validateMinistryPrayerConfiguration({
        ...configuration,
        bundles: [{ id: "empty", ministry: "Ministry", sections: [] }],
      }),
    ).toBeUndefined();
  });

  it("keeps the July seed complete, exact, and free of staff-person sections", () => {
    expect(JULY_MINISTRY_PRAYER_CONFIGURATION.bundles).toHaveLength(25);
    expect(
      validateMinistryPrayerConfiguration(JULY_MINISTRY_PRAYER_CONFIGURATION),
    ).toBeDefined();
    expect(
      JULY_MINISTRY_PRAYER_CONFIGURATION.bundles[2]?.sections[0]?.points[1],
    ).toBe(
      "NetSuite is scheduled to release their own AI tool within NetSuite by the end of this year. Pray it will be usefuly to us as we look into how we can ultilise AI well in our context as a project in 2027.",
    );
    expect(
      JULY_MINISTRY_PRAYER_CONFIGURATION.bundles.at(-1)?.sections[0]?.points[4],
    ).toBe(
      "For all events this year, that the right couples will sign up, and those who expressed interest in continued growth through small-groups will take those next steps.",
    );
    expect(JSON.stringify(JULY_MINISTRY_PRAYER_CONFIGURATION)).not.toMatch(
      /Staff Personal Prayer Requests|Personal \/ Ministry/i,
    );
    const seededPoints = JULY_MINISTRY_PRAYER_CONFIGURATION.bundles.flatMap(
      (bundle) => bundle.sections.flatMap((section) => section.points),
    );
    expect(seededPoints).toEqual(
      expect.arrayContaining([
        "The FY 26 audit is underway. Pray it goes smoothly and well (it usually does).",
        "For the Young Christian Leaders team (Jessica, Aram, Bugsy, Bianca, Melody, and Chrysalis). They have been working hard on research to understand how to better support young Christians in taking up leadership. As they move into the recommendations phase, please pray that they will remain sensitive to God’s leading throughout this project. For wisdom as we determine how to best care for our students and the movement. And that the recommendations they present would help students feel empowered to say ‘yes’ to leadership and become lifelong labourers.",
        "Awesome Semester 2 outreach! We saw lots of Action Group members and new believers coming to help out at the drink stalls and going out to HoF! And the Student at AUT leading their Semester Outreach.",
        "Praise God for the Otago Mission House! God has provided Chris & Cam who are so on mission with us as we work towards the renovations as well as the partnerships with Tandem that’s making this possible.",
        "We are waiting to hear back on a Trust for some funding towards UTC this year and making it cheaper for athletes to attend. Pray for patience and the Lords leading.",
        "For a successful release of our new “Watch” website. It’s a revamped website providing people with a better experience to watch and search for the most relevant video from the Jesus Film library.",
        "New Established Professionals group (as part of existing WL ministry). We have ~12 people involved so far. Pray for good connection, facilitation of the small group as they meet, and a vision to trust God for.",
        "Wellington South Bapt Church - the Redemptive Family church series &amp; Church-wide conversation.",
        "We’re trusting God that 300+ pastors will join in Marriage Week this year and commit to preaching a message on marriage and the Gospel that week whilst encouraging couples to invest in their marriages.",
      ]),
    );
  });
});

describe("ministry prayer allocation", () => {
  it("covers every unique bundle before deterministic duplicates", () => {
    const rooms = Array.from({ length: 6 }, (_, roomIndex) =>
      allocateMinistryPrayerBundles(configuration, roomIndex),
    );
    const firstTwentyFive = rooms.flat().slice(0, 25);
    expect(new Set(firstTwentyFive).size).toBe(25);
    expect(rooms.every((room) => room.length === 5)).toBe(true);
    expect(rooms.every((room) => new Set(room).size === 5)).toBe(true);
  });

  it("keeps earlier slices stable and leaves excess unique bundles uncovered", () => {
    const before = Array.from({ length: 4 }, (_, roomIndex) =>
      allocateMinistryPrayerBundles(configuration, roomIndex),
    );
    const after = Array.from({ length: 5 }, (_, roomIndex) =>
      allocateMinistryPrayerBundles(configuration, roomIndex),
    );
    expect(after.slice(0, 4)).toEqual(before);
    expect(new Set(before.flat()).size).toBe(20);
  });

  it("avoids concentrating duplicate ministries where alternatives exist", () => {
    const duplicated = Array.from({ length: 8 }, (_, roomIndex) =>
      allocateMinistryPrayerBundles(configuration, roomIndex),
    );
    for (const room of duplicated) {
      const ministries = room.map(
        (id) =>
          configuration.bundles.find((bundle) => bundle.id === id)!.ministry,
      );
      expect(new Set(ministries).size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("ministry prayer assignments", () => {
  it("rotates ten slots fairly across five participants", () => {
    const assignments = createMinistryPrayerAssignments(
      5,
      ["leader", "two", "three", "four", "five"],
      () => 0.5,
    );
    const counts = assignments
      .flat()
      .reduce<Record<string, number>>((result, id) => {
        result[id] = (result[id] ?? 0) + 1;
        return result;
      }, {});
    expect(counts).toEqual({
      leader: 2,
      two: 2,
      three: 2,
      four: 2,
      five: 2,
    });
    expect(
      new Set(assignments.map((pair) => [...pair].sort().join(":"))).size,
    ).toBe(5);
  });

  it("handles one, two, and odd participant counts", () => {
    expect(createMinistryPrayerAssignments(2, ["solo"], () => 0)).toEqual([
      ["solo"],
      ["solo"],
    ]);
    expect(
      createMinistryPrayerAssignments(2, ["one", "two"], () => 0).map((pair) =>
        [...pair].sort(),
      ),
    ).toEqual([
      ["one", "two"],
      ["one", "two"],
    ]);
    expect(
      createMinistryPrayerAssignments(5, ["one", "two", "three"], () => 0)
        .flat()
        .every((id) => ["one", "two", "three"].includes(id)),
    ).toBe(true);
  });
});

describe("ministry prayer state", () => {
  it("creates and parses compact persistent state", () => {
    const state = createMinistryPrayerState(
      configuration,
      0,
      [{ id: "leader" }, { id: "member" }],
      new Date("2026-07-27T00:00:00.000Z"),
      () => 0,
    );
    expect(parseMinistryPrayerState(state, configuration)).toEqual(state);
    expect(state.bundleIds).toHaveLength(5);
    expect(state.assignments).toHaveLength(5);
  });

  it("rejects invalid indexes, assignments, bundle ids, and timestamps", () => {
    const valid = createMinistryPrayerState(
      configuration,
      0,
      [{ id: "leader" }, { id: "member" }],
      new Date("2026-07-27T00:00:00.000Z"),
      () => 0,
    );
    expect(
      parseMinistryPrayerState({ ...valid, bundleIndex: 5 }, configuration),
    ).toBeUndefined();
    expect(
      parseMinistryPrayerState(
        { ...valid, assignments: valid.assignments.slice(1) },
        configuration,
      ),
    ).toBeUndefined();
    expect(
      parseMinistryPrayerState(
        {
          ...valid,
          assignments: [[], ...valid.assignments.slice(1)],
        },
        configuration,
      ),
    ).toBeUndefined();
    expect(
      parseMinistryPrayerState(
        { ...valid, bundleIds: ["missing", ...valid.bundleIds.slice(1)] },
        configuration,
      ),
    ).toBeUndefined();
    expect(
      parseMinistryPrayerState(
        { ...valid, bundleStartedAt: "not-a-date" },
        configuration,
      ),
    ).toBeUndefined();
  });

  it("derives the bundle interval from module configuration", () => {
    expect(getMinistryPrayerBundleSeconds(2_400, configuration)).toBe(480);
  });
});
