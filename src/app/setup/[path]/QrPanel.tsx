"use client";

import { useCallback } from "react";

/**
 * Shows the generated QR (§7.5) and offers it for download/print/screenshot.
 * The SVG is rendered server-side and passed in as markup; the download button
 * turns it into a Blob so the organizer can save/print the exact same vector.
 */
export function QrPanel({ svg, url }: { svg: string; url: string }) {
  const download = useCallback(() => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "day-of-prayer-qr.svg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }, [svg]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <div
        aria-label="QR code for the submission page"
        role="img"
        style={{ width: 220, height: 220 }}
        // Server-rendered SVG from our own QR library; not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <a
        href={url}
        style={{ fontSize: "0.9rem", color: "#3b5bdb", wordBreak: "break-all" }}
      >
        {url}
      </a>
      <button
        type="button"
        onClick={download}
        style={{
          padding: "0.6rem 1rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          color: "#3b5bdb",
          background: "#fff",
          border: "1px solid #3b5bdb",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Download QR
      </button>
    </div>
  );
}
