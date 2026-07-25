import { describe, expect, it, vi } from "vitest";

import {
  CODE_IMAGE_SIZE,
  drawRecoveryCodeImage,
  recoveryCodeImageFileName,
  supportsFileShare,
  type CodeImageContext,
} from "@/lib/code-image";

/** A recording stand-in for the 2D canvas context the browser supplies. */
function fakeContext(): CodeImageContext & {
  fills: string[];
  rects: number[][];
} {
  const fills: string[] = [];
  const rects: number[][] = [];
  return {
    fills,
    rects,
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push([x, y, w, h]);
    }),
    fillText: vi.fn((text: string) => {
      fills.push(text);
    }),
  };
}

describe("drawRecoveryCodeImage", () => {
  it("paints a full-bleed background so the shared image isn't transparent", () => {
    const ctx = fakeContext();

    drawRecoveryCodeImage(ctx, "K7QM2X");

    expect(ctx.rects).toContainEqual([
      0,
      0,
      CODE_IMAGE_SIZE.width,
      CODE_IMAGE_SIZE.height,
    ]);
  });

  it("draws the recovery code and the screenshot-substitute caption", () => {
    const ctx = fakeContext();

    drawRecoveryCodeImage(ctx, "K7QM2X");

    expect(ctx.fills).toContain("K7QM2X");
    // The image travels alone into someone's photo roll, so it has to say what
    // the code is for without the surrounding page.
    expect(ctx.fills.join(" ")).toMatch(/recovery code/i);
    expect(ctx.fills.join(" ")).toMatch(/day of prayer/i);
  });
});

describe("recoveryCodeImageFileName", () => {
  it("names the file after the code so a photo roll stays searchable", () => {
    expect(recoveryCodeImageFileName("K7QM2X")).toBe(
      "prayer-recovery-code-K7QM2X.png",
    );
  });

  it("strips anything that isn't a code character out of the file name", () => {
    expect(recoveryCodeImageFileName("../etc/passwd")).toBe(
      "prayer-recovery-code-ETCPASSWD.png",
    );
  });
});

describe("supportsFileShare", () => {
  const file = new File([new Uint8Array([1])], "code.png", {
    type: "image/png",
  });

  it("is true only when both share and file-aware canShare are present", () => {
    expect(
      supportsFileShare(
        { share: () => Promise.resolve(), canShare: () => true },
        file,
      ),
    ).toBe(true);
  });

  it("is false when the browser has no Web Share API at all", () => {
    expect(supportsFileShare(undefined, file)).toBe(false);
    expect(supportsFileShare({}, file)).toBe(false);
  });

  it("is false when share exists but file sharing is unsupported (§7.2 graceful hide)", () => {
    // Desktop Chrome: navigator.share exists, canShare rejects files.
    expect(
      supportsFileShare(
        { share: () => Promise.resolve(), canShare: () => false },
        file,
      ),
    ).toBe(false);
    // Older Safari: share without canShare — we can't verify file support, so
    // hide rather than offer a button that throws.
    expect(supportsFileShare({ share: () => Promise.resolve() }, file)).toBe(
      false,
    );
  });

  it("is false when canShare throws", () => {
    expect(
      supportsFileShare(
        {
          share: () => Promise.resolve(),
          canShare: () => {
            throw new Error("nope");
          },
        },
        file,
      ),
    ).toBe(false);
  });
});
