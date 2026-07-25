import { describe, expect, it } from "vitest";

import {
  formatFullName,
  formatNameList,
  nextSteps,
  pairedHeading,
  partnersOf,
  requestCardHeading,
  RETURN_COPY,
  selectReturnState,
  sharedAtLine,
} from "@/lib/return-view";

describe("formatFullName", () => {
  it("joins first and last name — the full name a partner reads (#13)", () => {
    expect(formatFullName({ firstName: "Ana", lastName: "Silva" })).toBe(
      "Ana Silva",
    );
  });

  it("tolerates stray whitespace around the stored parts", () => {
    expect(formatFullName({ firstName: " Ana ", lastName: " Silva " })).toBe(
      "Ana Silva",
    );
  });
});

describe("formatNameList", () => {
  it("renders a single partner (the pair case)", () => {
    expect(formatNameList(["Ana Silva"])).toBe("Ana Silva");
  });

  it("renders two partners with 'and' (the trio case, §7.3)", () => {
    expect(formatNameList(["Ana Silva", "Ben Lee"])).toBe(
      "Ana Silva and Ben Lee",
    );
  });

  it("renders three or more with commas and a final 'and'", () => {
    expect(formatNameList(["Ana Silva", "Ben Lee", "Cara Ng"])).toBe(
      "Ana Silva, Ben Lee and Cara Ng",
    );
  });

  it("returns an empty string for no names", () => {
    expect(formatNameList([])).toBe("");
  });
});

describe("pairedHeading", () => {
  it("names the single partner and sends them into the room (§7.3)", () => {
    expect(pairedHeading(["Ana Silva"])).toBe(
      "You're paired with Ana Silva · go find them in the room",
    );
  });

  it("names both partners in the trio header (§7.3)", () => {
    expect(pairedHeading(["Ana Silva", "Ben Lee"])).toBe(
      "You're paired with Ana Silva and Ben Lee · go find them in the room",
    );
  });
});

describe("requestCardHeading", () => {
  it("labels the card with the partner's full name (§7.3, #13)", () => {
    expect(requestCardHeading("Ana Silva")).toBe("Ana Silva asked prayer for");
  });
});

describe("sharedAtLine", () => {
  it("states the submit time and that the entry locks at the reveal (§7.3)", () => {
    expect(sharedAtLine("09:41", "11:00")).toBe(
      "Shared at 09:41 · locked at 11:00",
    );
  });
});

describe("nextSteps", () => {
  it("gives exactly the two numbered 'what happens next' steps (§7.3)", () => {
    const steps = nextSteps("11:00");
    expect(steps).toHaveLength(2);
    // Step one is the reveal moment, named with the organizer-set time (#14) so
    // the copy never hardcodes Monday's 11:00.
    expect(steps[0]).toContain("11:00");
    // Step two is the in-person connection — no messaging, no contact exchange.
    expect(steps[1]).toMatch(/in person/i);
  });
});

describe("RETURN_COPY", () => {
  it("keeps the pre-reveal status header and the edit affordance (§7.3)", () => {
    expect(RETURN_COPY.preRevealHeading).toBe("Your request is in");
    expect(RETURN_COPY.editSummary).toBe("Edit my request");
  });

  it("never offers messaging, contact exchange, or 'mark as prayed' (§7.3, #6)", () => {
    const allCopy = [
      ...Object.values(RETURN_COPY),
      ...nextSteps("11:00"),
      pairedHeading(["Ana Silva"]),
      requestCardHeading("Ana Silva"),
    ]
      .join(" ")
      .toLowerCase();
    expect(allCopy).not.toMatch(/message|text them|phone number|email/);
    expect(allCopy).not.toMatch(/mark as prayed|mark prayed/);
  });
});

describe("partnersOf", () => {
  const self = {
    submissionId: "me",
    firstName: "Me",
    lastName: "Myself",
    request: "my own request",
    isSelf: true,
  };
  const ana = {
    submissionId: "a",
    firstName: "Ana",
    lastName: "Silva",
    request: "her request",
    isSelf: false,
  };
  const ben = {
    submissionId: "b",
    firstName: "Ben",
    lastName: "Lee",
    request: "his request",
    isSelf: false,
  };

  it("drops the caller so only partners get request cards (a pair)", () => {
    expect(partnersOf({ groupId: "g", members: [self, ana] })).toEqual([ana]);
  });

  it("keeps both partners, in group order, for a trio (§7.3)", () => {
    expect(partnersOf({ groupId: "g", members: [ana, self, ben] })).toEqual([
      ana,
      ben,
    ]);
  });

  it("returns no partners for a null assignment (not yet in a frozen group)", () => {
    expect(partnersOf(null)).toEqual([]);
  });
});

describe("selectReturnState", () => {
  it("shows the submit screen to a new visitor before the reveal (§7.1)", () => {
    expect(
      selectReturnState({
        hasEntry: false,
        revealOpen: false,
        pairingFrozen: false,
        partnerCount: 0,
      }),
    ).toBe("submit");
  });

  it("shows the guided pre-reveal steps to someone with an entry (§7.3)", () => {
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: false,
        pairingFrozen: false,
        partnerCount: 0,
      }),
    ).toBe("pre-reveal");
  });

  it("never shows a partner before the reveal, even once pairing is frozen", () => {
    // The freeze cannot legitimately precede the reveal (§4/§5), but the gate
    // must not depend on that: pre-reveal is decided by the clock alone, so a
    // mis-fired early freeze can never leak a partner's request.
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: false,
        pairingFrozen: true,
        partnerCount: 1,
      }),
    ).toBe("pre-reveal");
  });

  it("shows the partner card(s) after the reveal when a group exists (§7.3)", () => {
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: true,
        pairingFrozen: true,
        partnerCount: 1,
      }),
    ).toBe("paired");
    // A trio is the same state — two partners, two cards.
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: true,
        pairingFrozen: true,
        partnerCount: 2,
      }),
    ).toBe("paired");
  });

  it("shows the gentle small-n message to the lone participant (§4)", () => {
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: true,
        pairingFrozen: true,
        partnerCount: 0,
      }),
    ).toBe("lone");
  });

  it("waits, rather than claiming to be alone, when the freeze hasn't fired", () => {
    // Reveal has passed but nothing is frozen yet (the triggers land in #22):
    // a brief wait, not the permanent "no one to pair you with" state.
    expect(
      selectReturnState({
        hasEntry: true,
        revealOpen: true,
        pairingFrozen: false,
        partnerCount: 0,
      }),
    ).toBe("pending-freeze");
  });

  it("offers recovery-code entry to a visitor with no entry after the reveal (§7.3, §7.4)", () => {
    // Submissions have hard-closed (§6), so restoring an existing entry is the
    // only way forward — never a second submission.
    expect(
      selectReturnState({
        hasEntry: false,
        revealOpen: true,
        pairingFrozen: true,
        partnerCount: 0,
      }),
    ).toBe("recover");
  });
});
