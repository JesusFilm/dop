/**
 * Locked copy for the confirmation screen shown straight after a submission
 * (§7.2, #7 + the recovery code from #8). Browser-safe and free of Next.js,
 * React, and database concerns so the copy is asserted by a plain unit test and
 * changed in exactly one place.
 */

export const CONFIRMATION_COPY = {
  /** The §7.2 opening; {@link comeBackLine} carries the rest of the paragraph. */
  heading: "Thank you — it's in.",
  /** Labels the code so the screen reads on its own. */
  recoveryCodeLabel: "Your recovery code",
  /**
   * Deliberately loud (§7.2): the code is a bearer credential shown once, and a
   * screenshot is the realistic way a participant keeps it.
   */
  screenshotInstruction: "📸 Screenshot this — it's how you get back in.",
  saveImageButton: "Save code as image",
  /** Shown while the canvas render + share sheet is in flight. */
  saveImagePending: "Preparing…",
  /** Surfaced if the render or share sheet fails — the screenshot still works. */
  saveImageError: "Couldn't save the image — screenshot this screen instead.",
  /** Sends a participant back to their own entry (§7.3 pre-reveal view). */
  backLink: "Back to my request",
} as const;

/**
 * The rest of the §7.2 paragraph, interpolated with the session's configured
 * reveal time. Kept a function rather than a frozen constant because `revealAt`
 * is organizer-set (#14) — hardcoding "11:00 on Monday" would silently lie for
 * any other configured reveal.
 *
 * @param revealPhrase the reveal instant as a weekday phrase, e.g.
 *   "11:00 on Monday" (see `formatZonedWeekdayTime`).
 */
export function comeBackLine(revealPhrase: string): string {
  return (
    `Come back to this page after the reveal time (${revealPhrase}) and ` +
    `we'll show you who you're praying for. Find each other, and pray together.`
  );
}

/**
 * The clock-badge line (§7.2). Takes the bare wall-clock reveal time (e.g.
 * "11:00") so the badge stays short next to the longer paragraph.
 */
export function revealBadgeLine(revealTime: string): string {
  return `See who you're paired with — after ${revealTime}`;
}
