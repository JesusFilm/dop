import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_COPY,
  comeBackLine,
  revealBadgeLine,
} from "@/lib/confirmation";

describe("confirmation copy (§7.2)", () => {
  it("reads as the locked §7.2 thank-you paragraph", () => {
    expect(
      `${CONFIRMATION_COPY.heading} ${comeBackLine("11:00 on Monday")}`,
    ).toBe(
      "Thank you — it's in. Come back to this page after the reveal time " +
        "(11:00 on Monday) and we'll show you who you're praying for. " +
        "Find each other, and pray together.",
    );
  });

  it("interpolates the session's configured reveal time rather than freezing 11:00", () => {
    // The reveal instant is organizer-set (#14), so the copy must follow it.
    expect(comeBackLine("14:30 on Saturday")).toContain("(14:30 on Saturday)");
    expect(comeBackLine("14:30 on Saturday")).not.toContain("11:00");
  });

  it("states the reveal time on the clock badge", () => {
    expect(revealBadgeLine("11:00")).toBe(
      "See who you're paired with — after 11:00",
    );
    expect(revealBadgeLine("14:30")).toBe(
      "See who you're paired with — after 14:30",
    );
  });

  it("shouts the screenshot instruction, because the code is the only way back", () => {
    expect(CONFIRMATION_COPY.screenshotInstruction).toBe(
      "📸 Screenshot this — it's how you get back in.",
    );
    expect(CONFIRMATION_COPY.saveImageButton).toBe("Save code as image");
  });
});
