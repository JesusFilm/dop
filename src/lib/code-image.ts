/**
 * Rendering the recovery code to a shareable image (§7.2, #8): the canvas
 * drawing, the file name, and the Web Share file-support probe. Pure and
 * browser-safe — it touches no DOM globals of its own, so the drawing and the
 * capability check unit-test with plain fakes while the client component stays a
 * thin shell over `document.createElement("canvas")` and `navigator.share`.
 */

/** Pixel size of the generated image — square, so it looks right in a photo roll. */
export const CODE_IMAGE_SIZE = { width: 1080, height: 1080 } as const;

/**
 * The slice of `CanvasRenderingContext2D` the drawing uses. Narrowed to what we
 * call so the drawing is testable with a recording fake and needs no DOM.
 */
export type CodeImageContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "font" | "textAlign" | "textBaseline" | "fillRect" | "fillText"
>;

/** The characters `generateRecoveryCode` draws from (see `@/lib/tokens`). */
const CODE_CHARACTERS = /[^A-Z0-9]/g;

/**
 * Paints the recovery code onto a 2D context as a self-contained card. The
 * image leaves the app for someone's photo roll, so it repeats the context the
 * surrounding page gave it: what the event is, that this is the recovery code,
 * and what to do with it.
 */
export function drawRecoveryCodeImage(
  context: CodeImageContext,
  recoveryCode: string,
): void {
  const { width, height } = CODE_IMAGE_SIZE;
  const centre = width / 2;

  // A shared PNG keeps its alpha channel, so an unpainted background would show
  // up as transparent (often black) in a photo roll. Paint it explicitly.
  context.fillStyle = "#f3f6ff";
  context.fillRect(0, 0, width, height);

  context.textAlign = "center";
  context.textBaseline = "middle";

  context.fillStyle = "#2d3a7b";
  context.font = "600 52px system-ui, sans-serif";
  context.fillText("Day of Prayer", centre, height * 0.22);

  context.fillStyle = "#555f8a";
  context.font = "400 44px system-ui, sans-serif";
  context.fillText("Your recovery code", centre, height * 0.34);

  context.fillStyle = "#1b2559";
  context.font = "700 180px ui-monospace, monospace";
  context.fillText(recoveryCode, centre, height * 0.52);

  context.fillStyle = "#555f8a";
  context.font = "400 40px system-ui, sans-serif";
  context.fillText("Enter this code to get back in", centre, height * 0.7);
  context.fillText("on any phone.", centre, height * 0.76);
}

/**
 * The share/download file name. Includes the code so a photo roll stays
 * searchable, and strips any non-code character — the value reaches a file name,
 * so it is sanitized here rather than trusted.
 */
export function recoveryCodeImageFileName(recoveryCode: string): string {
  const safe = recoveryCode.toUpperCase().replace(CODE_CHARACTERS, "");
  return `prayer-recovery-code-${safe}.png`;
}

/** The `navigator` members the share path needs; both are optional in the wild. */
interface ShareCapableNavigator {
  share?: (data: { files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

/**
 * Whether this browser can share a *file* via the Web Share API (§7.2 — the
 * save-as-image affordance is hidden where it can't). Requires both `share` and
 * a `canShare` that accepts the actual file: `navigator.share` alone is not
 * enough (desktop Chrome has it but refuses files), and a `share` without
 * `canShare` can't be verified, so we hide rather than offer a button that
 * throws. The screenshot instruction is the fallback everywhere.
 *
 * @param probe the real file we intend to share — `canShare` inspects its type.
 */
export function supportsFileShare(
  navigatorLike: ShareCapableNavigator | undefined,
  probe: File,
): boolean {
  if (
    typeof navigatorLike?.share !== "function" ||
    typeof navigatorLike.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigatorLike.canShare({ files: [probe] });
  } catch {
    // A throwing canShare is a hard "no" — treat it as unsupported.
    return false;
  }
}
