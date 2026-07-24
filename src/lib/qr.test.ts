import { describe, expect, it } from "vitest";

import { renderQrSvg } from "@/lib/qr";

describe("renderQrSvg", () => {
  it("produces standalone SVG markup for the given URL", async () => {
    const svg = await renderQrSvg("https://dop.example.com/");
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("</svg>");
  });

  it("encodes different inputs into different matrices", async () => {
    const a = await renderQrSvg("https://dop.example.com/");
    const b = await renderQrSvg("https://other.example.com/");
    expect(a).not.toBe(b);
  });
});
